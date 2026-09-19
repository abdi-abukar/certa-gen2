import 'server-only';
import { cookies } from 'next/headers';
import { SUPPORT_COOKIE, validateSupportSession, type SupportAccess } from './support-access';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { serverConfig, serverSupabase } from './supabase';
import { TradingError } from './tradara/contracts';

export type CustomerSession = { client: SupabaseClient; user: User; sessionId: string; aal: string; bearer: boolean; supportAccess?: SupportAccess };
export function factorMode(user: Pick<User, 'factors'>, aal: string, emailVerified: boolean) {
  const totp = user.factors?.find(f => f.factor_type === 'totp' && f.status === 'verified');
  if (totp) return { mode: 'totp' as const, verified: aal === 'aal2', factorId: totp.id };
  return { mode: 'email' as const, verified: emailVerified, factorId: null };
}
export async function customerSession(request?: Request): Promise<CustomerSession> {
  const authorization = request?.headers.get('authorization');
  const token = authorization?.match(/^Bearer ([^\s]{1,16384})$/i)?.[1];
  if (authorization && !token) throw new TradingError('unauthorized', 401);
  const config = serverConfig();
  const client = token ? createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` }, fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) } }) : await serverSupabase();
  const [{ data, error }, claims] = await Promise.all([client.auth.getUser(token), client.auth.getClaims(token)]);
  const id = claims.data?.claims.session_id;
  if (error || !data.user || claims.error || claims.data?.claims.sub !== data.user.id || typeof id !== 'string' || !/^[\da-f-]{36}$/i.test(id)) throw new TradingError('unauthorized', 401);
  const proof = !token && process.env.CERTA_APP === 'web' ? (await cookies()).get(SUPPORT_COOKIE)?.value : undefined;
  const supportAccess = proof ? await validateSupportSession(proof, data.user, id) : undefined;
  return { client, user: data.user, sessionId: id, aal: String(claims.data?.claims.aal ?? ''), bearer: !!token, supportAccess };
}
export function factorStore() {
  if (!process.env.CERTA_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new TradingError('verification_unavailable', 503);
  return createClient(process.env.CERTA_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10000) }) } });
}
export async function factorRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await factorStore().rpc(`cf_${name}`, args);
  if (error) throw new TradingError('verification_unavailable', 503);
  return data;
}
export async function secondFactorStatus(session: CustomerSession) {
  const trusted = session.user.factors?.some(f => f.factor_type === 'totp' && f.status === 'verified')
    ? await factorRpc('factors', { p_user: session.user.id }) : [];
  if (!Array.isArray(trusted)) throw new TradingError('verification_unavailable', 503);
  const eligible = { factors: session.user.factors?.filter(f => trusted.includes(f.id)) };
  const mode = factorMode(eligible, session.aal, false);
  if (mode.mode === 'totp') {
    const confirmed = mode.verified && await factorRpc('verified_totp', { p_user: session.user.id, p_session: session.sessionId, p_factor: mode.factorId });
    return { ...mode, verified: confirmed === true };
  }
  if (!session.user.email) throw new TradingError('email_required', 403);
  const verified = await factorRpc('verified', { p_user: session.user.id, p_session: session.sessionId, p_email: session.user.email.toLowerCase() });
  return factorMode(eligible, session.aal, verified === true);
}
export async function assertSecondFactor(session: CustomerSession) {
  if (session.supportAccess) return;
  const status = await secondFactorStatus(session);
  if (!status.verified) throw new TradingError('second_factor_required', 403);
}
export function hashChallenge(id: string, user: string, session: string, email: string, code: string) {
  const secret = process.env.CERTA_AUTH_CHALLENGE_SECRET;
  if (!secret || secret.length < 32) throw new TradingError('verification_unavailable', 503);
  return createHmac('sha256', secret).update(JSON.stringify([id, user, session, email.toLowerCase(), code])).digest('hex');
}
export function newChallenge(session: CustomerSession) {
  const id = randomUUID(); const code = String(randomInt(1000000)).padStart(6, '0');
  return { id, code, hash: hashChallenge(id, session.user.id, session.sessionId, session.user.email!, code) };
}

export async function cleanExpiredChallenges() { await factorRpc('cleanup', {}); }
