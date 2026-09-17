import { serverSupabase } from '@certa/server/supabase';
import { isStaff } from '@certa/supabase/policy';
import { checkVendorHealth, findVendor } from '@certa/server/vendors';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ vendor: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  const client = await serverSupabase();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return Response.json({ error: 'Authentication required.' }, { status: 401, headers });
  if (!isStaff(user.app_metadata)) return Response.json({ error: 'Staff access required.' }, { status: 403, headers });
  const vendor = findVendor((await params).vendor);
  if (!vendor) return Response.json({ error: 'Unknown vendor.' }, { status: 404, headers });
  const health = await checkVendorHealth(vendor.id);
  return Response.json({ ...health, scope: vendor.scope, integration: vendor.lifecycle }, { status: health.status === 'healthy' ? 200 : 503, headers });
}
