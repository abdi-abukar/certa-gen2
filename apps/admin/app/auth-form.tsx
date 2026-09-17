"use client";
import { useActionState } from 'react';
import { signIn, signUp, recoverPassword, updatePassword } from '@certa/server/actions';
const actions = { login: signIn, signup: signUp, recover: recoverPassword, reset: updatePassword };
const labels = { login: 'Sign in', signup: 'Create account', recover: 'Send reset link', reset: 'Update password' };
export function AuthForm({ mode }: { mode: keyof typeof actions }) {
  const [state, action, pending] = useActionState(actions[mode], {});
  return <form action={action}>
    {mode !== 'reset' && <label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>}
    {mode !== 'recover' && <label>Password<input name="password" type="password" required minLength={mode === 'login' ? 1 : 12} maxLength={1024} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>}
    <button disabled={pending}>{pending ? 'Please wait…' : labels[mode]}</button>
    {state.error && <p role="alert" className="error">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
