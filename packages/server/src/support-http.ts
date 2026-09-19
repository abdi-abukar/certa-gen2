import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { serverConfig, serverSupabase, cookieOptions } from './supabase';
import { cors } from './request';
import { TradingError, exact, object, readBody, uuid } from './tradara/contracts';
import { SUPPORT_COOKIE, SUPPORT_SESSION_SECONDS, assertSupportActor, openSupport, sealSupport, supportClient, supportTargetAllowed, type SupportGrant, type SupportProof } from './support-access';

export async function supportLoginResponse(request: Request) {
  let headers = new Headers({ 'Cache-Control': 'private, no-store' });
  try {
    headers = cors(request);
    if (process.env.CERTA_APP !== 'web') throw new TradingError('not_found', 404);
    if (request.method !== 'POST') throw new TradingError('method_not_allowed', 405);
    // No normal session is replaced, even if the link is accidentally opened in an ordinary tab.
    const jar = await cookies(); const authCookie = cookieOptions().name;
    if (jar.getAll().some(cookie => cookie.name === authCookie || cookie.name.startsWith(`${authCookie}.`))) throw new TradingError('private_window_required', 409);
    let body; try { body = object(JSON.parse(new TextDecoder().decode(await readBody(request, 6144)))); } catch { throw new TradingError('invalid_input', 400); }
    exact(body, ['token']);
    if (typeof body.token !== 'string') throw new TradingError('invalid_input', 400);
    const grant = openSupport<SupportGrant>(body.token, 'link');
    await assertSupportActor(grant.actor);
    const target = await supportClient().auth.admin.getUserById(grant.target);
    if (target.error || !target.data.user || !supportTargetAllowed(target.data.user)) throw new TradingError('support_target_unavailable', 403);
    const config = serverConfig();
    // Verify on an isolated client first. No cookies are installed for a wrong or incomplete result.
    const isolated = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) } });
    const verified = await isolated.auth.verifyOtp({ token_hash: grant.tokenHash, type: 'magiclink' });
    const session = verified.data.session;
    if (verified.error || !session || verified.data.user?.id !== grant.target) throw new TradingError('support_link_invalid_or_expired', 403);
    const claims = await isolated.auth.getClaims(session.access_token);
    if (claims.error || claims.data?.claims.sub !== grant.target) throw new TradingError('support_link_invalid_or_expired', 403);
    const sessionId = uuid(claims.data.claims.session_id);
    const proof: SupportProof = { actor: grant.actor, target: grant.target, id: grant.id, session: sessionId, expires: Date.now() + SUPPORT_SESSION_SECONDS * 1000 };
    const client = await serverSupabase();
    const installed = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (installed.error) throw new TradingError('support_session_unavailable', 503);
    jar.set(SUPPORT_COOKIE, sealSupport(proof, 'session'), { httpOnly: true, secure: cookieOptions().secure, sameSite: 'lax', path: '/', maxAge: SUPPORT_SESSION_SECONDS });
    console.info(JSON.stringify({ event: 'support_session_started', actor: grant.actor, target: grant.target, access: grant.id }));
    return Response.json({ next: '/account' }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof TradingError ? error.code : 'support_session_unavailable' }, { status: error instanceof TradingError ? error.status : 503, headers });
  }
}
