'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { accountApi } from './dashboard-api';
import { accountAge, accountSlotLayout, accountView, type AccountView, type DashboardSnapshot, type Journey } from './dashboard-model';
import styles from './accounts.module.css';
import { AccountSlotStack } from './account-slot-stack';

const states: Record<AccountView, { label: string; hint: string; tone: string }> = {
  active: { label: 'Active', hint: 'Continue your account', tone: 'ready' },
  passed: { label: 'Passed', hint: 'View evaluation results', tone: 'ready' },
  failed: { label: 'Failed', hint: 'View evaluation results', tone: 'ended' },
  closed: { label: 'Closed', hint: 'View account history', tone: 'neutral' },
  locked: { label: 'Locked', hint: 'Review account access', tone: 'pending' },
  payment: { label: 'Payment pending', hint: 'View purchase status', tone: 'pending' },
  preparing: { label: 'Preparing account', hint: 'View setup progress', tone: 'pending' },
  compliance: { label: 'Compliance needed', hint: 'Review your next step', tone: 'pending' },
  invitation: { label: 'Invitation pending', hint: 'Finish your trading setup', tone: 'pending' },
  'setup-issue': { label: 'Setup needs attention', hint: 'Get help with account setup', tone: 'pending' },
  reconciling: { label: 'Checking account', hint: 'View the latest account state', tone: 'pending' },
};

export function Accounts() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    accountApi<DashboardSnapshot>(`/api/trading/dashboard${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: controller.signal })
      .then(next => {
        if (controller.signal.aborted) return;
        setSnapshot(previous => !cursor || !previous ? next : {
          ...next,
          accounts: [...new Map([...previous.accounts, ...next.accounts].map(account => [account.id, account])).values()],
          history: { ...next.history, accounts: [...new Map([...previous.history.accounts, ...next.history.accounts].map(account => [account.id, account])).values()] },
        });
      })
      .catch(() => { if (!controller.signal.aborted) setError('We couldn’t load your accounts. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cursor, revision]);

  const layout = snapshot ? accountSlotLayout(snapshot) : null;
  const previous = layout?.previous ?? [];

  return <div className={styles.page}>
    {error && <div className={styles.notice} role="alert"><p>{error}</p><button onClick={() => setRevision(value => value + 1)} disabled={loading}>Try again</button></div>}
    {!snapshot && loading ? <div className={styles.loading} role="status">Loading your accounts…</div> : snapshot && layout && <>
      <AccountSlotStack>
        {layout.current.map((journey, index) => <AccountSlot key={journey.id} journey={journey} snapshot={snapshot} index={index + 1} />)}
        {Array.from({ length: layout.checking }, (_, index) => <CheckingSlot key={`checking-${index}`} index={layout.current.length + index + 1} onRefresh={() => setRevision(value => value + 1)} loading={loading} />)}
        {Array.from({ length: layout.available }, (_, index) => <EmptySlot key={`empty-${index}`} index={layout.current.length + layout.checking + index + 1} snapshot={snapshot} welcome={!layout.current.length && !layout.checking && !snapshot.checkout && index === 0} returning={previous.length > 0} />)}
      </AccountSlotStack>
      {previous.length > 0 && <section aria-labelledby="previous-accounts"><div className={styles.sectionHeading}><h2 id="previous-accounts">Previous accounts</h2><span>Your past evaluations</span></div><div className={styles.list}>{previous.map(journey => <PreviousAccount key={journey.id} journey={journey} snapshot={snapshot} />)}</div></section>}
      {snapshot.history.hasMore && snapshot.history.nextCursor && <button className={styles.more} disabled={loading} onClick={() => { setCursor(snapshot.history.nextCursor); setRevision(value => value + 1); }}>{loading ? 'Loading accounts…' : 'Load more accounts ↓'}</button>}
      {!snapshot.checkoutAvailable && <p className={styles.purchaseUnavailable}>Purchase status is temporarily unavailable. Your account list is still available.</p>}
    </>}
  </div>;
}

function EmptySlot({ index, snapshot, welcome, returning }: { index: number; snapshot: DashboardSnapshot; welcome: boolean; returning: boolean }) {
  const checkout = snapshot.checkout;
  const href = checkout ? `/checkout?checkout=${encodeURIComponent(checkout.id)}` : '/checkout';
  const purchaseLabel = checkout ? checkout.state === 'pending' ? 'View purchase status' : 'Continue checkout' : welcome ? returning ? 'Buy your next account' : 'Buy your first account' : 'Purchase account';
  return <section className={`${styles.slotCard} ${styles.empty} ${welcome ? styles.welcome : styles.newSlot}`} aria-label={`Account slot ${index}`}>
    <span className={styles.slotNumber}>Slot {String(index).padStart(2, '0')}</span>
    <img className={styles.welcomeArt} src={welcome ? '/account/first-visit-art.png' : '/account/new-slot-art.png'} width={welcome ? 360 : 255} height={welcome ? 172 : 158} alt="" draggable={false} />
    <h2>{welcome ? returning ? 'Your next chapter awaits' : 'Your journey starts here' : 'New account slot'}</h2>
    <p>{welcome ? returning ? 'Your previous evaluations are saved below. Start your next chapter.' : 'Start an evaluation and trade with Certa.' : 'Start another evaluation and continue your journey.'}</p>
    <div className={styles.emptyActions}>
      {snapshot.checkoutAvailable ? <Link className={`${styles.emptyAction} ${styles.firstPurchase}`} href={href}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{purchaseLabel}</Link> : <p className={styles.unavailableAction}>Purchase status unavailable</p>}
      {welcome && <Link className={`${styles.emptyAction} ${styles.accountRules}`} href="/account/rules"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 9h6M9 13h6" /></svg>Account rules<svg className={styles.rulesArrow} viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></Link>}
    </div>
    {!welcome && <p className={styles.slotHelp}>{checkout ? 'Finish your current purchase before adding another account.' : snapshot.allocation.compliance.kyc ? 'Identity verification complete. Your next slot is available.' : 'Additional accounts require identity verification.'}</p>}
  </section>;
}

function CheckingSlot({ index, onRefresh, loading }: { index: number; onRefresh: () => void; loading: boolean }) {
  return <section className={`${styles.slotCard} ${styles.empty}`} aria-label={`Account slot ${index}`}>
    <span className={styles.slotNumber}>Slot {String(index).padStart(2, '0')}</span>
    <img className={styles.welcomeArt} src="/account/delayed-art.png" width="193" height="119" alt="" />
    <h2>Checking account slot</h2><p>We’re confirming availability. Check again before starting a new purchase.</p>
    <div className={styles.emptyActions}><button className={styles.checkSlot} onClick={onRefresh} disabled={loading}>{loading ? 'Checking…' : 'Check availability'} <span aria-hidden>↻</span></button></div>
  </section>;
}

function AccountSlot({ journey, snapshot, index }: { journey: Journey; snapshot: DashboardSnapshot; index: number }) {
  const view = accountView(journey, snapshot);
  const account = journey.account;
  const checkout = journey.slot?.checkout ?? (snapshot.checkout?.slot_ids.includes(journey.id) ? snapshot.checkout : null);
  const saved = view === 'payment' && checkout?.state === 'open';
  const state = view === 'payment' ? { label: saved ? 'Checkout saved' : checkout?.state === 'pending' ? 'Payment pending' : 'Checking purchase', tone: saved ? 'neutral' : 'pending' } : states[view];
  const accountHref = `/account?${account ? `account=${encodeURIComponent(account.id)}` : `slot=${encodeURIComponent(journey.id)}`}`;
  const href = view === 'payment' && checkout ? `/checkout?checkout=${encodeURIComponent(checkout.id)}` : accountHref;
  const art = view === 'invitation' ? 'invitation-art.png' : view === 'reconciling' || view === 'setup-issue' ? 'delayed-art.png' : view === 'payment' || view === 'preparing' || view === 'compliance' ? 'preparing-art.png' : account?.kind === 'funded' ? 'funded-art.png' : 'first-visit-art.png';
  const descriptions: Partial<Record<AccountView, string>> = {
    payment: saved ? 'Your checkout is saved. Continue when you’re ready.' : checkout?.state === 'pending' ? 'Payment is still being confirmed. Your account will appear when setup is complete.' : 'Your purchase status is being checked. Open the details for the latest update.',
    preparing: 'Your account setup is in progress. View its latest status.',
    compliance: 'Complete your outstanding requirements to continue.',
    invitation: 'Accept your Tradara invitation to finish your trading setup.',
    'setup-issue': 'Account setup needs attention. Open the details for help.',
    reconciling: 'We’re checking the latest account information.',
    locked: 'Trading is paused. Your account details are still available.',
  };
  return <section className={styles.slotCard} aria-label={`Account slot ${index}`}>
    <div className={styles.cardTop}><div className={styles.cardIdentity}><img src="/brand/certa-crest.png" width="36" height="36" alt="" /><div><span className={styles.slotNumber}>Slot {String(index).padStart(2, '0')}</span><h2>{journey.label}</h2></div></div><span className={styles.status} data-tone={state.tone}><i aria-hidden />{state.label}</span></div>
    <img className={styles.accountArt} src={`/account/${art}`} width="360" height="210" alt="" />
    {descriptions[view] && <p className={styles.cardDescription}>{descriptions[view]}</p>}
    {account && <dl className={styles.accountDetails}><div><dt>Account type</dt><dd>{account.kind === 'funded' ? 'Sim funded' : account.kind === 'practice' ? 'Practice' : 'Evaluation'}</dd></div><div><dt>Started</dt><dd>{accountAge(account.started_at)?.replace(/^Started /, '') ?? 'Not available'}</dd></div></dl>}
    <div className={styles.cardBottom}>{account?.vendor_updated_at && <span className={styles.cardUpdated}>Updated <time dateTime={account.vendor_updated_at}>{new Date(account.vendor_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time></span>}<Link className={`${styles.emptyAction} ${styles.firstPurchase}`} href={href} prefetch={false}>{view === 'payment' ? saved ? 'Continue checkout' : 'View purchase status' : account ? 'Open account' : 'View setup'} <span aria-hidden>→</span></Link></div>
  </section>;
}

function PreviousAccount({ journey, snapshot }: { journey: Journey; snapshot: DashboardSnapshot }) {
  const state = states[accountView(journey, snapshot)];
  const account = journey.account;
  if (!account) return null;
  const age = accountAge(account.started_at);
  return <Link href={`/account/history/${encodeURIComponent(account.id)}`} prefetch={false} className={styles.save}>
    <div className={styles.saveArt} data-tone={state.tone} aria-hidden><svg viewBox="0 0 32 32" fill="none"><path d="m3 26 9-18 6 11 4-7 7 14H3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m9 14 3 2 3-2m7-2v-8m0 0h6l-2 2 2 2h-6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></div>
    <div className={styles.saveIdentity}><span className={styles.kind}>{account?.kind === 'funded' ? 'Funded account' : account?.kind === 'practice' ? 'Practice account' : 'Evaluation'}</span><h3>{journey.label}</h3><p>{age ?? (account ? 'Start date unavailable' : 'Not started yet')}{age && account?.started_at && <time dateTime={account.started_at}>{new Date(account.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time>}</p></div>
    <div className={styles.saveState}><span className={styles.status} data-tone={state.tone}><i aria-hidden />{state.label}</span><span className={styles.hint}>{state.hint}</span></div><span className={styles.arrow} aria-hidden>↗</span>
  </Link>;
}
