import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { isStaff } from '@certa/supabase/policy';
import { serverSupabase } from './supabase';

export const requireIdentity = cache(async () => {
  const client = await serverSupabase();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims.sub) redirect('/login');
  return { id: data.claims.sub, email: typeof data.claims.email === 'string' ? data.claims.email : null };
});

export const requireStaff = cache(async () => {
  const client = await serverSupabase();
  // Staff roles must reflect current server-managed metadata, including revocation.
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect('/login');
  if (!isStaff(user.app_metadata)) redirect('/forbidden');
  return { id: user.id, email: user.email ?? null };
});
