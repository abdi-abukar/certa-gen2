import 'server-only';
import type { User } from '@supabase/supabase-js';
import { isStaff } from '@certa/supabase/policy';
import { cors, principal } from './request';
import { TradingError, exact, object, readBody, uuid } from './tradara/contracts';
import { canSupport, createSupportLink, supportClient, supportTargetAllowed } from './support-access';

function trader(user: User) {
  const metadata = user.user_metadata ?? {};
  const name = [metadata.legal_name, metadata.full_name, [metadata.first_name, metadata.last_name].filter(part => typeof part === 'string').join(' ')].find(value => typeof value === 'string' && value.trim());
  return { id: user.id, email: user.email ?? '', name: typeof name === 'string' ? name.slice(0, 150) : null, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at ?? null, canLogin: supportTargetAllowed(user) };
}
export async function tradersResponse(request: Request) {
  let headers = new Headers({ 'Cache-Control': 'private, no-store' });
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (process.env.CERTA_APP !== 'admin') throw new TradingError('not_found', 404);
    const who = await principal(request, true);
    const action = request.method === 'POST' ? 'login' : 'read';
    if (!canSupport(who.metadata, action)) throw new TradingError('support_permission_denied', 403);
    if (request.method === 'POST') {
      let body; try { body = object(JSON.parse(new TextDecoder().decode(await readBody(request, 1024)))); } catch { throw new TradingError('invalid_input', 400); }
      exact(body, ['userId']);
      return Response.json(await createSupportLink(who.id, uuid(body.userId)), { headers });
    }
    if (request.method !== 'GET') throw new TradingError('method_not_allowed', 405);
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const pageValue = url.searchParams.get('page') ?? '1';
    if (q.length > 150 || !/^[1-9]\d{0,5}$/.test(pageValue)) throw new TradingError('invalid_input', 400);
    const page = Number(pageValue);
    let users: User[];
    let nextPage: number | null = null;
    if (/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(q)) {
      const result = await supportClient().auth.admin.getUserById(q);
      if (result.error && result.error.status !== 404) throw new TradingError('traders_unavailable', 503);
      users = result.data.user ? [result.data.user] : [];
    } else {
      supportClient(); // Validate configuration before forming the vendor request.
      // GoTrue's admin endpoint supports server-side email filtering, unlike the SDK's listUsers wrapper.
      const endpoint = new URL(`${process.env.CERTA_SUPABASE_URL!.replace(/\/$/, '')}/auth/v1/admin/users`);
      endpoint.search = new URLSearchParams({ page: String(page), per_page: '50', filter: q }).toString();
      const response = await fetch(endpoint, { headers: { apikey: process.env.SUPABASE_SECRET_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new TradingError('traders_unavailable', 503);
      const body = await response.json();
      if (!Array.isArray(body.users)) throw new TradingError('traders_unavailable', 503);
      users = body.users;
      nextPage = users.length === 50 ? page + 1 : null;
    }
    return Response.json({ items: users.filter(user => !isStaff(user.app_metadata)).map(trader), nextPage, canLogin: canSupport(who.metadata, 'login') }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof TradingError ? error.code : 'traders_unavailable' }, { status: error instanceof TradingError ? error.status : 503, headers });
  }
}
