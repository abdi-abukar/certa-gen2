export type TradingAccount = {
  id: string; vendor_id: string; slot_id?: string | null;
  kind: 'evaluation' | 'funded' | 'practice'; lifecycle: string;
  vendor_updated_at: string | null; predecessor_id?: string | null; successor_id?: string | null;
  name?: string | null; started_at?: string | null;
};
export type Slot = {
  id: string; account_id: string | null; state: string;
  pending_entitlement_id?: string | null; operation_id?: string | null;
  checkout?: { id: string; state: string } | null;
};
export type DashboardSnapshot = {
  accounts: TradingAccount[];
  allocation: { limit: number; occupied: number; available: number; over_capacity: boolean; reconciliation_pending: boolean; compliance: { kyc: boolean; tax: boolean; agreement: boolean }; slots: Slot[] };
  access: { status: string; checked_at: string | null; requires_acceptance: boolean; login_url: string | null };
  checkout: { id: string; state: string; slot_ids: string[] } | null;
  checkoutAvailable: boolean;
  history: { accounts: TradingAccount[]; hasMore: boolean; nextCursor: string | null };
  events: { id: string; account_id: string; type: 'passed' | 'failed' | 'closed'; occurred_at: string }[];
};
export type AccountRecord = { kind: string; data: Record<string, unknown>; vendor_updated_at?: string; version?: number };
export type Summary = { account: TradingAccount & { data?: Record<string, unknown> }; records: AccountRecord[] };
export type GameSnapshot = {
  account: { id: string; kind: string; lifecycle: string; compliance_pending: boolean; as_of: string | null };
  vendor_progress: { step: number; target: string | null; net_pnl: string | null; awaiting_vendor_pass: boolean; as_of?: string | null };
  eligibility: { eligible?: boolean; qualifying_dates?: string[]; maximum_cents?: number; reason?: string; [key: string]: unknown } | null;
  funded_issued: boolean;
};
export type Activity = {
  accountId: string; month: string; selectedDate: string | null;
  days: { date: string; netPnl: string | null; tradesClosed: number | null }[];
  trades: { id: string; symbol: string | null; side: string | null; quantity: string | null; netPnl: string | null; openedAt: string | null; closedAt: string | null; entryPrice: string | null; exitPrice: string | null }[];
  day: { netPnl: string | null; tradesClosed: number | null };
  hasMore: boolean; nextCursor: string | null;
  freshness: { updatedAt: string | null; calendarComplete: boolean; tradesComplete: boolean };
};
export type Journey = { id: string; label: string; slot: Slot | null; account: TradingAccount | null };
export type AccountView = 'payment' | 'preparing' | 'compliance' | 'invitation' | 'setup-issue' | 'reconciling' | 'active' | 'passed' | 'failed' | 'closed' | 'locked';
export const terminal = (state: string) => ['passed', 'upgraded', 'failed', 'breached', 'closed'].includes(state.toLowerCase());
export function accountLabel(account: TradingAccount) {
  if (account.name?.trim()) return account.name.trim();
  const kind = account.kind === 'funded' ? 'Funded' : account.kind === 'practice' ? 'Practice' : 'Evaluation';
  return `${kind} ${account.vendor_id?.slice(-4).toUpperCase() || account.id.slice(0, 4).toUpperCase()}`;
}
/** Elapsed account age, not qualifying trading days. Unknown dates stay unknown. */
export function accountAge(startedAt: string | null | undefined, now = Date.now()) {
  const started = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(started) || started > now) return null;
  const days = Math.floor((now - started) / 86400000);
  return days === 0 ? 'Started today' : days === 1 ? 'Started 1 day ago' : `Started ${days} days ago`;
}
export function journeys(snapshot: DashboardSnapshot): Journey[] {
  const byId = new Map(snapshot.accounts.map(account => [account.id, account]));
  const slots: Journey[] = snapshot.allocation.slots.map((slot, index) => {
    const account = slot.account_id ? byId.get(slot.account_id) ?? null : null;
    const label = account ? accountLabel(account) : `Evaluation ${String(index + 1).padStart(2, '0')}`;
    return { id: slot.id, label, account, slot };
  });
  const represented = new Set(slots.map(journey => journey.account?.id).filter(Boolean));
  for (const account of snapshot.accounts) if (!represented.has(account.id) && !terminal(account.lifecycle)) slots.push({ id: account.id, label: accountLabel(account), account, slot: null });
  if (snapshot.checkout && !snapshot.checkout.slot_ids.length && !slots.some(journey => journey.slot?.checkout?.id === snapshot.checkout?.id)) {
    slots.push({ id: `purchase:${snapshot.checkout.id}`, label: 'New evaluation', account: null, slot: { id: `purchase:${snapshot.checkout.id}`, account_id: null, state: 'checkout_reserved', checkout: snapshot.checkout } });
  }
  return slots;
}

/** Present the allocation already confirmed by the server; placeholders never reserve a slot. */
export function accountSlotLayout(snapshot: DashboardSnapshot) {
  const current = journeys(snapshot).filter(journey => !journey.account || !terminal(journey.account.lifecycle) || journey.slot?.pending_entitlement_id);
  const represented = new Set(current.map(journey => journey.account?.id));
  const previous: Journey[] = snapshot.accounts.filter(account => terminal(account.lifecycle) && !represented.has(account.id))
    .map(account => ({ id: account.id, label: accountLabel(account), account, slot: null }));
  previous.sort((a, b) => (b.account?.started_at ?? '').localeCompare(a.account?.started_at ?? '') || a.id.localeCompare(b.id));
  const allocation = snapshot.allocation;
  const known = [allocation.limit, allocation.occupied, allocation.available].every(value => Number.isSafeInteger(value) && value >= 0);
  // Three neutral placeholders are the display fallback, never evidence of available capacity.
  const limit = known ? Math.min(allocation.limit, 100) : 3;
  const remaining = Math.max(0, limit - current.length);
  const available = known && !allocation.over_capacity && !allocation.reconciliation_pending
    ? Math.max(0, Math.min(remaining, allocation.available, limit - Math.max(allocation.occupied, current.length))) : 0;
  return { current, previous, available, checking: remaining - available };
}
/** The selected slot, never a different account's pending state, drives the view. */
export function accountView(journey: Journey, snapshot: DashboardSnapshot): AccountView {
  const state = journey.slot?.state ?? '';
  const lifecycle = journey.account?.lifecycle.toLowerCase();
  if (journey.slot?.pending_entitlement_id) {
    if (state === 'compliance_pending') return 'compliance';
    if (['unknown', 'running'].includes(state)) return 'reconciling';
    if (['failed', 'plan_mapping_required'].includes(state)) return 'setup-issue';
    if (snapshot.access.requires_acceptance) return 'invitation';
    return 'preparing';
  }
  if (!journey.account) {
    if (state === 'checkout_reserved') return 'payment';
    if (state === 'compliance_pending') return 'compliance';
    if (state === 'failed' || state === 'plan_mapping_required') return 'setup-issue';
    if (state === 'unknown') return 'reconciling';
    if (snapshot.access.requires_acceptance) return 'invitation';
    return 'preparing';
  }
  if (lifecycle === 'passed' || lifecycle === 'upgraded') return 'passed';
  if (lifecycle === 'failed' || lifecycle === 'breached') return 'failed';
  if (lifecycle === 'closed') return 'closed';
  if (lifecycle === 'locked' || ['SUSPENDED', 'REVOKED'].includes(snapshot.access.status)) return 'locked';
  if (snapshot.access.requires_acceptance) return 'invitation';
  if (lifecycle === 'active') return 'active';
  if (['created', 'pending', 'provisioning'].includes(lifecycle ?? '')) return 'preparing';
  return 'reconciling';
}
export function number(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function usd(value: unknown, signed = false) {
  const amount = number(value);
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number.isInteger(amount) ? 0 : 2, signDisplay: signed ? 'exceptZero' : 'auto' }).format(amount);
}
export function latestRecord(summary: Summary | null, kind: string) {
  return summary?.records.filter(record => record.kind === kind).sort((a, b) => (b.vendor_updated_at ?? '').localeCompare(a.vendor_updated_at ?? ''))[0] ?? null;
}
export function accountFacts(summary: Summary | null, game: GameSnapshot | null) {
  const balanceRecord = latestRecord(summary, 'balances');
  const statsRecord = latestRecord(summary, 'stats');
  const balanceData = balanceRecord?.data ?? {};
  const stats = statsRecord?.data ?? {};
  const metadata = summary?.account.data ?? {};
  const risk = typeof metadata.risk_profile === 'object' && metadata.risk_profile ? metadata.risk_profile as Record<string, unknown> : {};
  const criteria = typeof metadata.passing_criteria === 'object' && metadata.passing_criteria ? metadata.passing_criteria as Record<string, unknown> : {};
  const balance = number(balanceData.balance ?? balanceData.cash);
  const pnl = number(stats.total_net_pnl ?? stats.net_pnl ?? game?.vendor_progress.net_pnl);
  const target = number(game?.vendor_progress.target ?? criteria.profit_target_dollars);
  const progress = target && pnl !== null ? Math.max(0, Math.min(.96, pnl / target)) : 0;
  return { balance, pnl, target, progress, remaining: target !== null && pnl !== null ? Math.max(0, target - pnl) : null,
    equity: number(balanceData.equity), unrealized: number(balanceData.unrealized_pnl),
    lossLimit: number(balanceData.max_loss_limit ?? metadata.max_loss_limit ?? risk.max_loss_limit),
    trades: number(stats.total_trades), minimumTrades: number(criteria.minimum_trades ?? criteria.min_trades),
    asOf: balanceRecord?.vendor_updated_at ?? statsRecord?.vendor_updated_at ?? null };
}
export function todaySession() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function monthShift(month: string, amount: number) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + amount, 1)).toISOString().slice(0, 7);
}
export function calendarDates(month: string): string[] {
  const [year, value] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, value - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, index) => new Date(Date.UTC(year, value - 1, index - offset + 1)).toISOString().slice(0, 10));
}
export function safeExternal(value: string | null | undefined) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
