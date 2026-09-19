import 'server-only';
import { TradingError, uuid, type Row } from './contracts';
import type { TradingStore } from './store';

const accountColumns = 'id,user_id,vendor_id,slot_id,kind,lifecycle,vendor_updated_at,predecessor_id,successor_id,account_name:data->>account_name,display_name:data->>name,started_at:data->>created_at';
const terminalStates = ['passed', 'upgraded', 'failed', 'breached', 'closed'];
const accountPageSize = 100;
const tradePageSize = 50;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown): string | null => typeof value === 'string' && value.length <= 200 ? value : null;
const money = (value: unknown): string | null => typeof value === 'string' && /^-?\d{1,15}(\.\d{1,8})?$/.test(value) ? value : null;
const count = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
const timestamp = (value: unknown): string | null => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw new TradingError('trading_store_unavailable', 503);
  return data;
}
function publicAccount(account: Row) {
  return {
    id: String(account.id), vendor_id: text(account.vendor_id), slot_id: text(account.slot_id),
    kind: text(account.kind), lifecycle: text(account.lifecycle), vendor_updated_at: timestamp(account.vendor_updated_at),
    predecessor_id: text(account.predecessor_id), successor_id: text(account.successor_id),
    name: text(account.account_name) || text(account.display_name), started_at: timestamp(account.started_at),
  };
}
function loginUrl() {
  try { const url = new URL(process.env.TRADARA_LOGIN_URL ?? ''); return url.protocol === 'https:' ? url.toString() : null; }
  catch { return null; }
}

/** Read-only local projection. No provider reads, allocation mutations, or provisioning. */
export async function dashboardSnapshot(store: TradingStore, user: string, cursor?: string) {
  if (cursor) uuid(cursor);
  let inventory = store.db.from('ct_accounts').select(accountColumns).eq('user_id', user).order('id').limit(accountPageSize + 1);
  if (cursor) inventory = inventory.gt('id', cursor);
  const [allocationValue, accountResult, memberResult, slotResult, checkoutResult] = await Promise.all([
    store.rpc('allocation_snapshot', { p_user: user }),
    inventory,
    store.db.from('ct_memberships').select('status,checked_at').eq('user_id', user).maybeSingle(),
    store.db.from('ct_slots').select('id,order_id').eq('user_id', user).is('released_at', null).order('id').limit(100),
    // Commerce is optional for already issued accounts; failure cannot hide trading data.
    store.db.from('cm_checkouts').select('id,state,slot_order').eq('user_id', user).in('state', ['open', 'pending']).limit(1),
  ]);
  const rawAllocation = row(allocationValue);
  const inventoryRows = checked(accountResult) ?? [];
  const page = inventoryRows.slice(0, accountPageSize);
  const rawSlots = Array.isArray(rawAllocation.slots) ? rawAllocation.slots.map(row) : [];
  const slotOrders = checked(slotResult) ?? [];
  const member = checked(memberResult);
  const currentIds = rawSlots.map(slot => text(slot.account_id)).filter((id): id is string => !!id);
  const missingIds = currentIds.filter(id => !page.some(account => account.id === id)).slice(0, 100);
  const extraAccounts = missingIds.length ? checked(await store.db.from('ct_accounts').select(accountColumns).eq('user_id', user).in('id', missingIds).limit(100)) ?? [] : [];
  const accounts = [...page, ...extraAccounts].map(publicAccount);
  const pendingOrders = slotOrders.map(slot => text(slot.order_id)).filter((id): id is string => !!id);
  const associatedResult = pendingOrders.length ? await store.db.from('cm_checkouts').select('id,state,slot_order').eq('user_id', user).in('slot_order', pendingOrders).limit(100) : { data: [], error: null };
  const associated = associatedResult.error ? [] : associatedResult.data ?? [];
  const activeCheckout = checkoutResult.error ? null : checkoutResult.data?.[0] ?? null;
  const checkout = activeCheckout ? {
    id: activeCheckout.id, state: activeCheckout.state,
    slot_ids: slotOrders.filter(slot => slot.order_id === activeCheckout.slot_order).map(slot => slot.id),
  } : null;
  const slots = rawSlots.map(slot => {
    const order = slotOrders.find(candidate => candidate.id === slot.id);
    const purchase = associated.find(candidate => candidate.slot_order === order?.order_id);
    return {
      id: text(slot.id), account_id: text(slot.account_id), state: text(slot.state),
      pending_entitlement_id: text(slot.pending_entitlement_id), operation_id: text(slot.operation_id),
      checkout: purchase ? { id: purchase.id, state: purchase.state } : null,
    };
  });
  const finished = accounts.filter(account => terminalStates.includes(account.lifecycle ?? ''));
  const transitions = finished.length ? checked(await store.db.from('ct_transitions')
    .select('id,account_id,transition,created_at,ct_accounts!inner(user_id)')
    .eq('ct_accounts.user_id', user).in('account_id', finished.map(account => account.id))
    .in('transition', terminalStates).order('created_at', { ascending: false }).limit(100)) ?? [] : [];
  const events = finished.flatMap(account => {
    // A vendor phase advance continues the same earned pass; it must not replay
    // an already acknowledged evaluation result under a new transition ID.
    const transition = account.lifecycle === 'upgraded'
      ? transitions.find(candidate => candidate.account_id === account.id && candidate.transition === 'passed') ?? transitions.find(candidate => candidate.account_id === account.id && candidate.transition === 'upgraded')
      : transitions.find(candidate => candidate.account_id === account.id && candidate.transition === account.lifecycle);
    if (!transition) return [];
    return [{ id: String(transition.id), account_id: account.id, type: transition.transition === 'upgraded' ? 'passed' : transition.transition === 'breached' ? 'failed' : String(transition.transition), occurred_at: timestamp(transition.created_at) }];
  });
  const compliance = row(rawAllocation.compliance);
  const status = text(member?.status) ?? 'UNLINKED';
  return {
    accounts,
    allocation: {
      limit: count(rawAllocation.limit), occupied: count(rawAllocation.occupied), available: count(rawAllocation.available),
      over_capacity: rawAllocation.over_capacity === true, reconciliation_pending: rawAllocation.reconciliation_pending === true,
      compliance: { kyc: compliance.kyc === true, tax: compliance.tax === true, agreement: compliance.agreement === true }, slots,
    },
    access: { status, checked_at: timestamp(member?.checked_at), requires_acceptance: ['INVITED', 'PENDING_ACCEPTANCE'].includes(status), login_url: loginUrl() },
    checkout, checkoutAvailable: !checkoutResult.error && !associatedResult.error,
    history: { accounts: page.map(publicAccount).filter(account => terminalStates.includes(account.lifecycle ?? '')), hasMore: inventoryRows.length > accountPageSize, nextCursor: inventoryRows.length > accountPageSize ? String(page.at(-1)!.id) : null },
    events,
  };
}

function sessionDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
type Day = { date: string; netPnl: string | null; tradesClosed: number | null };
/** Duplicate conflicting sessions are unavailable, never silently summed or overwritten. */
export function calendarDays(data: unknown, month: string): Day[] {
  const items = row(data).items;
  if (!Array.isArray(items)) return [];
  const dates = new Map<string, Day>();
  for (const value of items.slice(0, 366)) {
    const item = row(value), date = sessionDate(item.session_date);
    if (!date?.startsWith(`${month}-`)) continue;
    const next = { date, netPnl: money(item.net_pnl), tradesClosed: count(item.trades_closed) };
    const previous = dates.get(date);
    dates.set(date, previous && (previous.netPnl !== next.netPnl || previous.tradesClosed !== next.tradesClosed) ? { date, netPnl: null, tradesClosed: null } : next);
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}
type ActivityCursor = { account: string; date: string; closed: string; id: string; seen: number; snapshot: string | null };
function readCursor(raw: string | null, account: string, date: string): ActivityCursor | null {
  if (!raw) return null;
  try {
    if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString()) as ActivityCursor;
    if (value.account !== account || value.date !== date || !timestamp(value.closed) || !Number.isSafeInteger(value.seen) || value.seen < 0 || value.seen > 1000000 || value.snapshot !== null && !timestamp(value.snapshot)) throw new Error();
    uuid(value.id); return value;
  } catch { throw new TradingError('invalid_cursor'); }
}

export async function accountActivity(store: TradingStore, user: string, accountId: string, url: URL) {
  uuid(accountId);
  // Match the customer calendar's local date, without reinterpreting the
  // authoritative session_date attached to each report or trade.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const month = url.searchParams.get('month') ?? today.slice(0, 7);
  const requestedDate = url.searchParams.get('date');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new TradingError('invalid_month');
  if (requestedDate !== null && (!sessionDate(requestedDate) || !requestedDate.startsWith(`${month}-`))) throw new TradingError('invalid_date');
  // Explicit owner predicate even though the caller already verified the session.
  const account = checked(await store.db.from('ct_accounts').select('id').eq('id', accountId).eq('user_id', user).maybeSingle());
  if (!account) throw new TradingError('not_found', 404);
  const snapshots = checked(await store.db.from('ct_records').select('data,vendor_updated_at').eq('user_id', user).eq('account_id', accountId).eq('kind', 'daily-stats').order('vendor_updated_at', { ascending: false }).limit(1)) ?? [];
  const snapshot = snapshots[0];
  const days = calendarDays(snapshot?.data, month);
  const selectedDate = requestedDate ?? (days.find(day => day.date === today && (day.tradesClosed ?? 0) > 0)?.date ?? days.filter(day => (day.tradesClosed ?? 0) > 0).at(-1)?.date ?? (today.startsWith(month) ? today : `${month}-01`));
  const cursor = readCursor(url.searchParams.get('cursor'), accountId, selectedDate);
  const updatedAt = timestamp(snapshot?.vendor_updated_at);
  if (cursor && cursor.snapshot !== updatedAt) throw new TradingError('activity_changed', 409);
  let query = store.db.from('ct_records').select('id,data,vendor_updated_at')
    .eq('user_id', user).eq('account_id', accountId).eq('kind', 'trades')
    .eq('data->>session_date', selectedDate).not('data->>closed_at', 'is', null)
    .order('data->>closed_at', { ascending: false }).order('id').limit(tradePageSize + 1);
  if (cursor) query = query.or(`data->>closed_at.lt.${cursor.closed},and(data->>closed_at.eq.${cursor.closed},id.gt.${cursor.id})`);
  const stored = checked(await query) ?? [];
  const page = stored.slice(0, tradePageSize);
  const trades = page.flatMap(record => {
    const data = row(record.data), closedAt = timestamp(data.closed_at);
    if (!closedAt || sessionDate(data.session_date) !== selectedDate) return [];
    return [{ id: String(record.id), symbol: text(data.symbol) ?? text(data.instrument_id), side: text(data.side), quantity: money(data.quantity), netPnl: money(data.net_pnl), openedAt: timestamp(data.opened_at), closedAt, entryPrice: money(data.entry_price), exitPrice: money(data.exit_price) }];
  });
  const hasMore = stored.length > tradePageSize;
  const last = page.at(-1);
  const lastClosed = timestamp(row(last?.data).closed_at);
  const seen = (cursor?.seen ?? 0) + trades.length;
  const nextCursor = hasMore && lastClosed ? Buffer.from(JSON.stringify({ account: accountId, date: selectedDate, closed: lastClosed, id: last!.id, seen, snapshot: updatedAt } satisfies ActivityCursor)).toString('base64url') : null;
  const selected = days.find(day => day.date === selectedDate);
  const monthDays = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return {
    accountId, month, selectedDate, days, trades,
    day: { netPnl: selected?.netPnl ?? null, tradesClosed: selected?.tradesClosed ?? null },
    hasMore, nextCursor,
    freshness: {
      updatedAt,
      // An absent trading session is not evidence of zero trades or full coverage.
      calendarComplete: days.length === monthDays && days.every(day => day.netPnl !== null && day.tradesClosed !== null),
      tradesComplete: !hasMore && trades.length === page.length && selected?.tradesClosed !== null && selected?.tradesClosed === seen,
    },
  };
}
