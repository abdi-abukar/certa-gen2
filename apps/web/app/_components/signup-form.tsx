'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { USERNAME_MAX, normalizeUsername, validateUsername } from '@certa/server/username';
import { CountryPicker } from './country-picker';
import styles from './signup-form.module.css';

type SignupStep = 1 | 2 | 3;
const SIGNUP_STEPS: Record<SignupStep, string> = { 1: 'Your details', 2: 'Email and password', 3: 'Verify your email' };
type Lookup = { state: 'checking' | 'available' | 'unavailable'; username: string; error?: string };
const messages: Record<string, string> = {
  account_exists: 'An account with this email already exists. Sign in instead.',
  email_delivery_disabled: 'Email verification is not configured yet. Please contact support.',
  email_delivery_unavailable: 'We could not send the code. Wait a minute and try again.',
  rate_limited: 'Please wait a minute before requesting another code.',
  invalid_or_expired_code: 'That code is incorrect or expired. Try again or request a new code.',
  email_not_verified: 'Verify your email again to finish creating your account.',
  username_taken: 'That @ is taken. Go back and choose another.',
  country_unavailable: 'We cannot accept registrations from this country at this time.',
  invalid_password: 'Use a password of at least 8 characters.',
  origin_required: 'Please reload the page and try again.',
};
async function call(path: string, body: object) {
  const response = await fetch(`/api/auth/signup/${path}`, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(messages[data.error] ?? 'Something went wrong. Please try again.');
  return data;
}
async function usernameAvailable(username: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(`/api/auth/signup/username?username=${encodeURIComponent(username)}`, { cache: 'no-store', signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Could not check that username.');
  return data.available ? null : data.error ?? 'That @ is taken. Try another.';
}

/** Three short pages: details, account, verification. The original flow's rules, redesigned. */
export function SignupForm({ onLogin }: { onLogin: () => void }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStepState] = useState<SignupStep>(1);
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState(''); const [lookup, setLookup] = useState<Lookup | null>(null);
  const [country, setCountry] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [visible, setVisible] = useState(false); const [terms, setTerms] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; masked: string } | null>(null);
  const [code, setCode] = useState(''); const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const local = username ? validateUsername(username) : null;
  const status = !local ? 'idle' : !local.ok ? 'unavailable' : lookup?.username === username ? lookup.state : 'idle';
  const problem = local && !local.ok ? local.error : lookup?.state === 'unavailable' && lookup.username === username ? lookup.error ?? null : null;

  const loginLink = <a href="/login" className={styles.loginLink} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onLogin();
  }}>Already have an account?</a>;

  function setStep(next: SignupStep) {
    setError(''); setNotice(''); setStepState(next);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }
  useEffect(() => {
    if (!username) return;
    const checked = validateUsername(username);
    if (!checked.ok) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLookup({ state: 'checking', username });
      usernameAvailable(checked.username, controller.signal)
        .then(error => { if (!controller.signal.aborted) setLookup(error ? { state: 'unavailable', username, error } : { state: 'available', username }); })
        .catch(() => { if (!controller.signal.aborted) setLookup(null); });
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [username]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function run(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.'); } finally { setBusy(false); }
  }
  async function sendCode(resend = false) {
    const sent = await call('email/send', { email: email.trim().toLowerCase() });
    setChallenge({ id: sent.challengeId, masked: sent.email }); setCode(''); setCooldown(30);
    if (resend) setNotice('A new code is on its way.');
  }
  function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { setError('Enter your legal first and last name as shown on your government-issued ID.'); return; }
    const checked = validateUsername(username);
    if (!checked.ok) { setError(username ? checked.error : 'Choose a username. This is your public @ on Certa.'); return; }
    if (!country) { setError('Choose your country of residence.'); return; }
    if (problem) { setError(problem); return; }
    void run(async () => {
      if (status !== 'available') {
        const taken = await usernameAvailable(checked.username);
        if (taken) { setLookup({ state: 'unavailable', username, error: taken }); throw new Error(taken); }
        setLookup({ state: 'available', username });
      }
      setStep(2);
    });
  }
  function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) { setError('Use a password of at least 8 characters.'); return; }
    if (!terms) { setError('Please accept the Terms of Service and Privacy Policy to continue.'); return; }
    void run(async () => { await sendCode(); setStep(3); });
  }
  function submitCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!challenge || code.length !== 6 || busy) return;
    void run(async () => {
      const address = email.trim().toLowerCase();
      const { proof } = await call('email/verify', { challengeId: challenge.id, email: address, code });
      const created = await call('create', { firstName: firstName.trim(), lastName: lastName.trim(), username: normalizeUsername(username), country, email: address, password, acceptedTerms: true, challengeId: challenge.id, proof });
      if (created.signedIn) { router.replace(created.next ?? '/account'); router.refresh(); return; }
      setNotice('Your account is created. Sign in to continue.'); onLogin();
    });
  }
  return <div className={styles.signup} data-step={step}>
    <h3 ref={heading} tabIndex={-1} className={styles.srOnly}>Step {step} of 3: {SIGNUP_STEPS[step]}</h3>

    {step === 1 && <form onSubmit={submitDetails} className={styles.form} noValidate>
      <fieldset disabled={busy} className={styles.fields}>
        <legend className={styles.srOnly}>Legal name and country of residence</legend>
        <div className={styles.pair}>
          <label>Legal first name<input name="firstName" autoComplete="given-name" required maxLength={60} value={firstName} onChange={event => setFirstName(event.target.value)} placeholder="On your ID" /></label>
          <label>Legal last name<input name="lastName" autoComplete="family-name" required maxLength={60} value={lastName} onChange={event => setLastName(event.target.value)} placeholder="On your ID" /></label>
        </div>
        <div className={styles.pair}>
          <label>Username
            <span className={styles.handle} data-status={status}>
              <span aria-hidden="true" className={styles.at}>@</span>
              <input name="username" value={username} onChange={event => { setUsername(normalizeUsername(event.target.value).slice(0, USERNAME_MAX)); setError(''); }}
                required maxLength={USERNAME_MAX} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="handle" aria-describedby="signup-username-hint" aria-invalid={status === 'unavailable'} />
              <span aria-live="polite" className={styles.state}>{status === 'checking' ? <span className={styles.spinner} aria-label="Checking availability" /> : status === 'available' ? <span className={styles.ok} aria-label="Username available">✓</span> : status === 'unavailable' ? <span className={styles.bad} aria-label="Username unavailable">✕</span> : null}</span>
            </span>
          </label>
          <label>Country of residence
            <CountryPicker value={country} onChange={value => { setCountry(value); setError(''); }} disabled={busy} />
          </label>
        </div>
        <div className={styles.hintRow}>
          <span id="signup-username-hint" className={styles.hint} data-invalid={status === 'unavailable'}>
            {problem ?? (status === 'available' ? `@${username} is yours.` : `Your public @ on Certa. Letters and numbers, up to ${USERNAME_MAX} characters. It can’t be changed later.`)}
          </span>
          {loginLink}
        </div>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Checking…' : 'Continue'}<span aria-hidden="true">→</span></button>
    </form>}

    {step === 2 && <form onSubmit={submitAccount} className={styles.form} noValidate>
      <fieldset disabled={busy} className={styles.fields}>
        <legend className={styles.srOnly}>Account details and terms</legend>
        <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" inputMode="email" /></label>
        <label>Password
          <span className={styles.secret}>
            <input name="password" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" />
            <button type="button" className={styles.reveal} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button>
          </span>
          <span className={styles.hint}>Use at least 8 characters. A short sentence works well.</span>
        </label>
        <label className={styles.consent}>
          <input type="checkbox" name="terms" checked={terms} onChange={event => setTerms(event.target.checked)} required />
          <span>I agree to the <a href="https://www.certafutures.com/legal/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="https://www.certafutures.com/legal/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
        </label>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}{error === messages.account_exists && <> <button type="button" className={styles.textButton} onClick={onLogin}>Sign in</button></>}</p>}
      <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Sending your code…' : 'Send verification code'}<span aria-hidden="true">→</span></button>
      <div className={styles.footerRow}>
        <button type="button" className={styles.back} disabled={busy} onClick={() => setStep(1)}><span aria-hidden="true">←</span> Back to your details</button>
        {loginLink}
      </div>
    </form>}

    {step === 3 && <form onSubmit={submitCode} className={styles.form} noValidate>
      <p className={styles.copy}>Enter the six-digit code we sent to <strong>{challenge?.masked ?? email}</strong>. It expires in 10 minutes.</p>
      <label>Six-digit code
        <input className={styles.code} name="code" value={code} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus disabled={busy}
          onChange={event => { const next = event.target.value.replace(/\D/g, '').slice(0, 6); setCode(next); setError(''); if (next.length === 6 && challenge) queueMicrotask(() => (event.target.form as HTMLFormElement | null)?.requestSubmit()); }} />
      </label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      <button type="submit" className={styles.primary} disabled={busy || code.length !== 6 || !challenge}>{busy ? 'Creating your account…' : 'Verify and create account'}</button>
      <div className={styles.footerRow}>
        <button type="button" className={styles.textButton} disabled={busy || cooldown > 0} onClick={() => void run(() => sendCode(true))}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button>
        <button type="button" className={styles.back} disabled={busy} onClick={() => setStep(2)}><span aria-hidden="true">←</span> Change email</button>
        {loginLink}
      </div>
    </form>}
  </div>;
}
