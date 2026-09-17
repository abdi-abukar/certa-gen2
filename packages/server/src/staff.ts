import 'server-only';
import { createHash } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';
import { isStaff } from '@certa/supabase/policy';
import { isMaster, staffPermissions, staffPermissionKeys, staffPermissionGroups, staffPermissionOptions, type StaffRecord } from '@certa/supabase/staff-policy';
import { cors, principal } from './request';
import { TradingError } from './tradara/contracts';

function revision(user: User) {
  return createHash('sha256').update(JSON.stringify([user.updated_at, user.app_metadata])).digest('hex');
}
function record(user: User): StaffRecord {
  return { id: user.id, email: user.email ?? null, role: isMaster(user.app_metadata) ? 'master' : 'staff', permissions: staffPermissions(user.app_metadata), revision: revision(user) };
}
export function staffMetadata(current: Record<string, unknown>, role: unknown, permissions: unknown, actor: string) {
  if (!['staff', 'master', 'removed'].includes(String(role)) || !Array.isArray(permissions) || permissions.length > 60 || permissions.some(value => typeof value !== 'string' || !staffPermissionOptions.includes(value))) throw new TradingError('invalid_input', 400);
  const metadata = { ...current, role: role === 'master' ? 'super_admin' : role === 'staff' ? 'certa_admin' : 'user', certa_admin: role !== 'removed' };
  for (const key of staffPermissionKeys) {
    const scopes = staffPermissionGroups.filter(group => group.key === key).map(group => group.scope);
    Object.assign(metadata, { [key]: role === 'staff' ? [...new Set(permissions.filter(value => scopes.some(scope => value.startsWith(`${scope}:`))))] : [] });
  }
  return { ...metadata, staff_access_updated_by: actor, staff_access_updated_at: new Date().toISOString() };
}
export async function staffResponse(request: Request) {
  let headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Origin, Cookie' });
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (process.env.CERTA_APP !== 'admin') throw new TradingError('not_found', 404);
    const who = await principal(request, true);
    if (!isMaster(who.metadata)) throw new TradingError('master_required', 403);
    if (!process.env.CERTA_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new TradingError('staff_not_configured', 503);
    const auth = createClient(process.env.CERTA_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) } }).auth.admin;
    const reply = (value: unknown) => Response.json(value, { headers });
    if (request.method === 'GET') {
      const pageValue = new URL(request.url).searchParams.get('page') ?? '1';
      if (!/^[1-9]\d{0,6}$/.test(pageValue)) throw new TradingError('invalid_input', 400);
      const page = Number(pageValue);
      const { data, error } = await auth.listUsers({ page, perPage: 100 });
      if (error) throw new TradingError('staff_unavailable', 503);
      return reply({ items: data.users.filter(user => isStaff(user.app_metadata)).map(record), nextPage: data.nextPage ?? null, actorId: who.id });
    }
    if (request.method !== 'POST') throw new TradingError('method_not_allowed', 405);
    const raw = await request.text();
    if (raw.length > 8192) throw new TradingError('invalid_input', 400);
    let body; try { body = JSON.parse(raw); } catch { throw new TradingError('invalid_input', 400); }
    if (!body || typeof body !== 'object' || Object.keys(body).some(key => !['id', 'role', 'permissions', 'revision'].includes(key)) || typeof body.id !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.id)) throw new TradingError('invalid_input', 400);
    const target = await auth.getUserById(body.id);
    if (target.error || !target.data.user) throw new TradingError('staff_unavailable', 503);
    const user = target.data.user;
    if (!isStaff(user.app_metadata)) throw new TradingError('not_found', 404);
    // Masters are protected, including the current actor: this editor cannot remove the last owner.
    if (isMaster(user.app_metadata) || user.id === who.id) throw new TradingError('protected_master', 403);
    if (body.revision !== revision(user)) throw new TradingError('staff_changed', 409);
    const app_metadata = staffMetadata(user.app_metadata, body.role, body.permissions, who.id);
    const saved = await auth.updateUserById(user.id, { app_metadata });
    if (saved.error || !saved.data.user) throw new TradingError('staff_update_unknown', 503);
    return reply({ item: body.role === 'removed' ? null : record(saved.data.user) });
  } catch (error) {
    const known = error instanceof TradingError;
    return Response.json({ error: known ? error.code : request.method === 'POST' ? 'staff_update_unknown' : 'staff_unavailable' }, { status: known ? error.status : 503, headers });
  }
}
