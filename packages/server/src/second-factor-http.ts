import 'server-only';
import { cors } from './request';
import { customerSession, assertSecondFactor, secondFactorStatus, factorRpc, hashChallenge, newChallenge } from './second-factor';
import { TradingError, exact, object, readBody, uuid } from './tradara/contracts';
import { sendLoginChallenge } from './email/triggers';

export async function secondFactorResponse(request: Request, segments: string[]) {
  let headers = new Headers({ 'Cache-Control': 'private, no-store' });
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (process.env.CERTA_APP !== 'web') throw new TradingError('not_found', 404);
    const session = await customerSession(request);
    if (session.supportAccess) throw new TradingError('support_security_changes_denied', 403);
    const path = segments.join('/');
    const reply = (value: unknown) => Response.json(value, { headers });
    // Revocation must remain available before verification (including an interrupted login).
    if (request.method === 'POST' && path === 'session/clear') {
      exact(object(JSON.parse(new TextDecoder().decode(await readBody(request, 4096)))), []);
      await factorRpc('clear', { p_user: session.user.id, p_session: session.sessionId });
      return reply({ cleared: true });
    }
    const status = await secondFactorStatus(session);
    if (request.method === 'GET' && path === 'status') return reply({ ...status, email: session.user.email?.replace(/^(.).*(@.*)$/, '$1***$2') });
    if (request.method !== 'POST') throw new TradingError('method_not_allowed', 405);
    let body; try { body = object(JSON.parse(new TextDecoder().decode(await readBody(request, 4096)))); } catch { throw new TradingError('invalid_input', 400); }
    if (path === 'email/send') {
      exact(body, []);
      if (status.mode !== 'email') throw new TradingError('authenticator_required', 409);
      if (process.env.EMAIL_DELIVERY_MODE !== 'live') throw new TradingError('email_delivery_disabled', 503);
      const challenge = newChallenge(session);
      const begin = await factorRpc('begin', { p_user: session.user.id, p_session: session.sessionId, p_email: session.user.email!.toLowerCase(), p_id: challenge.id, p_hash: challenge.hash });
      if (begin.state !== 'created') throw new TradingError('rate_limited', 429);
      try {
        await sendLoginChallenge({ id: challenge.id, user: session.user, data: { code: challenge.code, expiresInMinutes: 10 } });
        await factorRpc('delivery', { p_id: challenge.id, p_user: session.user.id, p_accepted: true });
      } catch {
        await factorRpc('delivery', { p_id: challenge.id, p_user: session.user.id, p_accepted: false });
        throw new TradingError('email_delivery_unavailable', 503);
      }
      return reply({ challengeId: challenge.id, expiresInSeconds: 600 });
    }
    if (path === 'email/verify') {
      exact(body, ['challengeId', 'code']);
      if (status.mode !== 'email') throw new TradingError('authenticator_required', 409);
      if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new TradingError('invalid_code', 400);
      const id = uuid(body.challengeId);
      const verified = await factorRpc('verify', { p_user: session.user.id, p_session: session.sessionId, p_email: session.user.email!.toLowerCase(), p_id: id, p_hash: hashChallenge(id, session.user.id, session.sessionId, session.user.email!, body.code) });
      if (!verified) throw new TradingError('invalid_or_expired_code', 400);
      return reply({ verified: true });
    }
    if (path === 'totp/verify') {
      exact(body, ['factorId', 'code']);
      const id = uuid(body.factorId);
      if (!session.user.factors?.some(f => f.id === id && f.factor_type === 'totp')) throw new TradingError('not_found', 404);
      const trusted = await factorRpc('factors', { p_user: session.user.id });
      if (!Array.isArray(trusted) || !trusted.includes(id)) throw new TradingError('unrecognized_authenticator', 403);
      // A pending enrollment can only be completed after the current factor was satisfied.
      if (!session.user.factors.some(f => f.id === id && f.status === 'verified')) await assertSecondFactor(session);
      if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new TradingError('invalid_code', 400);
      const result = await session.client.auth.mfa.challengeAndVerify({ factorId: id, code: body.code });
      if (result.error || !result.data) throw new TradingError('invalid_or_expired_code', 400);
      // AAL2 alone does not identify which factor produced it. Bind our own proof
      // to the trusted factor just verified, including native rotated session IDs.
      const claims = await session.client.auth.getClaims(result.data.access_token);
      const verifiedSession = claims.data?.claims.session_id;
      if (claims.error || claims.data?.claims.sub !== session.user.id || claims.data?.claims.aal !== 'aal2' || typeof verifiedSession !== 'string') throw new TradingError('verification_unavailable', 503);
      await factorRpc('prove_totp', { p_user: session.user.id, p_session: uuid(verifiedSession), p_factor: id });
      return reply({ verified: true, ...(session.bearer ? { session: { access_token: result.data.access_token, refresh_token: result.data.refresh_token } } : {}) });
    }
    if (path === 'totp/enroll') {
      exact(body, []); await assertSecondFactor(session);
      if (status.mode === 'totp') throw new TradingError('authenticator_already_enabled', 409);
      for (const factor of session.user.factors ?? []) {
        if (factor.factor_type === 'totp' && factor.status === 'unverified') {
          const removed = await session.client.auth.mfa.unenroll({ factorId: factor.id });
          if (removed.error) throw new TradingError('verification_unavailable', 503);
          await factorRpc('remove_factor', { p_user: session.user.id, p_factor: factor.id });
        }
      }
      const result = await session.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Certa Futures' });
      if (result.error || !result.data) throw new TradingError('verification_unavailable', 503);
      await factorRpc('trust_factor', { p_user: session.user.id, p_factor: result.data.id });
      return reply({ factorId: result.data.id, secret: result.data.totp.secret, qr: result.data.totp.qr_code });
    }
    if (path === 'totp/remove') {
      exact(body, ['factorId']); await assertSecondFactor(session);
      const id = uuid(body.factorId);
      if (!session.user.factors?.some(f => f.id === id && f.factor_type === 'totp')) throw new TradingError('not_found', 404);
      const result = await session.client.auth.mfa.unenroll({ factorId: id });
      if (result.error) throw new TradingError('verification_unavailable', 503);
      await factorRpc('remove_factor', { p_user: session.user.id, p_factor: id });
      await factorRpc('clear', { p_user: session.user.id, p_session: session.sessionId });
      return reply({ removed: true, next: '/verify' });
    }
    throw new TradingError('not_found', 404);
  } catch (error) {
    return Response.json({ error: error instanceof TradingError ? error.code : 'verification_unavailable' }, { status: error instanceof TradingError ? error.status : 503, headers });
  }
}
