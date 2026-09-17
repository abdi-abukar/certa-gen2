import { serverSupabase } from '@certa/server/supabase';
import { safeNext } from '@certa/supabase/policy';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const origin = process.env.CERTA_APP_ORIGIN!;
  if (code && code.length <= 2048) {
    const client = await serverSupabase();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return Response.redirect(new URL(safeNext(url.searchParams.get('next')), origin), 303);
  }
  return Response.redirect(new URL('/auth/error', origin), 303);
}
