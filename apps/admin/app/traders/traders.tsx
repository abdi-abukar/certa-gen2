'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './traders.module.css';

type Trader = { id: string; email: string; name: string | null; createdAt: string; lastSignInAt: string | null; canLogin: boolean };
type Directory = { items: Trader[]; nextPage: number | null; canLogin: boolean };
type LoginLink = { url: string; email: string; expiresAt: string };
const messages: Record<string, string> = {
  support_permission_denied: 'Your staff account doesn’t have permission for this action.',
  staff_required: 'Sign in with a staff account to view traders.',
  unauthorized: 'Your session has expired. Sign in again.',
  support_target_unavailable: 'Support sign-in is available for confirmed, active customer accounts only.',
  trader_not_found: 'This customer could not be found. Refresh the list and try again.',
};
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(messages[body.error] ?? 'This request couldn’t be completed. Please try again.');
  return body;
}
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not yet';

export function Traders() {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [link, setLink] = useState<LoginLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(false);
  const linkHeading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setDirectory(null);
    request<Directory>(`/api/traders?${new URLSearchParams({ q: search, page: String(page) })}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setDirectory(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Couldn’t load traders.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, page, revision]);
  useEffect(() => {
    if (!link) return;
    setExpired(false); linkHeading.current?.focus();
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(link.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [link]);

  async function loginAs(trader: Trader) {
    if (busy) return;
    setBusy(trader.id); setError(''); setLink(null); setCopied(false);
    try {
      const next = await request<LoginLink>('/api/traders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: trader.id }) });
      if (!mounted.current) return;
      setLink(next);
      try { await navigator.clipboard.writeText(next.url); if (mounted.current) setCopied(true); } catch { /* Manual copy remains available. */ }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Couldn’t create the sign-in link.'); }
    finally { if (mounted.current) setBusy(null); }
  }
  async function copy() {
    if (!link || expired) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); }
    catch { setCopied(false); setError('Select the sign-in link and copy it manually.'); }
  }

  return <section className={styles.traders}>
    <header className={styles.heading}><div><h1>Traders</h1><p>Find a customer and open their account for support.</p></div><button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}>Refresh</button></header>
    <form className={styles.search} onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); setRevision(value => value + 1); setLink(null); }}><label htmlFor="trader-search">Search by email or user ID</label><div><input id="trader-search" value={query} onChange={event => setQuery(event.target.value)} maxLength={150} placeholder="customer@example.com" autoComplete="off" /><button type="submit" disabled={loading}>Search</button></div></form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {link && <section className={styles.loginPanel} aria-labelledby="private-login-heading">
      <div className={styles.panelHeading}><h2 id="private-login-heading" ref={linkHeading} tabIndex={-1}>{expired ? 'Sign-in link expired' : 'Open in a private window'}</h2><button type="button" onClick={() => setLink(null)}>Dismiss</button></div>
      <p>{expired ? 'Create another link from the customer’s row to continue.' : <>Sign in as <strong>{link.email}</strong>. Open an Incognito or private window, then paste the link. Your admin login stays open.</>}</p>
      {!expired && <><div className={styles.linkRow}><input aria-label="One-time sign-in link" value={link.url} readOnly onFocus={event => event.target.select()} /><button type="button" className={styles.primary} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</button></div><p className={styles.hint}>Mac Chrome: ⌘ Shift N · Windows Chrome: Ctrl Shift N. Websites can’t open private windows automatically. This link works once within 5 minutes; support access lasts 30 minutes.</p><p className={styles.copyStatus} role="status">{copied ? 'Link copied. Paste it into your private window.' : 'Copy the link to continue.'}</p></>}
    </section>}
    <div className={styles.table} aria-busy={loading}>
      <div className={styles.tableHeading} aria-hidden><span>Customer</span><span>Joined</span><span>Last sign-in</span><span>Support access</span></div>
      {loading ? <p className={styles.empty} role="status">Loading traders…</p> : directory?.items.length ? <ul>{directory.items.map(trader => <li key={trader.id} className={styles.row}>
        <div className={styles.person}><strong>{trader.name || trader.email || 'Customer'}</strong><span>{trader.email}</span><small>{trader.id}</small></div>
        <span className={styles.date}><small>Joined</small>{date(trader.createdAt)}</span><span className={styles.date}><small>Last sign-in</small>{date(trader.lastSignInAt)}</span>
        <div className={styles.action}>{directory.canLogin && trader.canLogin ? <button type="button" className={styles.primary} disabled={!!busy} onClick={() => void loginAs(trader)}>{busy === trader.id ? 'Creating link…' : 'Log in as user'}<span aria-hidden>↗</span></button> : <span className={styles.hint}>{!directory.canLogin ? 'Support sign-in not permitted' : 'Account not eligible for support sign-in'}</span>}</div>
      </li>)}</ul> : directory ? <p className={styles.empty}>No customers found{search ? ' for this search' : ' on this page'}.</p> : null}
    </div>
    <nav className={styles.pagination} aria-label="Trader pages"><button type="button" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={!directory?.nextPage || loading} onClick={() => directory?.nextPage && setPage(directory.nextPage)}>Next</button></nav>
  </section>;
}
