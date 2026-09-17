'use client';
import { useEffect, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { validCredentials } from '@certa/supabase/policy';

export function AuthPanel({ client, title, children }: { client: SupabaseClient; title: string; children?: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    // Client state controls presentation only. All data access still needs RLS/API authorization.
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); setReady(true); });
    return () => subscription.unsubscribe();
  }, [client]);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!validCredentials(email, password)) { setError('Enter a valid email and password.'); return; }
    setPending(true);
    try { const { error } = await client.auth.signInWithPassword({ email, password }); if (error) setError('Unable to sign in. Check your details and try again.'); }
    catch { setError('Unable to connect. Please try again.'); }
    finally { setPending(false); }
  }
  async function logout() {
    setPending(true); setError('');
    try { const { error } = await client.auth.signOut({ scope: 'local' }); if (error) setError('Unable to sign out. Try again.'); }
    catch { setError('Unable to sign out. Try again.'); }
    finally { setPending(false); }
  }
  return <section className="card"><p className="eyebrow">Certa</p><h1>{title}</h1>
    {!ready ? <p role="status">Loading your session…</p> : user ? <><p>Signed in as {user.email}</p><div key={user.id}>{children}</div><button disabled={pending} onClick={logout}>Sign out</button></> :
      <form onSubmit={login}><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label><button disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button></form>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
