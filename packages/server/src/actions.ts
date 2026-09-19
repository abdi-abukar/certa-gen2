'use server';

import { cookies } from 'next/headers';
import { SUPPORT_COOKIE } from './support-access';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { validCredentials } from '@certa/supabase/policy';
import { serverSupabase } from './supabase';
import { requireIdentity, requireStaff } from './auth';
import { customerSession, factorRpc, secondFactorStatus } from './second-factor';

export type AuthState = { error?: string; message?: string; step?: 'second-factor' };

export async function signIn(_state: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!validCredentials(email, password)) return { error: 'Enter a valid email and password.' };
  if (process.env.CERTA_APP === 'web') (await cookies()).delete(SUPPORT_COOKIE);
  const client = await serverSupabase();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Unable to sign in. Check your details and try again.' };
  revalidatePath('/', 'layout');
  // Staff keep the existing password + deployment Access policy and land straight on the app.
  if (process.env.CERTA_APP !== 'web') redirect('/account');
  // A customer's password alone is not admission. Report the outstanding factor so the caller
  // can complete it in place; an unreadable factor store must not look like a verified session.
  let verified = false;
  try { verified = (await secondFactorStatus(await customerSession())).verified; }
  catch { return { step: 'second-factor' }; }
  if (verified) redirect('/account');
  return { step: 'second-factor' };
}

export async function signUp(_state: AuthState, form: FormData): Promise<AuthState> {
  if (process.env.CERTA_APP !== 'web') return { error: 'Registration is unavailable here.' };
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!validCredentials(email, password) || password.length < 8) return { error: 'Use a valid email and a password of at least 8 characters.' };
  const client = await serverSupabase();
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${process.env.CERTA_APP_ORIGIN}/auth/callback` } });
  if (error) return { error: 'Unable to create an account. Please try again later.' };
  if (data.session) { revalidatePath('/', 'layout'); redirect('/account'); }
  return { message: 'Check your email to confirm your account. If you already have an account, sign in.' };
}

export async function signOut(): Promise<void> {
  if (process.env.CERTA_APP === 'web') {
    try { const session = await customerSession(); if (session.supportAccess) console.info(JSON.stringify({ event: 'support_session_ended', actor: session.supportAccess.actorId, target: session.user.id })); else await factorRpc('clear', { p_user: session.user.id, p_session: session.sessionId }); }
    catch { /* Always allow local sign-out even if the verification store is unavailable. */ }
  }
  const client = await serverSupabase();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (process.env.CERTA_APP === 'web') (await cookies()).delete(SUPPORT_COOKIE);
  if (error) throw new Error('Unable to sign out. Please try again.');
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function recoverPassword(_state: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();
  if (!validCredentials(email, 'placeholder')) return { error: 'Enter a valid email.' };
  const client = await serverSupabase();
  await client.auth.resetPasswordForEmail(email, { redirectTo: `${process.env.CERTA_APP_ORIGIN}/auth/callback?next=/reset-password` });
  return { message: 'If an account exists for this email, you will receive a password reset link.' };
}

export async function updatePassword(_state: AuthState, form: FormData): Promise<AuthState> {
  if (process.env.CERTA_APP === 'admin') await requireStaff();
  else if ((await requireIdentity()).supportAccess) return { error: 'End support access before changing account security.' };
  const password = String(form.get('password') ?? '');
  if (password.length < 8 || password.length > 1024) return { error: 'Use a password between 8 and 1024 characters.' };
  const client = await serverSupabase();
  const { error } = await client.auth.updateUser({ password });
  if (error) return { error: 'Unable to update your password. Request a new reset link and try again.' };
  revalidatePath('/', 'layout');
  redirect('/account');
}
