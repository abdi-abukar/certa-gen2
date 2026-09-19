import 'server-only';

import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';
import { isStaff } from '@certa/supabase/policy';
import { isMaster, staffPermissions } from '@certa/supabase/staff-policy';
import { TradingError, uuid } from './tradara/contracts';

export const SUPPORT_COOKIE = 'certa-web-support';
export const SUPPORT_LINK_SECONDS = 300;
export const SUPPORT_SESSION_SECONDS = 1800;
type Purpose = 'link' | 'session';
export type SupportGrant = { actor: string; target: string; expires: number; id: string; tokenHash: string };
export type SupportProof = { actor: string; target: string; expires: number; id: string; session: string };
export type SupportAccess = { actorId: string; expiresAt: string };

export function canSupport(metadata: Record<string, unknown>, action: 'read' | 'login') {
  return isStaff(metadata) && (isMaster(metadata) || staffPermissions(metadata).some(permission => permission === 'support:*' || permission === `support:${action}`));
}
export function supportClient() {
  if (!process.env.CERTA_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new TradingError('support_not_configured', 503);
  return createClient(process.env.CERTA_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) },
  });
}
function key() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret || !process.env.CERTA_SUPABASE_URL) throw new TradingError('support_not_configured', 503);
  // Derive a separate key for this purpose; the service credential never enters a link or cookie.
  return createHmac('sha256', secret).update(`certa:support-access:v1:${process.env.CERTA_SUPABASE_URL}`).digest();
}
export function sealSupport(value: SupportGrant | SupportProof, purpose: Purpose) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`certa-support:${purpose}:v1`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function openSupport<T extends SupportGrant | SupportProof>(token: string, purpose: Purpose, now = Date.now()): T {
  try {
    if (!/^[A-Za-z0-9_-]{80,4096}$/.test(token)) throw new Error();
    const bytes = Buffer.from(token, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    decipher.setAAD(Buffer.from(`certa-support:${purpose}:v1`));
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    uuid(value.actor); uuid(value.target); uuid(value.id);
    const maximum = purpose === 'link' ? SUPPORT_LINK_SECONDS : SUPPORT_SESSION_SECONDS;
    if (value.actor === value.target || !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires > now + maximum * 1000) throw new Error();
    if (purpose === 'link') { if (typeof value.tokenHash !== 'string' || !/^[a-f0-9]{32,256}$/i.test(value.tokenHash)) throw new Error(); }
    else uuid(value.session);
    return value;
  } catch { throw new TradingError('support_link_invalid_or_expired', 403); }
}
export function supportTargetAllowed(user: User) {
  return !isStaff(user.app_metadata) && !!user.email && !!user.email_confirmed_at && !(Date.parse(user.banned_until ?? '') > Date.now());
}
export async function assertSupportActor(actorId: string) {
  const { data, error } = await supportClient().auth.admin.getUserById(actorId);
  if (error || !data.user || Date.parse(data.user.banned_until ?? '') > Date.now() || !canSupport(data.user.app_metadata, 'login')) throw new TradingError('support_access_revoked', 403);
}
export async function validateSupportSession(token: string, user: User, sessionId: string): Promise<SupportAccess> {
  const proof = openSupport<SupportProof>(token, 'session');
  if (proof.target !== user.id || proof.session !== sessionId || !supportTargetAllowed(user)) throw new TradingError('support_session_invalid', 403);
  await assertSupportActor(proof.actor);
  return { actorId: proof.actor, expiresAt: new Date(proof.expires).toISOString() };
}
export async function createSupportLink(actorId: string, targetId: string) {
  const target = await supportClient().auth.admin.getUserById(uuid(targetId));
  if (target.error || !target.data.user) throw new TradingError('trader_not_found', 404);
  const user = target.data.user;
  if (actorId === user.id || !supportTargetAllowed(user)) throw new TradingError('support_target_unavailable', 403);
  const origin = process.env.CERTA_WEB_ORIGIN;
  if (!origin) throw new TradingError('support_not_configured', 503);
  const link = await supportClient().auth.admin.generateLink({ type: 'magiclink', email: user.email! });
  if (link.error || !link.data.properties?.hashed_token || link.data.user.id !== user.id) throw new TradingError('support_link_unavailable', 503);
  const grant: SupportGrant = { actor: actorId, target: user.id, expires: Date.now() + SUPPORT_LINK_SECONDS * 1000, id: randomUUID(), tokenHash: link.data.properties.hashed_token };
  const url = new URL('/auth/support', origin);
  url.hash = sealSupport(grant, 'link');
  // Safe correlation fields only. Never log the URL, email, OTP or session tokens.
  console.info(JSON.stringify({ event: 'support_link_created', actor: actorId, target: user.id, access: grant.id }));
  return { url: url.href, expiresAt: new Date(grant.expires).toISOString(), email: user.email };
}
