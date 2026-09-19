'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@certa/server/actions';
import styles from './signup-form.module.css';

type Status = { mode: 'email' | 'totp'; verified: boolean; factorId: string | null; email?: string };
const messages: Record<string, string> = {
  email_delivery_disabled: 'Email verification is not configured yet. Please contact support.',
  email_delivery_unavailable: 'We could not send the code. Wait a minute and try again.',
  invalid_or_expired_code: 'That code is incorrect or expired. Request a new one.',
  invalid_code: 'Enter the six digits from the email.',
  authenticator_required: 'Use your authenticator app to continue.',
  unauthorized: 'Your session expired. Sign in again.',
  verification_unavailable: 'Verification is unavailable right now. Please try again shortly.',
};
async function call(path: string, body?: object) {
  const response = await fetch(`/api/auth/second-factor/${path}`, {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(messages[data.error] ?? 'Verification is unavailable. Please try again.'); error.name = String(data.error ?? 'error'); throw error; }
  return data;
}

/**
 * Finishes sign-in without leaving the dialog: the email code is requested as soon as the
 * password is accepted, and only a verified session navigates on.
 */
export function SecondFactorStep() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requested = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // One request per mount. The server also allows only one code a minute per person.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const current: Status = await call('status');
        if (!active) return;
        setStatus(current);
        if (current.verified) { router.replace('/account'); router.refresh(); return; }
        if (current.mode !== 'email' || requested.current) return;
        requested.current = true;
        const sent = await call('email/send', {});
        if (!active) return;
        setChallenge(sent.challengeId);
        setCooldown(30);
        setNotice('Code sent. It expires in 10 minutes.');
      } catch (reason) {
        if (!active) return;
        if (reason instanceof Error && reason.name === 'rate_limited') setNotice('A code was sent recently. Check your inbox, or request another in a moment.');
        else setError(reason instanceof Error ? reason.message : 'Verification is unavailable.');
      }
    })();
    return () => { active = false; };
  }, [router]);

  async function run(operation: () => Promise<void>) {
    setPending(true); setError(''); setNotice('');
    try { await operation(); }
    catch (reason) {
      if (reason instanceof Error && reason.name === 'rate_limited') setNotice('A code was sent recently. Check your inbox, or request another in a moment.');
      else setError(reason instanceof Error ? reason.message : 'Verification failed.');
    }
    finally { setPending(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6 || pending || !status) return;
    void run(async () => {
      if (status.mode === 'totp') await call('totp/verify', { factorId: status.factorId, code });
      else await call('email/verify', { challengeId: challenge, code });
      router.replace('/account');
      router.refresh();
    });
  }
  const authenticator = status?.mode === 'totp';
  return <form onSubmit={submit} className={`${styles.signup} ${styles.form}`} noValidate>
    <p className={styles.copy}>
      {!status ? 'Checking how your account is protected…'
        : authenticator ? 'Enter the current six-digit code from your authenticator app to finish signing in.'
        : <>We sent a six-digit code to <strong>{status.email ?? 'your account email'}</strong>. Enter it to finish signing in.</>}
    </p>
    <label>Six-digit code
      <input className={styles.code} name="code" value={code} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
        maxLength={6} required autoFocus disabled={pending || !status}
        onChange={event => {
          const next = event.target.value.replace(/\D/g, '').slice(0, 6);
          setCode(next); setError('');
          if (next.length === 6) queueMicrotask(() => (event.target.form as HTMLFormElement | null)?.requestSubmit());
        }} />
    </label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <button type="submit" className={styles.primary} disabled={pending || code.length !== 6 || !status}>{pending ? 'Verifying…' : 'Verify and continue'}</button>
    <div className={styles.footerRow}>
      {!authenticator && <button type="button" className={styles.textButton} disabled={pending || cooldown > 0}
        onClick={() => void run(async () => { const sent = await call('email/send', {}); setChallenge(sent.challengeId); setCode(''); setCooldown(30); setNotice('A new code is on its way.'); })}>
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
      </button>}
      <button type="button" className={styles.textButton} disabled={pending} onClick={() => void signOut()}>Use a different account</button>
    </div>
  </form>;
}
