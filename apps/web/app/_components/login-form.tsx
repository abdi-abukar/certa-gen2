'use client';

import { useActionState, useState, type MouseEvent } from 'react';
import { signIn } from '@certa/server/actions';
import { SecondFactorStep } from './second-factor-step';
import styles from './signup-form.module.css';

/** Password sign-in. Verification (email code or authenticator) completes in the same form. */
export function LoginForm({ onRecover, onSignup }: { onRecover: () => void; onSignup: () => void }) {
  const [state, action, pending] = useActionState(signIn, {});
  const [visible, setVisible] = useState(false);
  function switchMode(event: MouseEvent<HTMLAnchorElement>, navigate: () => void) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate();
  }
  // The password is accepted; the outstanding factor is finished here, not on another page.
  if (state.step === 'second-factor') return <SecondFactorStep />;
  return <form action={action} className={`${styles.signup} ${styles.form}`}>
    <fieldset disabled={pending} className={styles.fields}>
      <legend className={styles.srOnly}>Sign in</legend>
      <label>Email address<input name="email" type="email" required autoComplete="email" maxLength={254} placeholder="you@example.com" inputMode="email" /></label>
      <label>Password
        <span className={styles.secret}>
          <input name="password" type={visible ? 'text' : 'password'} required minLength={1} maxLength={1024} autoComplete="current-password" />
          <button type="button" className={styles.reveal} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button>
        </span>
      </label>
    </fieldset>
    <div className={styles.footerRow}>
      <a href="/forgot-password" className={styles.inlineLink} onClick={event => switchMode(event, onRecover)}>Forgot password?</a>
      <a href="/signup" className={styles.inlineLink} onClick={event => switchMode(event, onSignup)}>Create an account</a>
    </div>
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {state.message && <p role="status" className={styles.notice}>{state.message}</p>}
    <button type="submit" className={styles.primary} disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}<span aria-hidden="true">→</span></button>
  </form>;
}
