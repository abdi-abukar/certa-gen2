'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
type Status = { mode: 'email' | 'totp'; verified: boolean; factorId: string | null; email?: string };
const messages: Record<string, string> = { email_delivery_disabled: 'Email verification is not configured yet. Please contact support.', email_delivery_unavailable: 'We could not send the code. Wait a minute and try again.', rate_limited: 'Please wait before requesting another code.', invalid_or_expired_code: 'That code is incorrect or expired. Try again or request a new code.', authenticator_required: 'Use your authenticator app to continue.', unauthorized: 'Your session expired. Sign in again.' };
export function Verification({ settings = false }: { settings?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [challenge, setChallenge] = useState(''); const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<{ factorId: string; secret: string; qr: string } | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [pending, setPending] = useState(false);
  async function call(path: string, body?: object) {
    const response = await fetch(`/api/auth/second-factor/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(messages[data.error] ?? 'Verification is unavailable. Please try again.');
    return data;
  }
  useEffect(() => { let active = true; call('status').then(data => { if (active) setStatus(data); }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, []);
  useEffect(() => { if (status?.verified && !settings) { router.replace('/account'); router.refresh(); } }, [status, settings, router]);
  async function run(operation: () => Promise<void>) { setPending(true); setError(''); setNotice(''); try { await operation(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Verification failed.'); } finally { setPending(false); } }
  return <div>
    {!status && !error && <p role="status">Checking your verification method…</p>}
    {status && <>
      <p>{status.mode === 'totp' ? 'Your account uses an authenticator app.' : `Your account uses email codes${status.email ? ` sent to ${status.email}` : ''}.`}</p>
      {status.verified && settings && !enrollment && <p role="status">This session is verified.</p>}
      {status.mode === 'email' && !status.verified && <button disabled={pending} onClick={() => run(async () => { const data = await call('email/send', {}); setChallenge(data.challengeId); setNotice('Code sent. It expires in 10 minutes.'); })}>{challenge ? 'Send a new code' : 'Send verification code'}</button>}
      {(!status.verified && (status.mode === 'totp' || challenge) || enrollment) && <form onSubmit={event => { event.preventDefault(); void run(async () => {
        if (enrollment || status.mode === 'totp') await call('totp/verify', { factorId: enrollment?.factorId ?? status.factorId, code });
        else await call('email/verify', { challengeId: challenge, code });
        setEnrollment(null); setCode(''); setStatus(await call('status')); setNotice('Verification complete.'); router.refresh();
      }); }}>
        {enrollment && <div><p>Scan this code in your authenticator app, or enter the setup key manually.</p>{enrollment.qr.startsWith('data:image/svg+xml') && <img src={enrollment.qr} width="200" height="200" alt="Authenticator setup QR code" />}<p style={{ overflowWrap: 'anywhere' }}>Setup key: <code>{enrollment.secret}</code></p></div>}
        <label>Six-digit code<input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} /></label>
        <button disabled={pending || code.length !== 6}>{pending ? 'Verifying…' : 'Verify code'}</button>
      </form>}
      {settings && status.verified && !enrollment && (status.mode === 'email' ? <button disabled={pending} onClick={() => run(async () => { setEnrollment(await call('totp/enroll', {})); })}>Set up authenticator app</button> : <button disabled={pending} onClick={() => run(async () => { await call('totp/remove', { factorId: status.factorId }); router.replace('/login'); router.refresh(); })}>Switch to email verification</button>)}
      {enrollment && <button disabled={pending} onClick={() => run(async () => { await call('totp/remove', { factorId: enrollment.factorId }); setEnrollment(null); setCode(''); setStatus(await call('status')); })}>Cancel setup</button>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </div>;
}
