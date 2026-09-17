import { corsHeaders, identityResponse } from '@certa/server/api';
export const GET = identityResponse;
export async function OPTIONS(request: Request) {
  const headers = corsHeaders(request);
  return new Response(null, { status: headers ? 204 : 403, headers: headers ?? { 'Cache-Control': 'no-store' } });
}
