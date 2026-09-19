import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { isStaff } from '@certa/supabase/policy';
import { cookieOptions, serverSupabase } from './supabase';
import { customerSession, assertSecondFactor } from './second-factor';

/** Navigation and protected pages share the same completed-sign-in requirement. */
export const hasCustomerSession = cache(async () => {
  const name = cookieOptions().name;
  const jar = await cookies();
  // Public visitors must not trigger an auth/vendor lookup just to render a header.
  if (!jar.getAll().some(cookie => cookie.name === name || cookie.name.startsWith(`${name}.`))) return false;
  try { await assertSecondFactor(await customerSession()); return true; }
  catch { return false; }
});

function accountPresentation(user: User) {
  const metadata = user.user_metadata ?? {};
  const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 150) : null;
  const raw = metadata.certa_avatar;
  const avatar = raw && typeof raw === 'object' ? Object.fromEntries(['skinTone','hairColor','outfitColor','hair','outfit','accessory','glasses','facialHair','background'].map(key => [key, text(raw[key])])) : {};
  return { id: user.id, email: user.email ?? null, name: text(metadata.full_name) ?? text(metadata.first_name), username: text(metadata.username), country: text(metadata.country), avatar };
}
const staffUser = cache(async () => {
  const jar = await cookies(); const name = cookieOptions().name;
  if (!jar.getAll().some(cookie => cookie.name === name || cookie.name.startsWith(`${name}.`))) return null;
  const { data, error } = await (await serverSupabase()).auth.getUser();
  return error ? null : data.user;
});
export const currentStaffAccount = cache(async () => {
  const user = await staffUser();
  return user && isStaff(user.app_metadata) ? accountPresentation(user) : null;
});

export const requireIdentity = cache(async () => {
  let session;
  try { session = await customerSession(); } catch { redirect('/login'); }
  try { await assertSecondFactor(session); } catch { redirect('/login'); }
  return { ...accountPresentation(session.user), supportAccess: session.supportAccess ?? null };
});

export const requireStaff = cache(async () => {
  const user = await staffUser();
  if (!user) redirect('/login');
  if (!isStaff(user.app_metadata)) redirect('/forbidden');
  return accountPresentation(user);
});
