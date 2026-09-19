import 'server-only';
import { customerSession, assertSecondFactor } from './second-factor';
import { TradingError } from './tradara/contracts';

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
  try {
    const session = await customerSession(request);
    await assertSecondFactor(session);
    return Response.json({ id: session.user.id, email: session.user.email ?? null }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof TradingError ? error.code : 'Unauthorized.' }, { status: error instanceof TradingError ? error.status : 401, headers });
  }
}
