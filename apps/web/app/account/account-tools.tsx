'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { accountApi } from './dashboard-api';
import { accountLabel, journeys, safeExternal, usd, type DashboardSnapshot, type Summary, type TradingAccount } from './dashboard-model';
import styles from './account-tools.module.css';

type ToolProps = { account?: string; slot?: string };
type ComplianceKind = 'kyc' | 'sim_funded' | 'w9' | 'w8ben';
type Requirement = 'kyc' | 'tax' | 'agreement';
type ComplianceRequest = { id: string; kind: ComplianceKind; requirement: Requirement; version: string; provider_id: string | null; state: string; created_at: string };
type ComplianceStatus = { compliance: Record<Requirement, boolean>; requirements: { id: Requirement; version: string }[]; tax_choice: { kind: 'w9' | 'w8ben' } | null };
type Access = { status: string; requires_acceptance: boolean; login_url: string | null; checked_at: string | null };
type Operation = { id: string; state: string };
const pendingStates = ['queued', 'creating', 'pending', 'unknown'];
const backHref = (account?: string) => account ? `/account?account=${encodeURIComponent(account)}` : '/account';
const selectionQuery = ({ account, slot }: ToolProps) => account ? `?account=${encodeURIComponent(account)}` : slot ? `?slot=${encodeURIComponent(slot)}` : '';

function Arrow({ direction = 'right' }: { direction?: 'right' | 'left' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={direction === 'left' ? { transform: 'rotate(180deg)' } : undefined}><path d="M4 12h16m-6-6 6 6-6 6" /></svg>;
}

function ToolFrame({ title, account, slot, children, action }: ToolProps & { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className={styles.tool}>
    <Link href={backHref(account ?? slot)} className={styles.back}><Arrow direction="left" />Back to overview</Link>
    <div className={styles.heading}><h1>{title}</h1>{action}</div>
    {children}
  </section>;
}

function Loading() { return <div className={styles.loading} role="status"><span />Loading your information…</div>; }
function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className={styles.notice} role="alert"><p>{message}</p>{retry && <button type="button" className={styles.secondary} onClick={retry}>Try again</button>}</div>;
}

function AccountChooser({ destination }: { destination: 'terminal' | 'rules' }) {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    accountApi<DashboardSnapshot>('/api/trading/dashboard', { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(() => { if (!controller.signal.aborted) setError('Your accounts are unavailable right now.'); });
    return () => controller.abort();
  }, [revision]);
  if (error) return <ErrorNotice message={error} retry={() => setRevision(value => value + 1)} />;
  if (!data) return <Loading />;
  const accounts = destination === 'terminal'
    ? journeys(data).map(journey => ({ id: journey.id, label: journey.label, query: selectionQuery({ account: journey.account?.id, slot: journey.slot?.id }) }))
    : data.accounts.filter(item => !['failed', 'closed', 'passed', 'upgraded', 'breached'].includes(item.lifecycle)).map(item => ({ id: item.id, label: accountLabel(item), query: selectionQuery({ account: item.id }) }));
  return <div className={styles.section}>
    <h2>{accounts.length ? 'Choose an account' : 'No trading account yet'}</h2>
    {accounts.length ? <div className={styles.choices}>{accounts.map(item => <Link className={styles.choice} key={item.id} href={`/account/${destination}${item.query}`}><span>{item.label}</span><Arrow /></Link>)}</div>
      : <><p>Your account will appear here once it is issued.</p><Link className={styles.primary} href="/account">Back to overview<Arrow /></Link></>}
  </div>;
}

export function ComplianceTool({ account, slot }: ToolProps) {
  const [data, setData] = useState<{ status: ComplianceStatus; requests: ComplianceRequest[] } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [taxChoice, setTaxChoice] = useState<'w9' | 'w8ben' | ''>('');
  const [hasMore, setHasMore] = useState(false);
  const keys = useRef(new Map<string, string>());
  const mounted = useRef(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [status, requests] = await Promise.all([
      accountApi<ComplianceStatus>('/api/compliance/status', { signal }),
      accountApi<ComplianceRequest[]>('/api/compliance/requests', { signal }),
    ]);
    if (!signal?.aborted && mounted.current) { setData({ status, requests }); setHasMore(requests.length === 50); setError(''); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    mounted.current = true;
    refresh(controller.signal).catch(() => { if (!controller.signal.aborted) setError('Compliance is unavailable right now. Please try again.'); });
    return () => { mounted.current = false; controller.abort(); };
  }, [refresh]);

  async function action(id: string, run: () => Promise<void>) {
    setBusy(id); setError(''); setNotice('');
    try { await run(); } catch { if (mounted.current) setError('We couldn’t complete that action. Refresh your status before trying again, or contact support.'); }
    finally { if (mounted.current) setBusy(''); }
  }
  async function begin(kind: ComplianceKind) {
    if (kind === 'w9' || kind === 'w8ben') await accountApi('/api/compliance/tax-choice', { body: { kind } });
    if (!keys.current.has(kind)) keys.current.set(kind, crypto.randomUUID());
    await accountApi<ComplianceRequest>('/api/compliance/requests', { body: { kind }, idempotency: keys.current.get(kind)! });
    keys.current.delete(kind);
    await refresh();
    if (mounted.current) setNotice('Your request has started. Refresh your status when you’re ready to continue.');
  }
  async function launch(request: ComplianceRequest) {
    const result = await accountApi<{ url: string }>(`/api/compliance/requests/${request.id}/launch`, { body: {} });
    const url = safeExternal(result.url);
    if (!url) throw new Error('Unavailable link');
    if (mounted.current) window.location.assign(url);
  }
  async function check(request: ComplianceRequest) {
    await accountApi(`/api/compliance/requests/${request.id}/refresh`, { body: {} });
    if (mounted.current) setNotice('A status check is on its way. Refresh in a moment for the result.');
  }
  async function more() {
    if (!data?.requests.length) return;
    const requests = await accountApi<ComplianceRequest[]>(`/api/compliance/requests?cursor=${encodeURIComponent(data.requests.at(-1)!.id)}`);
    if (mounted.current) { setData(current => current ? { ...current, requests: [...current.requests, ...requests] } : null); setHasMore(requests.length === 50); }
  }
  const rows: { requirement: Requirement; title: string; kind: ComplianceKind; description: string }[] = [
    { requirement: 'kyc', title: 'Identity verification', kind: 'kyc', description: 'Verify your identity with Veriff.' },
    { requirement: 'tax', title: 'Tax form', kind: data?.status.tax_choice?.kind ?? (taxChoice || 'w9'), description: 'Choose and complete your tax form.' },
    { requirement: 'agreement', title: 'Funded agreement', kind: 'sim_funded', description: 'Review and sign your funded account agreement.' },
  ];

  return <ToolFrame title="Compliance" account={account} slot={slot} action={<button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void action('refresh', refresh)}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh status'}</button>}>
    {error && <ErrorNotice message={error} />}
    {notice && <p className={styles.feedback} role="status">{notice}</p>}
    {!data && !error && <Loading />}
    {data && <>
      {(['kyc', 'tax', 'agreement'] as const).every(requirement => data.status.compliance[requirement] === true) && <div className={styles.complete}><span aria-hidden="true">✓</span><div><h2>You’re up to date</h2><p>Your current verification and documents are approved.</p></div></div>}
      <div className={styles.requirements}>{rows.map(row => {
        const approved = data.status.compliance[row.requirement] === true;
        const version = data.status.requirements.find(item => item.id === row.requirement)?.version;
        const records = data.requests.filter(item => item.requirement === row.requirement).sort((a, b) => b.created_at.localeCompare(a.created_at));
        const request = records.find(item => pendingStates.includes(item.state)) ?? records.find(item => item.version === version);
        const current = request?.version === version;
        const pending = Boolean(request && pendingStates.includes(request.state));
        const needsHelp = Boolean(request && (request.state === 'unknown' || request.state === 'failed' || pending && !current));
        const state = approved ? 'Approved' : needsHelp ? 'Needs attention' : request?.state === 'pending' ? 'In progress' : pending ? 'Preparing' : request?.state === 'rejected' ? 'Not approved' : request?.state === 'expired' || request?.state === 'approved' ? 'Update required' : 'Required';
        const selectedTax = taxChoice || data.status.tax_choice?.kind || '';
        return <section key={row.requirement} className={styles.requirement}>
          <div className={styles.requirementMain}><h2>{row.title}</h2><p>{row.description}</p><span className={styles.status} data-approved={approved}>{state}</span></div>
          {!approved && <div className={styles.requirementActions}>
            {needsHelp ? <Link className={styles.secondary} href={`/account/support${selectionQuery({ account, slot })}`}>Contact support</Link>
              : request?.state === 'pending' ? <button disabled={Boolean(busy)} className={styles.primary} onClick={() => void action(row.requirement, () => launch(request))}>Continue<Arrow /></button>
              : pending ? <p className={styles.quiet}>Your request is being prepared.</p>
              : row.requirement === 'tax' ? <><label htmlFor="compliance-tax-form">Tax form<select id="compliance-tax-form" value={selectedTax} disabled={Boolean(busy)} onChange={event => setTaxChoice(event.target.value as 'w9' | 'w8ben' | '')}><option value="">Select your form</option><option value="w9">W-9</option><option value="w8ben">W-8BEN</option></select></label><button disabled={Boolean(busy) || !selectedTax} className={styles.primary} onClick={() => { if (selectedTax) void action('tax', () => begin(selectedTax)); }}>Start tax form<Arrow /></button></>
                : <button disabled={Boolean(busy)} className={styles.primary} onClick={() => void action(row.requirement, () => begin(row.kind))}>{row.requirement === 'kyc' ? 'Start verification' : 'Review agreement'}<Arrow /></button>}
            {request?.provider_id && <button disabled={Boolean(busy)} className={styles.textButton} onClick={() => void action(`check:${row.requirement}`, () => check(request))}>Check completion</button>}
          </div>}
        </section>;
      })}</div>
      {hasMore && <button className={styles.textButton} disabled={Boolean(busy)} onClick={() => void action('more', more)}>Load more requests</button>}
      <p className={styles.footnote}>Once you finish a hosted form, approval appears here after confirmation.</p>
    </>}
  </ToolFrame>;
}

export function TerminalTool({ account, slot }: ToolProps) {
  if (!account && !slot) return <ToolFrame title="Trading platform"><AccountChooser destination="terminal" /></ToolFrame>;
  return <SelectedTerminal key={`${account ?? ''}:${slot ?? ''}`} account={account} slot={slot} />;
}

function SelectedTerminal({ account, slot }: ToolProps) {
  const [data, setData] = useState<{ account: TradingAccount | null; label: string; access: Access } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [operation, setOperation] = useState<Operation | null>(null);
  const keys = useRef(new Map<string, string>());
  const mounted = useRef(true);
  useEffect(() => {
    const controller = new AbortController(); mounted.current = true; setError('');
    const load = async () => {
      if (account) {
        const [selected, access] = await Promise.all([
          accountApi<TradingAccount>(`/api/trading/accounts/${encodeURIComponent(account)}`, { signal: controller.signal }),
          accountApi<Access>('/api/trading/access', { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) setData({ account: selected, label: accountLabel(selected), access });
      } else {
        const snapshot = await accountApi<DashboardSnapshot>('/api/trading/dashboard', { signal: controller.signal });
        const selected = journeys(snapshot).find(journey => journey.slot?.id === slot);
        if (!selected) throw new Error('Selection unavailable');
        if (!controller.signal.aborted) setData({ account: selected.account, label: selected.label, access: snapshot.access });
      }
    };
    load().catch(() => { if (!controller.signal.aborted) { setData(null); setError('We couldn’t load trading access for this account.'); } });
    return () => { mounted.current = false; controller.abort(); };
  }, [account, slot, revision]);
  async function request(path: 'access/check' | 'invitations/resend') {
    setBusy(true); setError(''); setMessage('');
    try {
      if (!keys.current.has(path)) keys.current.set(path, crypto.randomUUID());
      const result = await accountApi<{ operation: Operation }>(`/api/trading/${path}`, { body: {}, idempotency: keys.current.get(path)! });
      if (mounted.current) { setOperation(result.operation); setMessage(path === 'access/check' ? 'Your access check is queued.' : 'Your invitation request is queued.'); }
      keys.current.delete(path);
    } catch { if (mounted.current) setError('We couldn’t confirm your request. Try the same action again to check it safely.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function checkOperation() {
    if (!operation) return;
    setBusy(true); setError('');
    try {
      const result = await accountApi<Operation>(`/api/trading/operations/${encodeURIComponent(operation.id)}`);
      if (!mounted.current) return;
      setOperation(result);
      setMessage(({ queued: 'Your request is still queued.', running: 'Your request is being processed.', confirmed: 'Request completed. Your latest access is shown below.', unknown: 'The result needs review. Contact support before sending another request.', failed: 'Your request could not be completed. Contact support for help.' } as Record<string, string>)[result.state] ?? 'Your request is being reviewed.');
      if (result.state === 'confirmed') setRevision(value => value + 1);
    } catch { if (mounted.current) setError('Your request status is unavailable. Please check again.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  const url = safeExternal(data?.access.login_url);
  const blocked = Boolean(operation && operation.state !== 'confirmed');
  const lifecycle = data?.account?.lifecycle.toLowerCase();
  const ended = ['failed', 'breached', 'closed'].includes(lifecycle ?? '');
  const passed = ['passed', 'upgraded'].includes(lifecycle ?? '');
  const restricted = lifecycle === 'locked' || ['SUSPENDED', 'REVOKED'].includes(data?.access.status ?? '');
  const title = ended ? 'This account is no longer active' : passed ? 'This evaluation is complete' : restricted ? 'Trading access needs attention' : data?.access.requires_acceptance ? 'Finish your Tradara invitation' : data?.access.status === 'UNLINKED' ? 'Connect your trading access' : data?.access.status === 'ACTIVE' && lifecycle === 'active' ? 'Your platform is ready' : data?.access.status === 'ACTIVE' && !data.account ? 'Your trading access is connected' : 'Check your trading access';
  return <ToolFrame title="Trading platform" account={account} slot={slot}>
    {error && <ErrorNotice message={error} retry={() => setRevision(value => value + 1)} />}
    {!data && !error && <Loading />}
    {data && <div className={styles.section}>
      <p className={styles.accountName}>{data.label}</p><h2>{title}</h2>
      <p>{ended || passed ? 'Return to your overview for the next step, or open Tradara to review this account.' : restricted ? 'Check this account in Tradara or contact support for help.' : data.access.requires_acceptance ? 'Open your invitation email and accept the Certa relationship in Tradara.' : data.access.status === 'UNLINKED' ? 'Request your invitation, then accept the Certa relationship in Tradara.' : data.access.status === 'ACTIVE' && !data.account ? 'Return to this evaluation’s overview to follow account setup.' : data.access.status === 'ACTIVE' ? 'Sign in with your Tradara credentials. Your account’s trading restrictions still apply.' : 'Use the access check below, or contact support if you need help.'}</p>
      <div className={styles.actions}>{url ? <a className={data.access.status === 'UNLINKED' ? styles.secondary : styles.primary} href={url} target="_blank" rel="noopener noreferrer">Open Tradara<Arrow /></a> : <p className={styles.quiet}>The platform link is currently unavailable.</p>}
        <button className={styles.secondary} disabled={busy || blocked} onClick={() => void request('access/check')}>Check access</button>
        {(data.access.requires_acceptance || data.access.status === 'UNLINKED') && <button className={data.access.status === 'UNLINKED' ? styles.primary : styles.textButton} disabled={busy || blocked} onClick={() => void request('invitations/resend')}>{data.access.status === 'UNLINKED' ? 'Send invitation' : 'Resend invitation'}</button>}
      </div>
      {message && <p className={styles.feedback} role="status">{message}</p>}
      {operation && <button className={styles.textButton} disabled={busy} onClick={() => void checkOperation()}>Check request status</button>}
      <Link className={styles.supportLink} href={`/account/support${selectionQuery({ account, slot })}`}>Need help signing in?<Arrow /></Link>
    </div>}
  </ToolFrame>;
}

export function RulesTool({ account, slot }: ToolProps) {
  if (!account && slot) return <PendingRules key={slot} slot={slot} />;
  if (!account) return <ToolFrame title="Account rules"><AccountChooser destination="rules" /><Link className={styles.supportLink} href="/#account-plan">Read the account guide<Arrow /></Link></ToolFrame>;
  return <SelectedRules key={account} account={account} />;
}

function PendingRules({ slot }: { slot: string }) {
  const [selection, setSelection] = useState<{ label: string; accountId: string | null } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    accountApi<DashboardSnapshot>('/api/trading/dashboard', { signal: controller.signal }).then(snapshot => {
      const selected = journeys(snapshot).find(journey => journey.slot?.id === slot);
      if (!selected) throw new Error('Selection unavailable');
      if (!controller.signal.aborted) setSelection({ label: selected.label, accountId: selected.account?.id ?? null });
    }).catch(() => { if (!controller.signal.aborted) { setSelection(null); setError('We couldn’t load this evaluation. Please try again.'); } });
    return () => controller.abort();
  }, [slot, revision]);
  if (selection?.accountId) return <SelectedRules key={selection.accountId} account={selection.accountId} />;
  return <ToolFrame title="Account rules" slot={slot}>
    {error ? <ErrorNotice message={error} retry={() => setRevision(value => value + 1)} /> : !selection ? <Loading /> : <div className={styles.section}>
      <p className={styles.accountName}>{selection.label}</p><h2>Your evaluation is being prepared</h2><p>Its account-specific rules will appear here after issuance.</p><Link className={styles.supportLink} href="/#account-plan">Read the account guide<Arrow /></Link>
    </div>}
  </ToolFrame>;
}

function SelectedRules({ account }: { account: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    accountApi<Summary>(`/api/trading/accounts/${encodeURIComponent(account)}/summary`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(() => { if (!controller.signal.aborted) setError('The rules for this account are unavailable right now.'); });
    return () => controller.abort();
  }, [account, revision]);
  const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const metadata = data?.account.data ?? {};
  const risk = object(metadata.risk_profile);
  const passing = object(metadata.passing_criteria);
  const values: { label: string; value: unknown; money?: boolean }[] = [
    { label: 'Profit target', value: passing.profit_target_dollars, money: true },
    { label: 'Minimum trades', value: passing.minimum_trades ?? passing.min_trades },
    { label: 'Minimum trading days', value: passing.minimum_trading_days ?? passing.min_trading_days },
    { label: 'Maximum loss limit', value: metadata.max_loss_limit ?? risk.max_loss_limit, money: true },
    { label: 'Maximum drawdown', value: metadata.max_drawdown_value ?? risk.max_drawdown_value, money: true },
    { label: 'Daily loss limit', value: metadata.daily_loss_limit ?? risk.daily_loss_limit, money: true },
    { label: 'Maximum contracts', value: risk.max_contracts ?? risk.maximum_contracts },
  ].filter(item => (typeof item.value === 'number' || typeof item.value === 'string') && item.value !== '' && Number.isFinite(Number(item.value)));
  return <ToolFrame title="Account rules" account={account}>
    {error && <ErrorNotice message={error} retry={() => setRevision(value => value + 1)} />}
    {!data && !error && <Loading />}
    {data && <div className={styles.section}><p className={styles.accountName}>{accountLabel(data.account)}</p>
      {values.length ? <><h2>Your account’s limits</h2><dl className={styles.rules}>{values.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.money ? usd(item.value) : String(item.value)}</dd></div>)}</dl><p className={styles.footnote}>These are the rules currently available for this account. Review the full account rules in Tradara.</p></>
        : <><h2>Your account rules are not available here yet</h2><p>Review them in Tradara, or read the Certa account guide.</p></>}
      <div className={styles.actions}><Link className={styles.primary} href={`/account/terminal?account=${encodeURIComponent(account)}`}>Trading platform<Arrow /></Link><Link className={styles.secondary} href="/#account-plan">Account guide</Link></div>
    </div>}
  </ToolFrame>;
}

export function SupportTool({ account, slot }: ToolProps) {
  return <ToolFrame title="Support" account={account} slot={slot}>
    <div className={styles.section}><h2>Talk to the Certa team</h2><p>Include your account name and a short description of what happened.</p>
      <a className={styles.email} href="mailto:support@certafutures.com">support@certafutures.com<Arrow /></a>
      <div className={styles.supportRoutes}><Link href={`/account/terminal${selectionQuery({ account, slot })}`}>Trading access<Arrow /></Link><Link href={`/account/compliance${selectionQuery({ account, slot })}`}>Compliance<Arrow /></Link><Link href="/account/security">Account security<Arrow /></Link></div>
    </div>
  </ToolFrame>;
}
