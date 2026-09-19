'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { accountApi } from './dashboard-api';
import { accountLabel, type DashboardSnapshot, type TradingAccount } from './dashboard-model';
import styles from './dashboard.module.css';

export function AccountHistory() {
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [revision, setRevision] = useState(0);
  const [fetchCursor, setFetchCursor] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    accountApi<DashboardSnapshot>(`/api/trading/dashboard${fetchCursor ? `?cursor=${encodeURIComponent(fetchCursor)}` : ''}`, { signal: controller.signal }).then(snapshot => {
      if (controller.signal.aborted) return;
      setAccounts(previous => fetchCursor ? [...previous, ...snapshot.history.accounts.filter(account => !previous.some(item => item.id === account.id))] : snapshot.history.accounts);
      setCursor(snapshot.history.hasMore ? snapshot.history.nextCursor : null);
    }).catch(() => { if (!controller.signal.aborted) setError('Your account history is unavailable right now.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fetchCursor, revision]);
  const rows = accounts.filter(account => filter === 'All' || filter === 'Passed' && ['passed', 'upgraded'].includes(account.lifecycle) || filter === 'Failed' && ['failed', 'breached'].includes(account.lifecycle) || filter === 'Closed' && account.lifecycle === 'closed');
  return <div className={styles.dashboard}><div className={styles.pageHeading}><h1>Account history</h1><Link className={styles.textLink} href="/account">Accounts ↗</Link></div><div className={styles.historyFilters} aria-label="Filter account history">{['All', 'Passed', 'Failed', 'Closed'].map(label => <button key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div>
    {error && <p className={styles.inlineNotice}>{error} <button onClick={() => setRevision(value => value + 1)}>Try again</button></p>}
    <div className={styles.historyList}>{rows.map(account => <Link key={account.id} className={styles.historyRow} href={`/account/history/${account.id}`}><strong>{accountLabel(account)}</strong><span>{account.lifecycle === 'upgraded' ? 'Passed' : account.lifecycle[0].toUpperCase() + account.lifecycle.slice(1)}</span><span>{account.vendor_updated_at ? new Date(account.vendor_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'}</span><span aria-hidden>↗</span></Link>)}</div>
    {loading ? <p className={styles.noTrades}>Loading your accounts…</p> : !rows.length && !error ? <p className={styles.noTrades}>No {filter === 'All' ? 'completed' : filter.toLowerCase()} accounts yet.</p> : null}
    {cursor && <button className={styles.textButton} disabled={loading} onClick={() => setFetchCursor(cursor)}>Show more accounts ↓</button>}
  </div>;
}
