'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { accountFacts, accountLabel, accountView, journeys, terminal, usd, type AccountView, type DashboardSnapshot, type GameSnapshot, type Journey, type TradingAccount } from './dashboard-model';
import { useAccountDashboard, useHistoricalAccount, useSelectedAccount } from './use-account-dashboard';
import { JourneyScene, type JourneyPhase } from './journey';
import { CreatorCode } from './creator-code';
import { useRecordingAccount } from './session-recorder';
import { TradingActivity } from './trading-activity';
import styles from './dashboard.module.css';

const copy: Record<Exclude<AccountView, 'active'>, { title: string; body: string; action: string; destination: 'compliance' | 'checkout' | 'terminal' | 'support' | 'history' }> = {
  payment: { title: 'Your next account starts here.', body: 'Your checkout is saved. Continue when you’re ready.', action: 'Continue checkout', destination: 'checkout' },
  preparing: { title: 'Getting your account ready.', body: 'We’ll update this account when it’s ready to trade.', action: 'View purchase', destination: 'checkout' },
  compliance: { title: 'Complete compliance.', body: 'Compliance is needed to continue with this account.', action: 'Complete compliance', destination: 'compliance' },
  invitation: { title: 'Finish trading setup.', body: 'Accept your Tradara invitation to access this account.', action: 'Open trading setup', destination: 'terminal' },
  'setup-issue': { title: 'Setup needs attention.', body: 'Contact support to finish issuing this account.', action: 'Contact support', destination: 'support' },
  reconciling: { title: 'Confirming your account.', body: 'Your setup is being checked. There’s no need to start again.', action: 'Get help', destination: 'support' },
  passed: { title: 'Evaluation passed.', body: 'Your evaluation is complete. Your trading history is saved.', action: 'View account history', destination: 'history' },
  failed: { title: 'Evaluation ended.', body: 'This account is no longer active. Your trading history is saved.', action: 'View account history', destination: 'history' },
  closed: { title: 'Account closed.', body: 'Your account details and trading history are still available.', action: 'View account history', destination: 'history' },
  locked: { title: 'Trading is paused.', body: 'You can still review this account and its trading activity.', action: 'View trading access', destination: 'terminal' },
};
const statusLabels: Record<AccountView, string> = { active: 'Active', preparing: 'Preparing account', payment: 'Checkout', compliance: 'Action needed', invitation: 'Finish setup', 'setup-issue': 'Setup needs attention', reconciling: 'Confirming setup', passed: 'Passed', failed: 'Failed', closed: 'Closed', locked: 'Trading paused' };

function reflectSelectionInUrl(journey: Journey | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete('account');
  url.searchParams.delete('slot');
  if (journey?.account) url.searchParams.set('account', journey.account.id);
  else if (journey?.slot) url.searchParams.set('slot', journey.slot.id);
  if (url.href !== window.location.href) window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export function Dashboard({ userId, initialAccountId, historical = false }: { userId: string; initialAccountId?: string; historical?: boolean }) {
  const { snapshot, error, refreshing, revision, live, refresh } = useAccountDashboard(userId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [storageReady, setStorageReady] = useState(false);
  const lastSelected = useRef<Journey | null>(null);
  const observedAccounts = useRef(new Map<string, Journey>());
  const selectionKey = `certa:selected-journey:${userId}`;
  const seenKey = `certa:seen-results:${userId}`;
  useEffect(() => {
    try {
      setSelectedId(initialAccountId ?? sessionStorage.getItem(selectionKey));
      const saved = JSON.parse(localStorage.getItem(seenKey) ?? '[]');
      if (Array.isArray(saved)) setSeen(new Set(saved.filter(value => typeof value === 'string')));
    } catch { /* Storage is optional. */ }
    setStorageReady(true);
    const sync = (event: StorageEvent) => { if (event.key === seenKey) { try { const next = JSON.parse(event.newValue ?? '[]'); if (Array.isArray(next)) setSeen(new Set(next)); } catch { /* Ignore malformed optional state. */ } } };
    addEventListener('storage', sync); return () => removeEventListener('storage', sync);
  }, [selectionKey, seenKey, initialAccountId]);
  const tabs = useMemo(() => {
    if (!snapshot) return [];
    const current = journeys(snapshot);
    // Keep an account observed during this visit selectable until its outcome is
    // acknowledged, even when the server has already released its slot.
    for (const [id, previous] of observedAccounts.current) {
      const account = snapshot.accounts.find(account => account.id === id);
      if (account && terminal(account.lifecycle) && !current.some(journey => journey.account?.id === id) && !dismissed.has(id) && snapshot.events.some(event => event.account_id === id && !seen.has(event.id))) {
        current.push({ ...previous, id: current.some(journey => journey.id === previous.id) ? `result:${id}` : previous.id, account, slot: null });
      }
    }
    return current.filter(journey => !journey.account || !terminal(journey.account.lifecycle) || journey.slot?.pending_entitlement_id || !dismissed.has(journey.account.id) && snapshot.events.some(event => event.account_id === journey.account?.id && !seen.has(event.id)));
  }, [snapshot, dismissed, seen]);
  useEffect(() => {
    if (snapshot) for (const journey of journeys(snapshot)) if (journey.account && !terminal(journey.account.lifecycle)) observedAccounts.current.set(journey.account.id, journey);
  }, [snapshot]);
  const historicalAccount = historical && initialAccountId && snapshot ? snapshot.accounts.find(account => account.id === initialAccountId) ?? snapshot.history.accounts.find(account => account.id === initialAccountId) : null;
  const historyFallback = useHistoricalAccount(userId, historical && initialAccountId && snapshot && !historicalAccount ? initialAccountId : null, revision);
  let selected: Journey | null = tabs.find(tab => tab.id === selectedId || tab.account?.id === selectedId) ?? (initialAccountId ? tabs.find(tab => tab.account?.id === initialAccountId) : undefined) ?? tabs[0] ?? null;
  if (historical && initialAccountId && snapshot) {
    const account = historicalAccount ?? historyFallback.account;
    selected = account ? { id: account.id, label: accountLabel(account), account, slot: null } : null;
  } else if (lastSelected.current && snapshot && !tabs.some(tab => tab.id === lastSelected.current?.id) && !dismissed.has(lastSelected.current.account?.id ?? '')) {
    const event = snapshot.events.find(event => event.account_id === lastSelected.current?.account?.id && !seen.has(event.id));
    if (event) { const account = snapshot.accounts.find(account => account.id === event.account_id) ?? lastSelected.current.account; selected = { ...lastSelected.current, account }; }
  } else if (snapshot && selectedId && !tabs.some(tab => tab.id === selectedId || tab.account?.id === selectedId)) {
    const previous = snapshot.accounts.find(account => account.id === selectedId || account.slot_id === selectedId);
    if (previous && !dismissed.has(previous.id) && snapshot.events.some(event => event.account_id === previous.id && !seen.has(event.id))) selected = { id: previous.slot_id ?? previous.id, label: accountLabel(previous), account: previous, slot: null };
  }
  useRecordingAccount(selected?.account?.id ?? null);
  useEffect(() => { if (selected) lastSelected.current = selected; }, [selected]);
  useEffect(() => {
    if (!historical && storageReady && snapshot) reflectSelectionInUrl(selected);
  }, [historical, storageReady, Boolean(snapshot), selected?.account?.id, selected?.slot?.id]);
  const details = useSelectedAccount(selected?.account?.id ?? null, revision);
  const facts = accountFacts(details.summary, details.game);
  const event = !historical && storageReady && selected?.account ? snapshot?.events.find(event => event.account_id === selected?.account?.id && !seen.has(event.id)) : null;
  const baseView = selected && snapshot ? accountView(selected, snapshot) : null;
  const view: AccountView | null = event ? event.type === 'passed' ? 'passed' : event.type === 'closed' ? 'closed' : 'failed' : baseView;
  const select = (journey: Journey) => {
    lastSelected.current = journey; setSelectedId(journey.id);
    reflectSelectionInUrl(journey);
    try { sessionStorage.setItem(selectionKey, journey.id); } catch { /* Storage is optional. */ }
  };
  const navigateTabs = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !tabs.length) return;
    event.preventDefault();
    const current = tabs.findIndex(tab => tab.id === selected?.id);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    select(tabs[index]);
    document.getElementById(`tab-${tabs[index].id}`)?.focus();
  };
  const acknowledge = useCallback(() => {
    if (event) setSeen(previous => { const next = new Set(previous).add(event.id); try { localStorage.setItem(seenKey, JSON.stringify([...next].slice(-300))); } catch { /* No financial state changes depend on this. */ } return next; });
    if (selected?.account && terminal(selected.account.lifecycle) && !selected.slot?.pending_entitlement_id) {
      setDismissed(previous => new Set(previous).add(selected.account!.id)); lastSelected.current = null; setSelectedId(null);
    }
    requestAnimationFrame(() => { const target = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? document.getElementById('account-view'); target?.focus({ preventScroll: true }); });
  }, [event, seenKey, selected]);
  const accountQuery = selected?.account ? `?account=${encodeURIComponent(selected.account.id)}` : selected?.slot ? `?slot=${encodeURIComponent(selected.slot.id)}` : '';
  const hasAccount = Boolean(selected?.account);
  const phase: JourneyPhase = !view ? 'empty' : view === 'failed' || view === 'closed' ? 'failed' : view === 'passed' ? 'passed' : view === 'locked' ? 'locked' : view === 'active' ? selected?.account?.kind ?? 'evaluation' : 'pending';
  const funded = selected?.account?.kind === 'funded';
  const qualifyingDays = details.game?.eligibility?.qualifying_dates?.length ?? null;
  const progress = view === 'passed' ? 1 : funded ? details.game?.eligibility?.eligible ? 1 : Math.min(.9, (qualifyingDays ?? 0) / 5) : facts.progress;
  const caption = phase === 'evaluation' && facts.remaining !== null ? <><strong>{usd(facts.remaining)}</strong> to profit target</> : funded && qualifyingDays !== null ? <><strong>{qualifyingDays}</strong> qualifying trading {qualifyingDays === 1 ? 'day' : 'days'}</> : null;
  const actionable = view && view !== 'active' ? copy[view] : null;
  const paymentPending = view === 'payment' && selected?.slot?.checkout?.state === 'pending';
  const heading = paymentPending ? 'Confirming your payment.' : view === 'failed' ? selected?.account?.kind === 'funded' ? 'Funded account ended.' : 'Evaluation failed.' : actionable?.title;
  const body = paymentPending ? 'Your payment is being confirmed. Keep this checkout while we check.' : actionable?.body;
  const selectedPendingFunded = Boolean(selected?.slot?.pending_entitlement_id && selected.account && ['passed', 'upgraded'].includes(selected.account.lifecycle));
  const path = selectedPendingFunded && view === 'preparing' ? '/account/history' : actionable?.destination === 'checkout' ? `/checkout${selected?.slot?.checkout?.id ? `?checkout=${selected.slot.checkout.id}` : ''}` : `/account/${actionable?.destination ?? 'terminal'}${accountQuery}`;
  const displayFigures = hasAccount && ['active', 'locked'].includes(view ?? '') || historical && hasAccount;
  const unavailableError = error && !snapshot ? error : historical && !historicalAccount ? historyFallback.error : null;
  const unavailable = Boolean(unavailableError);
  const loading = !snapshot && !error || historical && !historicalAccount && historyFallback.loading;
  const purchaseDisabled = Boolean(snapshot && snapshot.allocation.available <= 0 && !snapshot.checkout);
  const purchaseHref = '/checkout';
  return <div className={styles.dashboard}>
    <div className={styles.pageHeading}>
      <div><Link className={styles.backLink} href="/account">← Accounts</Link><h1>{historical ? selected?.label ?? 'Account history' : 'Overview'}</h1></div>
      <div className={styles.headingActions}>
        {historical && <button className={styles.refreshButton} onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh accounts" title="Refresh accounts"><RefreshIcon spinning={refreshing} /></button>}
        {hasAccount && <Link className={styles.terminalButton} href={`/account/terminal${accountQuery}`}>Open terminal <span aria-hidden>↗</span></Link>}
        {!historical && <div className={styles.purchase}>
          {purchaseDisabled ? <span className={styles.capacity} title="Pending accounts also reserve a slot">{snapshot?.allocation.occupied} of {snapshot?.allocation.limit} slots in use</span> : <Link className={`${styles.buyButton} ${styles.primaryPurchase}`} href={purchaseHref}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 5v14M5 12h14" /></svg>{snapshot?.checkout ? 'Continue checkout' : 'Purchase account'}</Link>}
          <CreatorCode key={userId} />
        </div>}
      </div>
    </div>
    {!historical && <div className={styles.accountBar}>
      <div className={styles.tabs} role="tablist" aria-label="Your accounts" onKeyDown={navigateTabs}>
        {tabs.map(tab => <button type="button" key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={selected?.id === tab.id} tabIndex={selected?.id === tab.id ? 0 : -1} aria-controls="account-view" className={styles.accountTab} onClick={() => select(tab)}><span>{tab.label}</span><span className={styles.tabDot} data-state={accountView(tab, snapshot!)} aria-label={statusLabels[accountView(tab, snapshot!)]} /></button>)}
        {!tabs.length && <span className={styles.accountCount}>{loading ? 'Your accounts' : snapshot ? 'No active accounts' : 'Accounts'}</span>}
      </div>
      <div className={styles.accountUtilities}>
        <Link href="/account/evaluations" className={styles.pricingLink}>Evaluation pricing <span aria-hidden>↗</span></Link>
        <Link href="/account/history" className={styles.historyLink} title="Account history" aria-label="Account history"><HistoryIcon /></Link>
        <button className={styles.refreshButton} onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh accounts" title="Refresh accounts"><RefreshIcon spinning={refreshing} /></button>
      </div>
    </div>}
    {error && snapshot && <div className={styles.inlineNotice} role="status">Your last account update is shown. <button onClick={() => void refresh()}>Try again</button></div>}
    {snapshot?.allocation.over_capacity && <div className={styles.inlineNotice}>All your accounts are shown. Contact support before adding another.</div>}
    <p className={styles.srOnly} role="status">{event ? `${selected?.label}: ${event.type === 'passed' ? 'evaluation passed' : event.type === 'failed' ? 'account failed' : 'account closed'}.` : ''}</p>
    <section id="account-view" tabIndex={-1} role={!historical && selected ? 'tabpanel' : undefined} aria-labelledby={!historical && selected && tabs.some(tab => tab.id === selected.id) ? `tab-${selected.id}` : undefined}>
      {loading ? <div className={styles.loadingHero} aria-label="Loading accounts"><div className={styles.skeletonText} /><div className={styles.skeletonAmount} /><div className={styles.skeletonText} /><div className={styles.loadingMountain} /></div> : unavailable ? <div className={styles.emptyHero}><div className={styles.emptyCopy}><span className={styles.stateLabel}>Your accounts</span><h2>{historical ? "We couldn’t load this account." : "We couldn’t load your accounts."}</h2><p>{unavailableError}</p><button className={styles.buyButton} onClick={() => void refresh()}>Try again <span aria-hidden>↗</span></button></div><JourneyScene userId={userId} accountId="unavailable" phase="pending" progress={0} /></div> : !selected ? <div className={styles.emptyHero}><div className={styles.emptyCopy}><span className={styles.stateLabel}>{historical ? 'Account history' : snapshot?.history.accounts.length ? 'Your accounts' : 'Welcome to Certa'}</span><h2>{historical ? 'Account not found.' : snapshot?.history.accounts.length ? 'Start another evaluation.' : 'Your first evaluation.'}</h2><p>{historical ? 'This account is not available on your profile.' : snapshot?.history.accounts.length ? 'Your previous accounts are safely in your history.' : 'One evaluation. A clear path to a funded account.'}</p><div className={styles.stateActions}><Link className={styles.buyButton} href={historical ? '/account/history' : '/account/evaluations'}>{historical ? 'Account history' : 'View evaluations & pricing'} <span aria-hidden>↗</span></Link><Link className={styles.textLink} href={historical ? '/account' : '/account/rules'}>{historical ? 'Overview' : 'How it works'} <span aria-hidden>↗</span></Link></div></div><JourneyScene userId={userId} accountId="empty" phase="empty" progress={0} /></div> : <>
        <div className={`${styles.hero} ${!displayFigures ? styles.stateHero : ''}`}>
          <div className={styles.accountFacts}><div className={styles.accountStatus}><span>{selectedPendingFunded ? 'Funded account' : selected.account?.kind === 'funded' ? 'Sim Funded' : selected.account?.kind === 'practice' ? 'Practice' : 'Evaluation'}</span><span className={styles.statusDot} data-state={view} /><span>{historical ? selected.account?.lifecycle : statusLabels[view ?? 'active']}</span>{displayFigures && !historical && <Link className={styles.mobileQuick} href={`/account/terminal${accountQuery}`}>Open terminal <span aria-hidden>↗</span></Link>}</div>
            {displayFigures ? <><div className={styles.balance}>{details.loading ? <span className={styles.skeletonAmount} /> : usd(facts.balance)}</div><p className={styles.freshness}>{historical ? 'Last recorded balance' : 'Account balance'}<span>·</span>{facts.asOf ? <time dateTime={facts.asOf} title={`${new Date(facts.asOf).toLocaleString()}${live ? ' · Live connection active' : ''}`}>{updateTime(facts.asOf)}</time> : 'Awaiting first update'}</p>
              <div className={styles.metrics}><div><span>Net profit</span><strong className={facts.pnl !== null && facts.pnl < 0 ? styles.negative : styles.positive}>{usd(facts.pnl, true)}</strong></div><div><span>Loss limit</span><strong>{usd(facts.lossLimit)}</strong></div></div>
              {facts.unrealized !== null && facts.unrealized !== 0 && <p className={styles.openPnl}>Open P&amp;L <b>{usd(facts.unrealized, true)}</b></p>}
              {view === 'locked' && <p className={styles.inlineNotice}>Trading is paused. <Link href={`/account/terminal${accountQuery}`}>View access ↗</Link></p>}
              {details.game?.vendor_progress.awaiting_vendor_pass && view === 'active' && <p className={styles.inlineNotice}>Target reached. Awaiting pass confirmation.</p>}
              {details.error && <p className={styles.dataNotice} role="status">{details.error} Your last available values are shown.</p>}
            </> : <><h2 className={styles.stateTitle}>{heading}</h2><p className={styles.stateBody}>{body}</p><div className={styles.stateActions}><Link className={styles.buyButton} href={path}>{paymentPending ? 'View payment status' : selectedPendingFunded && view === 'preparing' ? 'View account history' : actionable?.action} <span aria-hidden>↗</span></Link>{event && <button className={styles.textButton} onClick={acknowledge}>Continue <span aria-hidden>→</span></button>}{!event && (view === 'failed' || view === 'closed') && <button className={styles.textButton} onClick={acknowledge}>Back to overview →</button>}</div></>}
          </div>
          <div className={styles.journeyColumn}><JourneyScene userId={userId} accountId={selected.account?.id ?? selected.id} phase={phase} progress={progress} initialized={!displayFigures || !details.loading && (funded ? qualifyingDays !== null : facts.pnl !== null && facts.target !== null)} targetLabel={facts.target ? usd(facts.target) : undefined} />{caption && displayFigures && <p className={styles.journeyCaption}>{caption}</p>}</div>
        </div>
        {displayFigures && selected.account && <TradingActivity key={selected.account.id} accountId={selected.account.id} revision={revision} objectives={<Objectives facts={facts} game={details.game} account={selected.account} snapshot={snapshot!} historical={historical} />} />}
        {!displayFigures && selected.slot && <div className={styles.pendingFooter}><span>{selected.label}</span><span>{view === 'payment' ? 'Your saved checkout' : selected.slot.pending_entitlement_id || !selected.account || !terminal(selected.account.lifecycle) ? 'This slot is reserved for you' : 'Trading history is available'}</span><button className={styles.textButton} onClick={() => void refresh()} disabled={refreshing}>{refreshing ? 'Checking…' : 'Check for updates'} ↻</button></div>}
      </>}
    </section>
  </div>;
}

function Objectives({ facts, game, account, snapshot, historical }: { facts: ReturnType<typeof accountFacts>; game: GameSnapshot | null; account: TradingAccount; snapshot: DashboardSnapshot; historical: boolean }) {
  const passed = ['passed', 'upgraded'].includes(account.lifecycle);
  const funded = account.kind === 'funded';
  const rows = funded ? [{ label: 'Qualifying days', detail: game?.eligibility?.qualifying_dates ? `${game.eligibility.qualifying_dates.length} completed` : 'Awaiting session reports', done: game?.eligibility?.eligible === true }, { label: 'Payout eligibility', detail: game?.eligibility?.eligible ? 'Eligible to request' : 'Requirements in progress', done: game?.eligibility?.eligible === true }] : [{ label: 'Profit target', detail: facts.remaining !== null ? facts.remaining === 0 ? passed ? 'Complete' : 'Awaiting confirmation' : `${usd(facts.remaining)} remaining` : 'Awaiting account criteria', done: passed }, ...(facts.minimumTrades !== null ? [{ label: 'Minimum trades', detail: `${facts.trades ?? 0} of ${facts.minimumTrades}`, done: facts.trades !== null && facts.trades >= facts.minimumTrades }] : [])];
  const complianceNeeded = !historical && account.kind === 'funded' && !Object.values(snapshot.allocation.compliance).every(Boolean);
  return <aside className={styles.objectives}><div className={styles.sectionHead}><h2>{account.kind === 'practice' ? 'Your practice' : 'Objectives'}</h2><span>{rows.filter(row => row.done).length} of {rows.length}</span></div>{rows.map(row => <div className={styles.objective} key={row.label}><span className={row.done ? styles.objectiveDone : styles.objectivePending} aria-label={row.done ? 'Complete' : 'In progress'}>{row.done ? '✓' : ''}</span><div><strong>{row.label}</strong><p>{row.detail}</p></div></div>)}{complianceNeeded && <Link href={`/account/compliance?account=${account.id}`} className={styles.complianceLink}>Complete compliance <span aria-hidden>↗</span></Link>}<Link className={styles.objectiveRules} href={`/account/rules?account=${account.id}`}>View account rules <span aria-hidden>↗</span></Link></aside>;
}
function updateTime(value: string) { return `Updated ${new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`; }
function RefreshIcon({ spinning }: { spinning: boolean }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={spinning ? styles.spinning : undefined} aria-hidden><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 7a7.5 7.5 0 0 1 12.7-1L20 9M4 15l1.8 3a7.5 7.5 0 0 0 12.7-1" /></svg>; }
function HistoryIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 5v5h5M3.5 10a9 9 0 1 1 1.5 8M12 7v5l3 2" /></svg>; }
