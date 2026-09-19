'use client';
import { useEffect, useRef, useState } from 'react';
const messages: Record<string, string> = {
  private_window_required: 'This window already has a customer session. Open the link in a fresh Incognito or private window.',
  support_access_revoked: 'Your staff support permission is no longer active. Ask a master admin for access.',
  support_target_unavailable: 'This customer account is no longer available for support sign-in.',
  support_link_invalid_or_expired: 'This link has expired or was already used. Create another from Traders.',
};
export function SupportSignIn() {
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = location.hash.slice(1);
    // Remove the credential from the address bar and browser history before any request.
    history.replaceState(null, '', location.pathname);
    if (!token) { setError('This sign-in link is missing. Create another from Traders.'); return; }
    void fetch('/api/auth/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(messages[body.error] ?? 'Support sign-in is unavailable. Create a new link and try again.'); location.replace('/account'); })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Support sign-in is unavailable.'));
  }, []);
  return <section className="card"><h1>{error ? 'Couldn’t open this account' : 'Opening customer account…'}</h1><p role={error ? 'alert' : 'status'}>{error || 'Starting your temporary support session.'}</p></section>;
}
