import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { serverConfig } from './supabase';

export function corsHeaders(request: Request): Headers | null {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Origin' });
  const origin = request.headers.get('origin');
  if (origin) {
    const allowed = (process.env.CERTA_ALLOWED_ORIGINS ?? '').split(',');
    if (!allowed.includes(origin)) return null;
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization');
  }
  return headers;
}

export async function identityResponse(request: Request): Promise<Response> {
  const headers = corsHeaders(request);
  if (!headers) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 16384) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers });
  const config = serverConfig();
  const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims.sub) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers });
    return Response.json({ id: data.claims.sub, email: typeof data.claims.email === 'string' ? data.claims.email : null }, { headers });
  } catch {
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers });
  }
}
