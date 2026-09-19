'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { accountApi } from './dashboard-api';
import styles from './trading-launch.module.css';

type LaunchState = { hasLiveAccount: boolean | null; loading: boolean };

/** One local read on navigation or window focus. No polling or Tradara calls. */
export function useTradingLaunch(pathname: string, userId: string): LaunchState {
  const key = `${userId}:${pathname}`;
  const [state, setState] = useState<LaunchState & { key: string }>({ key: '', hasLiveAccount: null, loading: true });
  useEffect(() => {
    let controller: AbortController;
    const refresh = async () => {
      controller?.abort();
      const current = new AbortController(); controller = current;
      setState({ key, hasLiveAccount: null, loading: true });
      try {
        const result = await accountApi<{ hasLiveAccount: boolean }>('/api/trading/launch', { signal: AbortSignal.any([current.signal, AbortSignal.timeout(15000)]) });
        if (typeof result.hasLiveAccount !== 'boolean') throw new Error('Invalid account availability');
        if (!current.signal.aborted) setState({ key, hasLiveAccount: result.hasLiveAccount, loading: false });
      } catch { if (!current.signal.aborted) setState({ key, hasLiveAccount: null, loading: false }); }
    };
    const onFocus = () => { void refresh(); };
    void refresh(); window.addEventListener('focus', onFocus);
    return () => { controller?.abort(); window.removeEventListener('focus', onFocus); };
  }, [key]);
  return state.key === key
    ? { hasLiveAccount: state.hasLiveAccount, loading: state.loading }
    : { hasLiveAccount: null, loading: true };
}

export function TradingLaunch({ hasLiveAccount, loading }: LaunchState) {
  const label = loading ? 'Checking accounts…' : hasLiveAccount === null ? 'View accounts' : 'Trade on Tradara';
  const content = <><TradaraMark /><span className={styles.label}>{label}</span></>;
  if (loading) return <span className={styles.action} role="status" aria-label={label} aria-busy="true">{content}</span>;
  return hasLiveAccount ? <a className={styles.action} href="https://terminal.tradara.com" target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens in a new tab)`} title={label}>{content}</a> : <Link className={styles.action} href={hasLiveAccount === false ? '/checkout' : '/account'} aria-label={label} title={label}>{content}</Link>;
}

/** Existing approved Tradara mark from the parent app; no runtime dependency. */
function TradaraMark() {
  return <svg className={styles.mark} viewBox="0 0 348 293" fill="currentColor" aria-hidden><path d="M334.167 278.783C339.164 283.835 335.585 292.408 328.479 292.408H148.774C144.356 292.408 140.774 288.826 140.774 284.408V154.484C140.774 150.066 137.192 146.484 132.774 146.484H8C3.58172 146.484 0 142.902 0 138.484V8C0 3.58173 3.58172 0 8 0H55.1064C57.2434 0 59.2916 0.855028 60.7944 2.37446L334.167 278.783ZM347.643 137.935C347.643 142.354 344.061 145.935 339.643 145.935H277.493C275.356 145.935 273.308 145.08 271.805 143.561L143.296 13.6255C138.299 8.57322 141.878 0 148.984 0H339.643C344.061 0 347.643 3.58172 347.643 8V137.935Z" /></svg>;
}
