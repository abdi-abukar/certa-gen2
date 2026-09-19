"use client";
import { useActionState, useState } from 'react';
import { signIn, signUp, recoverPassword, updatePassword } from '@certa/server/actions';
import styles from './auth-form.module.css';
const actions = { login: signIn, signup: signUp, recover: recoverPassword, reset: updatePassword };
const labels = { login: 'Sign in', signup: 'Create account', recover: 'Send reset link', reset: 'Update password' };
export function AuthForm({ mode }: { mode: keyof typeof actions }) {
  const [state, action, pending] = useActionState(actions[mode], {});
  const [visible, setVisible] = useState(false);
  return <form action={action} className={styles.form}>
    <fieldset disabled={pending} className={styles.fields}>
      <legend className={styles.srOnly}>{labels[mode]}</legend>
      {mode !== 'reset' && <label>Email address<input name="email" type="email" required autoComplete="email" inputMode="email" maxLength={254} placeholder="you@example.com" /></label>}
      {mode !== 'recover' && <label>Password<span className={styles.secret}>
        <input name="password" type={visible ? 'text' : 'password'} required minLength={mode === 'login' ? 1 : 12} maxLength={1024} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        <button type="button" className={styles.reveal} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button>
      </span></label>}
    </fieldset>
    {mode === 'login' && <a href="/forgot-password" className={styles.inlineLink}>Forgot password?</a>}
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {state.message && <p role="status" className={styles.notice}>{state.message}</p>}
    <button type="submit" className={styles.primary} disabled={pending}>{pending ? mode === 'login' ? 'Signing in…' : 'Please wait…' : labels[mode]}<span aria-hidden="true">→</span></button>
  </form>;
}
