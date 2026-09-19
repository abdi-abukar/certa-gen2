import 'server-only';
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { validCredentials } from '@certa/supabase/policy';
import { cors } from '../request';
import { serverSupabase } from '../supabase';
import { factorStore } from '../second-factor';
import { sendSignupChallenge } from '../email/triggers';
import { TradingError, exact, object, readBody, string, uuid } from '../tradara/contracts';
import { isAcceptedCountry } from './countries';
import { validateUsername } from './username';

/** Guest signup: availability check, mailbox proof, then account creation with a verified first session. */
function secret() {
  const value = process.env.CERTA_AUTH_CHALLENGE_SECRET;
  if (!value || value.length < 32) throw new TradingError('signup_unavailable', 503);
  return value;
}
function keyed(parts: unknown[]) { return createHmac('sha256', secret()).update(JSON.stringify(parts)).digest('hex'); }
export function hashSignupCode(id: string, email: string, code: string) { return keyed(['signup-code', id, email.toLowerCase(), code]); }
export function hashSignupProof(id: string, email: string, proof: string) { return keyed(['signup-proof', id, email.toLowerCase(), proof]); }
function hashAddress(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return keyed(['signup-address', forwarded]);
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await factorStore().rpc(`cu_${name}`, args);
  if (error) throw new TradingError('signup_unavailable', 503);
  return data;
}
export function canonicalEmail(value: unknown): string {
  const email = string(value, 'email', 254).toLowerCase();
  if (!validCredentials(email, 'placeholder')) throw new TradingError('invalid_email', 400);
  return email;
}
function legalName(value: unknown, field: string) {
  // Strip control characters; the name must be a real, printable value.
  const name = string(value, field, 60).split('').filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').trim();
  if (!name) throw new TradingError(`invalid_${field}`, 400);
  return name;
}
export function mask(email: string) { return email.replace(/^(.).*(@.*)$/, '$1***$2'); }

export async function signupResponse(request: Request, segments: string[]) {
  let headers = new Headers({ 'Cache-Control': 'private, no-store' });
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (process.env.CERTA_APP !== 'web') throw new TradingError('not_found', 404);
    const path = segments.join('/');
    const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
    if (request.method === 'GET' && path === 'username') {
      const checked = validateUsername(new URL(request.url).searchParams.get('username')?.slice(0, 64) ?? '');
      if (!checked.ok) return reply({ available: false, error: checked.error });
      const available = await rpc('username_available', { p_username: checked.username });
      return reply(available === true ? { available: true, username: checked.username } : { available: false, username: checked.username, error: 'That @ is taken. Try another.' });
    }
    if (request.method !== 'POST') throw new TradingError('method_not_allowed', 405);
    let body; try { body = object(JSON.parse(new TextDecoder().decode(await readBody(request, 8192)))); } catch { throw new TradingError('invalid_input', 400); }
    if (path === 'email/send') {
      exact(body, ['email']);
      const email = canonicalEmail(body.email);
      if (process.env.EMAIL_DELIVERY_MODE !== 'live') throw new TradingError('email_delivery_disabled', 503);
      if (await rpc('email_registered', { p_email: email }) === true) throw new TradingError('account_exists', 409);
      const id = randomUUID(); const code = String(randomInt(1000000)).padStart(6, '0');
      const begin = await rpc('signup_begin', { p_email: email, p_ip_hash: hashAddress(request), p_id: id, p_hash: hashSignupCode(id, email, code) });
      if (begin?.state !== 'created') throw new TradingError('rate_limited', 429);
      try {
        await sendSignupChallenge({ id, email, data: { code, expiresInMinutes: 10 } });
        await rpc('signup_delivery', { p_id: id, p_accepted: true });
      } catch {
        await rpc('signup_delivery', { p_id: id, p_accepted: false });
        throw new TradingError('email_delivery_unavailable', 503);
      }
      return reply({ challengeId: id, expiresInSeconds: 600, email: mask(email) });
    }
    if (path === 'email/verify') {
      exact(body, ['challengeId', 'email', 'code']);
      const email = canonicalEmail(body.email); const id = uuid(body.challengeId);
      if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new TradingError('invalid_code', 400);
      const proof = randomBytes(32).toString('hex');
      const verified = await rpc('signup_verify', { p_email: email, p_id: id, p_hash: hashSignupCode(id, email, body.code), p_proof_hash: hashSignupProof(id, email, proof) });
      if (verified !== true) throw new TradingError('invalid_or_expired_code', 400);
      return reply({ verified: true, proof });
    }
    if (path === 'create') {
      exact(body, ['firstName', 'lastName', 'username', 'country', 'email', 'password', 'acceptedTerms', 'challengeId', 'proof']);
      const firstName = legalName(body.firstName, 'first_name'); const lastName = legalName(body.lastName, 'last_name');
      const checked = validateUsername(string(body.username, 'username', 64));
      if (!checked.ok) throw new TradingError('invalid_username', 400);
      if (!isAcceptedCountry(body.country)) throw new TradingError('country_unavailable', 400);
      const email = canonicalEmail(body.email);
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 1024) throw new TradingError('invalid_password', 400);
      if (body.acceptedTerms !== true) throw new TradingError('terms_required', 400);
      const id = uuid(body.challengeId); const proof = string(body.proof, 'proof', 128);
      if (await rpc('signup_claim', { p_email: email, p_id: id, p_proof_hash: hashSignupProof(id, email, proof) }) !== true) throw new TradingError('email_not_verified', 400);
      const release = () => rpc('signup_release', { p_email: email, p_id: id }).catch(() => undefined);
      if (await rpc('username_available', { p_username: checked.username }) !== true) { await release(); throw new TradingError('username_taken', 409); }
      const admin = factorStore();
      // Mailbox ownership was proven above; the account is created confirmed, as the original did.
      const created = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true, user_metadata: { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`, username: checked.username, country: body.country, signup_source: 'web' } });
      if (created.error || !created.data.user) { await release(); throw new TradingError(/already|exists|registered/i.test(created.error?.message ?? '') ? 'account_exists' : 'signup_unavailable', created.error?.status === 422 ? 409 : 503); }
      const registered = await rpc('register', { p_user: created.data.user.id, p_username: checked.username, p_first: firstName, p_last: lastName, p_country: body.country });
      if (registered?.state !== 'registered') {
        // Nothing else references the user yet; remove it so the @ can be chosen again.
        await admin.auth.admin.deleteUser(created.data.user.id).catch(() => undefined); await release();
        throw new TradingError('username_taken', 409);
      }
      // Sign the new trader in on this browser and honor the mailbox proof as this session's second factor.
      const client = await serverSupabase();
      const signedIn = await client.auth.signInWithPassword({ email, password: body.password });
      if (signedIn.error || !signedIn.data.session || signedIn.data.user?.id !== created.data.user.id) return reply({ created: true, signedIn: false });
      const claims = await client.auth.getClaims(signedIn.data.session.access_token);
      const sessionId = claims.data?.claims.session_id;
      if (!claims.error && claims.data?.claims.sub === created.data.user.id && typeof sessionId === 'string') await rpc('grant_session', { p_user: created.data.user.id, p_session: uuid(sessionId), p_email: email }).catch(() => undefined);
      revalidatePath('/', 'layout');
      return reply({ created: true, signedIn: true, next: '/account' });
    }
    throw new TradingError('not_found', 404);
  } catch (error) {
    return Response.json({ error: error instanceof TradingError ? error.code : 'signup_unavailable' }, { status: error instanceof TradingError ? error.status : 503, headers });
  }
}
