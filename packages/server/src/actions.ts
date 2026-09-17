'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { validCredentials } from '@certa/supabase/policy';
import { serverSupabase } from './supabase';
import { requireIdentity } from './auth';

export type AuthState = { error?: string; message?: string };

export async function signIn(_state: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!validCredentials(email, password)) return { error: 'Enter a valid email and password.' };
  const client = await serverSupabase();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Unable to sign in. Check your details and try again.' };
  revalidatePath('/', 'layout');
  redirect('/account');
}

export async function signUp(_state: AuthState, form: FormData): Promise<AuthState> {
  if (process.env.CERTA_APP !== 'web') return { error: 'Registration is unavailable here.' };
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!validCredentials(email, password) || password.length < 12) return { error: 'Use a valid email and a password of at least 12 characters.' };
  const client = await serverSupabase();
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${process.env.CERTA_APP_ORIGIN}/auth/callback` } });
  if (error) return { error: 'Unable to create an account. Please try again later.' };
  if (data.session) { revalidatePath('/', 'layout'); redirect('/account'); }
  return { message: 'Check your email to confirm your account. If you already have an account, sign in.' };
}

export async function signOut(): Promise<void> {
  const client = await serverSupabase();
  const { error } = await client.auth.signOut({ scope: 'local' });
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
  await requireIdentity();
  const password = String(form.get('password') ?? '');
  if (password.length < 12 || password.length > 1024) return { error: 'Use a password between 12 and 1024 characters.' };
  const client = await serverSupabase();
  const { error } = await client.auth.updateUser({ password });
  if (error) return { error: 'Unable to update your password. Request a new reset link and try again.' };
  revalidatePath('/', 'layout');
  redirect('/account');
}
