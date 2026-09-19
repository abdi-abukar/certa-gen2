'use client';

import { useEffect, useRef, useState } from 'react';
import { accountApi, AccountApiError } from './dashboard-api';
import { calendarDates, monthShift, number, todaySession, usd, type Activity } from './dashboard-model';
import styles from './dashboard.module.css';

export function TradingActivity({ accountId, revision, objectives }: { accountId: string; revision: number; objectives: React.ReactNode }) {
  const [month, setMonth] = useState(() => todaySession().slice(0, 7));
  const [date, setDate] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [week, setWeek] = useState(0);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    setLoading(true); setError(null);
    const query = new URLSearchParams({ month }); if (date) query.set('date', date);
    accountApi<Activity>(`/api/trading/accounts/${accountId}/activity?${query}`, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || version !== generation.current) return;
      setActivity(result);
      if (!date && result.selectedDate) {
        const index = calendarDates(month).indexOf(result.selectedDate); setWeek(Math.max(0, Math.floor(index / 7)));
      }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Trading activity is unavailable.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); ++generation.current; };
  }, [accountId, month, date, revision, retry]);
  const active = activity?.accountId === accountId && activity.month === month && (!date || activity.selectedDate === date) ? activity : null;
  const calendar = activity?.accountId === accountId && activity.month === month ? activity.days : [];
  const days = calendarDates(month);
  const changeMonth = (amount: number) => { setMonth(monthShift(month, amount)); setDate(null); setWeek(0); setActivity(null); };
  const changeWeek = (amount: number) => { const next = week + amount; if (next < 0 || next >= days.length / 7) changeMonth(amount); else setWeek(next); };
  const loadMore = async () => {
    if (!active?.nextCursor || more) return;
    const version = generation.current; setMore(true);
    try {
      const query = new URLSearchParams({ month, date: active.selectedDate ?? '', cursor: active.nextCursor });
      const next = await accountApi<Activity>(`/api/trading/accounts/${accountId}/activity?${query}`);
      if (version === generation.current) { setError(null); setActivity(previous => previous ? { ...next, trades: [...previous.trades, ...next.trades.filter(trade => !previous.trades.some(existing => existing.id === trade.id))] } : next); }
    } catch (reason) {
      if (version === generation.current) {
        // A revised daily report invalidates the cursor. Reload its first page;
        // never append trades from two different report snapshots.
        if (reason instanceof AccountApiError && reason.status === 409) { setActivity(null); setRetry(value => value + 1); }
        else setError('Couldn’t load more trades. Try again.');
      }
    }
    finally { setMore(false); }
  };
  const selected = active?.selectedDate ?? date;
  return <>
    <div className={styles.activityArea}>
      {objectives}
      <section className={styles.calendar} aria-label="Trading calendar">
        <div className={styles.sectionHead}><h2>{new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><div className={styles.calendarControls}>
          <button className={styles.desktopControl} onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button><button className={styles.mobileControl} onClick={() => changeWeek(-1)} aria-label="Previous week">‹</button>
          <button className={styles.todayButton} onClick={() => { setMonth(todaySession().slice(0, 7)); setDate(todaySession()); setWeek(Math.max(0, Math.floor(calendarDates(todaySession().slice(0, 7)).indexOf(todaySession()) / 7))); }}>Today</button>
          <button className={styles.desktopControl} onClick={() => changeMonth(1)} aria-label="Next month">›</button><button className={styles.mobileControl} onClick={() => changeWeek(1)} aria-label="Next week">›</button>
        </div></div>
        <div className={styles.weekdays} aria-hidden="true">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={index}>{day}</span>)}</div>
        <div className={styles.calendarGrid}>{days.map((day, index) => {
          const row = calendar.find(item => item.date === day);
          const outside = !day.startsWith(month);
          return <button key={day} className={`${styles.day} ${outside ? styles.outsideDay : ''} ${Math.floor(index / 7) !== week ? styles.hiddenWeek : ''}`} aria-pressed={selected === day} aria-current={day === todaySession() ? 'date' : undefined} aria-label={`${day}${row ? `, ${usd(row.netPnl, true)}, ${row.tradesClosed ?? 'unknown'} closed trades` : ''}`} title={row ? `${day}: ${usd(row.netPnl, true)}` : day} disabled={outside} onClick={() => setDate(day)}>
            <span className={styles.dayNumber}>{Number(day.slice(-2))}</span><span className={number(row?.netPnl) !== null && number(row?.netPnl)! < 0 ? styles.negative : styles.positive}>{row && number(row.netPnl) !== null ? calendarMoney(row.netPnl) : '—'}</span>{row?.tradesClosed ? <small>{row.tradesClosed} {row.tradesClosed === 1 ? 'trade' : 'trades'}</small> : null}
          </button>;
        })}</div>
        <p className={styles.calendarCaption}>Reported trading sessions</p>
      </section>
    </div>
    <section className={styles.tradeSection} aria-busy={loading}>
      <div className={styles.sectionHead}><div><h2>{selected ? new Date(`${selected}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Trading activity'}</h2><p>{active?.day.tradesClosed !== null && active?.day.tradesClosed !== undefined ? `${active.day.tradesClosed} closed ${active.day.tradesClosed === 1 ? 'trade' : 'trades'}` : 'Closed trades'}</p></div><strong className={number(active?.day.netPnl) !== null && number(active?.day.netPnl)! < 0 ? styles.negative : styles.positive}>{usd(active?.day.netPnl, true)}</strong></div>
      {error && <p className={styles.inlineNotice} role="status">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
      {loading && !active ? <div className={styles.tradeLoading}>Loading this session…</div> : active?.trades.length ? <>
        <div className={styles.tradeScroll}><table className={styles.tradeTable}><thead><tr><th>Time</th><th>Symbol</th><th>Direction</th><th>Contracts</th><th className={styles.extraColumn}>Entry</th><th className={styles.extraColumn}>Exit</th><th>Net P&amp;L</th></tr></thead><tbody>{active.trades.map(trade => <tr key={trade.id}><td>{trade.closedAt ? new Date(trade.closedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' }) : '—'}</td><td><b>{trade.symbol ?? '—'}</b></td><td>{trade.side ?? '—'}</td><td>{trade.quantity ?? '—'}</td><td className={styles.extraColumn}>{trade.entryPrice ?? '—'}</td><td className={styles.extraColumn}>{trade.exitPrice ?? '—'}</td><td className={number(trade.netPnl) !== null && number(trade.netPnl)! < 0 ? styles.negative : styles.positive}>{usd(trade.netPnl, true)}</td></tr>)}</tbody></table></div>
        <p className={styles.calendarCaption}>Times shown in Toronto time · Net of reported fees{!active.freshness.tradesComplete ? ' · Trade records may be incomplete' : ''}</p>
        {active.hasMore && <button className={styles.textButton} onClick={() => void loadMore()} disabled={more}>{more ? 'Loading…' : 'Show more trades'} ↓</button>}
      </> : <p className={styles.noTrades}>{active?.freshness.tradesComplete ? 'No closed trades for this session.' : 'Trade records are not available for this session yet.'}</p>}
    </section>
  </>;
}

function calendarMoney(value: string | null) {
  const amount = number(value);
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: Math.abs(amount) >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 0, signDisplay: 'exceptZero' }).format(amount);
}
