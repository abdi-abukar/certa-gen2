import 'server-only';
import { createHash } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';
import { isStaff } from '@certa/supabase/policy';
import { isMaster, productionStaffPages, canViewStaff, usesProductionStaffPages, hasLegacyFullAccess, staffPermissions, staffPermissionKeys, staffPermissionGroups, staffPermissionOptions, type StaffRecord } from '@certa/supabase/staff-policy';
import { cors, principal } from './request';
import { TradingError } from './tradara/contracts';

function revision(user: User) {
  return createHash('sha256').update(JSON.stringify(user.app_metadata, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)).digest('hex');
}
function record(user: User): StaffRecord {
  return { id: user.id, email: user.email ?? null, role: isMaster(user.app_metadata) ? 'master' : 'staff', permissions: staffPermissions(user.app_metadata), revision: revision(user), ...(usesProductionStaffPages(user.app_metadata) ? { productionPages: hasLegacyFullAccess(user.app_metadata) || isMaster(user.app_metadata) ? null : Array.isArray(user.app_metadata.certa_pages) ? user.app_metadata.certa_pages.filter((page: unknown): page is string => typeof page === 'string') : [] } : {}) };
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
export function productionStaffMetadata(current: Record<string, unknown>, role: unknown, pages: unknown, actor: string) {
  if (!['staff', 'master', 'removed'].includes(String(role)) || (pages !== null && (!Array.isArray(pages) || pages.some(page => !productionStaffPages.includes(page))))) throw new TradingError('invalid_input', 400);
  return { ...current, role: role === 'master' ? 'super_admin' : role === 'staff' ? 'certa_admin' : 'user', certa_admin: role !== 'removed', certa_pages: role === 'removed' ? [] : pages === null ? '*' : [...new Set(pages)], staff_access_updated_by: actor, staff_access_updated_at: new Date().toISOString() };
}
export async function staffResponse(request: Request) {
  let headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Origin, Cookie' });
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (process.env.CERTA_APP !== 'admin') throw new TradingError('not_found', 404);
    const who = await principal(request, true);
    if (!canViewStaff(who.metadata)) throw new TradingError('staff_directory_denied', 403);
    if (!process.env.CERTA_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new TradingError('staff_not_configured', 503);
    const client = createClient(process.env.CERTA_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) } });
    const auth = client.auth.admin;
    const reply = (value: unknown) => Response.json(value, { headers });
    if (request.method === 'GET') {
      const pageValue = new URL(request.url).searchParams.get('page') ?? '1';
      if (!/^[1-9]\d{0,6}$/.test(pageValue)) throw new TradingError('invalid_input', 400);
      const page = Number(pageValue);
      // The production lookup filters auth.users before returning records; do
      // not scan pages of customers and mistake a customer-only page for no staff.
      const { data, error } = await client.rpc('work_staff_lookup', { p_email: null });
      if (error || !Array.isArray(data)) throw new TradingError('staff_unavailable', 503);
      const staff = data.filter(user => user && typeof user.id === 'string' && isStaff(user.app_metadata));
      const start = (page - 1) * 100;
      return reply({ items: staff.slice(start, start + 100).map(record), nextPage: start + 100 < staff.length ? page + 1 : null, actorId: who.id, canEdit: true, canPromote: isMaster(who.metadata) });
    }
    if (request.method !== 'POST') throw new TradingError('method_not_allowed', 405);
    const raw = await request.text();
    if (raw.length > 8192) throw new TradingError('invalid_input', 400);
    let body; try { body = JSON.parse(raw); } catch { throw new TradingError('invalid_input', 400); }
    if (!body || typeof body !== 'object' || Object.keys(body).some(key => !['id', 'role', 'permissions', 'productionPages', 'revision'].includes(key)) || typeof body.id !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.id)) throw new TradingError('invalid_input', 400);
    const target = await auth.getUserById(body.id);
    if (target.error || !target.data.user) throw new TradingError('staff_unavailable', 503);
    const user = target.data.user;
    if (!isStaff(user.app_metadata)) throw new TradingError('not_found', 404);
    // Masters are protected, including the current actor: this editor cannot remove the last owner.
    if (isMaster(user.app_metadata) || user.id === who.id) throw new TradingError('protected_master', 403);
    if (body.role === 'master' && !isMaster(who.metadata)) throw new TradingError('master_required', 403);
    if (body.revision !== revision(user)) throw new TradingError('staff_changed', 409);
    const production = usesProductionStaffPages(user.app_metadata);
    if (production !== Object.hasOwn(body, 'productionPages')) throw new TradingError('invalid_input', 400);
    const app_metadata = production
      ? productionStaffMetadata(user.app_metadata, body.role, body.productionPages, who.id)
      : staffMetadata(user.app_metadata, body.role, body.permissions, who.id);
    const saved = await auth.updateUserById(user.id, { app_metadata });
    if (saved.error || !saved.data.user) throw new TradingError('staff_update_unknown', 503);
    return reply({ item: body.role === 'removed' ? null : record(saved.data.user) });
  } catch (error) {
    const known = error instanceof TradingError;
    return Response.json({ error: known ? error.code : request.method === 'POST' ? 'staff_update_unknown' : 'staff_unavailable' }, { status: known ? error.status : 503, headers });
  }
}
