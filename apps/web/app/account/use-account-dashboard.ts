'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { accountApi, AccountApiError } from './dashboard-api';
import type { DashboardSnapshot, GameSnapshot, Summary, TradingAccount } from './dashboard-model';

export function useAccountDashboard(userId: string) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [live, setLive] = useState(false);
  const [visible, setVisible] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setRefreshing(true);
    try {
      const next = await accountApi<DashboardSnapshot>('/api/trading/dashboard', { signal: current.signal });
      if (current.signal.aborted) return;
      setSnapshot(next); setError(null); setRevision(value => value + 1);
    } catch (reason) { if (!current.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load your accounts.'); }
    finally { if (!current.signal.aborted) setRefreshing(false); }
  }, []);
  useEffect(() => { void refresh(); return () => controller.current?.abort(); }, [refresh, userId]);
  useEffect(() => {
    setVisible(!document.hidden);
    const onVisibility = () => {
      setVisible(!document.hidden);
      if (document.hidden) setLive(false); else void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);
  const available = Boolean(snapshot);
  useEffect(() => {
    if (!available || !visible) return;
    let disposed = false, socket: WebSocket | null = null, retry = 0;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let invalidation: ReturnType<typeof setTimeout> | undefined;
    let lastVersion = 0n;
    const connect = async () => {
      if (disposed || document.hidden) return;
      try {
        const ticket = await accountApi<{ ticket: string; url: string | null }>('/api/trading/live-session', { body: {} });
        if (disposed || !ticket.url) return;
        const url = new URL(ticket.url);
        if (!['wss:', 'ws:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'wss:')) return;
        socket = new WebSocket(url.href);
        socket.onopen = () => socket?.send(JSON.stringify({ type: 'authenticate', ticket: ticket.ticket }));
        socket.onmessage = event => {
          if (disposed) return;
          let message; try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === 'ready') { retry = 0; lastVersion = 0n; setLive(true); void refresh(); }
          if (message.type === 'patch') {
            if (typeof message.version !== 'string' || !/^\d+$/.test(message.version)) return;
            const version = BigInt(message.version); if (version <= lastVersion) return; lastVersion = version;
            if (!invalidation) invalidation = setTimeout(() => { invalidation = undefined; if (!disposed) void refresh(); }, 250);
          }
        };
        socket.onclose = event => {
          if (disposed) return;
          setLive(false);
          if (event.code === 4403) { void refresh(); return; }
          reconnect = setTimeout(() => { void connect(); }, Math.min(30000, 1000 * 2 ** Math.min(retry++, 5)));
        };
        socket.onerror = () => socket?.close();
      } catch (error) {
        if (!disposed) {
          setLive(false);
          if (!(error instanceof AccountApiError && [401, 403].includes(error.status))) reconnect = setTimeout(() => { void connect(); }, Math.min(30000, 1000 * 2 ** Math.min(retry++, 5)));
        }
      }
    };
    void connect();
    return () => { disposed = true; clearTimeout(reconnect); clearTimeout(invalidation); socket?.close(); };
  }, [available, visible, userId, refresh]);
  return { snapshot, error, refreshing, revision, live, refresh };
}

export function useSelectedAccount(accountId: string | null, revision: number) {
  const [data, setData] = useState<{ id: string; summary: Summary | null; game: GameSnapshot | null; error: string | null; loading: boolean }>({ id: '', summary: null, game: null, error: null, loading: false });
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    setData(previous => previous.id === accountId ? { ...previous, loading: !previous.summary } : { id: accountId, summary: null, game: null, error: null, loading: true });
    Promise.allSettled([
      accountApi<Summary>(`/api/trading/accounts/${accountId}/summary`, { signal: controller.signal }),
      accountApi<GameSnapshot>(`/api/awards/accounts/${accountId}/game`, { signal: controller.signal }),
    ]).then(([summary, game]) => {
      if (controller.signal.aborted) return;
      setData(previous => ({ id: accountId,
        summary: summary.status === 'fulfilled' ? summary.value : previous.id === accountId ? previous.summary : null,
        game: game.status === 'fulfilled' ? game.value : null,
        error: summary.status === 'rejected' ? 'Account data is temporarily unavailable.' : null, loading: false }));
    });
    return () => controller.abort();
  }, [accountId, revision]);
  return data.id === accountId ? data : { id: accountId, summary: null, game: null, error: null, loading: Boolean(accountId) };
}

/** Resolve one owned historical account without walking the trader's entire archive. */
export function useHistoricalAccount(userId: string, accountId: string | null, revision: number) {
  type State = { key: string; account: TradingAccount | null; loading: boolean; notFound: boolean; error: string | null };
  const key = accountId ? `${userId}:${accountId}` : '';
  const [result, setResult] = useState<State>({ key: '', account: null, loading: false, notFound: false, error: null });
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    const empty = { key, account: null, loading: false, notFound: false, error: null };
    if (!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(accountId)) {
      setResult({ ...empty, notFound: true }); return () => controller.abort();
    }
    setResult({ ...empty, loading: true });
    accountApi<TradingAccount>(`/api/trading/accounts/${encodeURIComponent(accountId)}`, { signal: controller.signal })
      .then(account => {
        if (controller.signal.aborted) return;
        if (account.id.toLowerCase() !== accountId.toLowerCase()) throw new Error('Account response did not match the selected history.');
        setResult({ ...empty, account });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setResult(error instanceof AccountApiError && error.status === 404
          ? { ...empty, notFound: true }
          : { ...empty, error: error instanceof AccountApiError ? error.message : 'We couldn’t load this account. Please try again.' });
      });
    return () => controller.abort();
  }, [accountId, key, revision]);
  return result.key === key ? result : { key, account: null, loading: Boolean(accountId), notFound: false, error: null };
}
