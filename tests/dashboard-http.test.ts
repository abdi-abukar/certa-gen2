import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tradingResponse } from '../packages/server/src/tradara/http';
import { calendarDays } from '../packages/server/src/tradara/dashboard';
import { awardsResponse } from '../packages/server/src/awards/http';

const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const account = '20000000-0000-4000-8000-000000000001';
const otherAccount = '20000000-0000-4000-8000-000000000002';
const slot = '30000000-0000-4000-8000-000000000001';
const order = '40000000-0000-4000-8000-000000000001';
const checkout = '50000000-0000-4000-8000-000000000001';
const event = '60000000-0000-4000-8000-000000000001';
const updated = '2026-09-16T20:00:00Z';
type FixtureRow = Record<string, any>;
function token(exp = 4102444800) {
  return [{ alg: 'HS256', typ: 'JWT' }, { sub: user, session_id: user, aal: 'aal1', exp }, 'synthetic']
    .map((part, index) => Buffer.from(index < 2 ? JSON.stringify(part) : String(part)).toString('base64url')).join('.');
}
async function fixture(run: (context: {
  tables: Record<string, FixtureRow[]>; allocation: FixtureRow; calls: URL[];
  get: (path: string, authorization?: string) => Promise<Response>;
  setVerified: (value: boolean) => void; setCommerceFailure: () => void;
}) => Promise<void>) {
  const savedEnv = { ...process.env }, savedFetch = globalThis.fetch;
  Object.assign(process.env, { CERTA_APP: 'web', CERTA_APP_ORIGIN: 'https://web.example.test', CERTA_ALLOWED_ORIGINS: 'https://web.example.test', CERTA_SUPABASE_URL: 'https://supabase.example.test', CERTA_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', SUPABASE_SECRET_KEY: 'sb_secret_synthetic', TRADARA_LOGIN_URL: 'https://trade.example.test' });
  let verified = true, commerceFailure = false;
  const calls: URL[] = [];
  const tables: Record<string, FixtureRow[]> = {
    ct_accounts: [
      { id: account, user_id: user, vendor_id: 'eval-one', slot_id: slot, kind: 'evaluation', lifecycle: 'passed', vendor_updated_at: updated, data: { account_name: 'My first evaluation', created_at: '2026-09-01T10:00:00Z', staff_note: 'PRIVATE_CANARY' } },
      { id: otherAccount, user_id: other, vendor_id: 'OTHER_CANARY', kind: 'evaluation', lifecycle: 'active' },
    ],
    ct_memberships: [{ user_id: user, status: 'ACTIVE', checked_at: updated, data: { secret: 'PRIVATE_CANARY' } }],
    ct_slots: [{ id: slot, user_id: user, current_account_id: account, released_at: null, order_id: order }],
    cm_checkouts: [{ id: checkout, user_id: user, state: 'paid', slot_order: order, private: 'PRIVATE_CANARY' }],
    ct_transitions: [{ id: event, account_id: account, transition: 'passed', created_at: updated, ct_accounts: { user_id: user } }],
    ca_issues: [], ca_looks: [],
    ct_records: [
      { id: '70000000-0000-4000-8000-000000000001', user_id: user, account_id: account, kind: 'daily-stats', vendor_updated_at: updated, data: { items: [{ session_date: '2026-09-16', net_pnl: '250.75', trades_closed: 1 }] } },
      { id: '80000000-0000-4000-8000-000000000001', user_id: user, account_id: account, kind: 'trades', vendor_updated_at: updated, data: { session_date: '2026-09-16', instrument_id: 'MES', side: 'buy', quantity: '2', net_pnl: '250.75', opened_at: '2026-09-15T23:00:00Z', closed_at: '2026-09-16T00:30:00Z', entry_price: '5100.25', exit_price: '5125.325', private: 'PRIVATE_CANARY' } },
      { id: '80000000-0000-4000-8000-000000000002', user_id: user, account_id: account, kind: 'trades', vendor_updated_at: updated, data: { session_date: '2026-09-17', closed_at: '2026-09-16T23:30:00Z', net_pnl: '999.99' } },
      { id: '80000000-0000-4000-8000-000000000003', user_id: other, account_id: otherAccount, kind: 'trades', data: { session_date: '2026-09-16', closed_at: updated, net_pnl: '123456.00' } },
    ],
  };
  const allocation = { limit: 3, occupied: 1, available: 2, over_capacity: false, reconciliation_pending: false, compliance: { kyc: false, tax: false, agreement: false }, slots: [{ id: slot, account_id: account, state: 'compliance_pending', pending_entitlement_id: other, operation_id: null, blocked_reason: 'PRIVATE_CANARY' }] };
  const field = (record: FixtureRow, key: string) => key.startsWith('data->>') ? record.data?.[key.slice(7)] : key === 'ct_accounts.user_id' ? record.ct_accounts?.user_id : record[key];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    assert.equal(url.origin, 'https://supabase.example.test', 'dashboard never calls Tradara or other providers');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: user, email: 'trader@example.test', app_metadata: {}, factors: [] });
    if (url.pathname === '/rest/v1/rpc/cf_verified') return Response.json(verified);
    if (url.pathname === '/rest/v1/rpc/ct_compliance') return Response.json({ kyc: false, tax: false, agreement: false });
    if (url.pathname === '/rest/v1/rpc/ct_allocation_snapshot') {
      assert.deepEqual(JSON.parse(String(init?.body)), { p_user: user }); return Response.json(allocation);
    }
    const table = url.pathname.split('/').at(-1)!;
    assert.ok(table in tables, `Unexpected table ${table}`);
    assert.equal(url.searchParams.get('select')?.includes('compliance_hold'), false, 'canonical account schema no longer has compliance_hold');
    if (table === 'cm_checkouts' && commerceFailure) return Response.json({ message: 'PRIVATE_CANARY' }, { status: 503 });
    let rows = [...tables[table]];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith('eq.')) rows = rows.filter(record => String(field(record, key)) === value.slice(3));
      if (value.startsWith('gt.')) rows = rows.filter(record => String(field(record, key)) > value.slice(3));
      if (value === 'is.null') rows = rows.filter(record => field(record, key) == null);
      if (value === 'not.is.null') rows = rows.filter(record => field(record, key) != null);
      if (value.startsWith('in.(')) rows = rows.filter(record => value.slice(4, -1).split(',').includes(String(field(record, key))));
    }
    const ordering = url.searchParams.get('order')?.split(',') ?? [];
    rows.sort((a, b) => {
      for (const order of ordering) {
        const [key, direction] = order.split('.');
        const result = String(field(a, key)).localeCompare(String(field(b, key)));
        if (result) return direction === 'desc' ? -result : result;
      }
      return 0;
    });
    const after = url.searchParams.get('or');
    if (after) {
      const match = after.match(/^\(data->>closed_at\.lt\.(.+),and\(data->>closed_at\.eq\.(.+),id\.gt\.([a-f\d-]+)\)\)$/)!;
      assert.ok(match, 'safe deterministic cursor predicate');
      rows = rows.filter(record => record.data.closed_at < match[1] || record.data.closed_at === match[2] && record.id > match[3]);
    }
    rows = rows.slice(0, Number(url.searchParams.get('limit') ?? rows.length));
    if (table === 'ct_accounts' && url.searchParams.get('select')?.includes('account_name:data->>account_name')) {
      rows = rows.map(row => ({ ...row, account_name: row.data?.account_name, display_name: row.data?.name, started_at: row.data?.created_at }));
    }
    return Response.json(new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
  };
  const get = (path: string, authorization = `Bearer ${token()}`) => {
    const url = new URL(`https://web.example.test/api/trading/${path}`);
    return tradingResponse(new Request(url, { headers: { Authorization: authorization } }), url.pathname.slice('/api/trading/'.length).split('/'));
  };
  try { await run({ tables, allocation, calls, get, setVerified: value => { verified = value; }, setCommerceFailure: () => { commerceFailure = true; } }); }
  finally { globalThis.fetch = savedFetch; process.env = savedEnv; }
}

test('trading launch checks only the verified owner’s active accounts with one bounded local query', async () => fixture(async ({ get, calls, setVerified, tables }) => {
  assert.equal((await get('launch', 'Basic invalid')).status, 401);
  setVerified(false); assert.equal((await get('launch')).status, 403); setVerified(true);
  const empty = await get(`launch?user_id=${other}`);
  assert.equal(empty.status, 200);
  assert.match(empty.headers.get('cache-control')!, /private, no-store/);
  assert.deepEqual(await empty.json(), { hasLiveAccount: false }, 'another trader’s active account cannot enable this CTA');
  for (const lifecycle of ['pending', 'locked', 'passed', 'failed', 'closed']) {
    tables.ct_accounts[0].lifecycle = lifecycle;
    assert.deepEqual(await (await get('launch')).json(), { hasLiveAccount: false });
  }
  tables.ct_accounts[0].lifecycle = 'active';
  assert.deepEqual(await (await get('launch')).json(), { hasLiveAccount: true });
  const queries = calls.filter(url => url.pathname.endsWith('/ct_accounts'));
  assert.equal(queries.length, 7);
  for (const query of queries) {
    assert.equal(query.searchParams.get('user_id'), `eq.${user}`);
    assert.equal(query.searchParams.get('lifecycle'), 'eq.active');
    assert.equal(query.searchParams.get('select'), 'id');
    assert.equal(query.searchParams.get('limit'), '1');
  }
}));

test('dashboard HTTP binds identity, requires second factor, redacts internal data, and keeps stable event IDs', async () => fixture(async ({ get, calls, setVerified, tables }) => {
  assert.equal((await get('dashboard', 'Basic invalid')).status, 401);
  assert.equal((await get('dashboard', `Bearer ${token(1)}`)).status, 401);
  setVerified(false); assert.equal((await get('dashboard')).status, 403); setVerified(true);
  const response = await get(`dashboard?user_id=${other}`);
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control')!, /private, no-store/);
  const data = await response.json();
  assert.equal(data.accounts.length, 1); assert.equal(data.accounts[0].id, account);
  assert.equal(data.accounts[0].name, 'My first evaluation');
  assert.equal(data.accounts[0].started_at, '2026-09-01T10:00:00Z');
  assert.deepEqual(data.events, [{ id: event, account_id: account, type: 'passed', occurred_at: updated }]);
  assert.deepEqual(data.allocation.slots[0].checkout, { id: checkout, state: 'paid' });
  assert.equal(JSON.stringify(data).includes('CANARY'), false);
  assert.ok(calls.filter(url => url.pathname.endsWith('ct_accounts')).every(url => url.searchParams.get('user_id') === `eq.${user}`));
  tables.ct_accounts[0].vendor_updated_at = '2026-09-17T00:00:00Z';
  tables.ct_accounts[0].data.created_at = 'not-a-date';
  assert.equal((await (await get('dashboard')).json()).accounts[0].started_at, null, 'never treat last refresh as account start');
  assert.equal((await (await get('dashboard')).json()).events[0].id, event, 'unrelated account refresh cannot replay a result');
  tables.ct_accounts[0].lifecycle = 'upgraded';
  tables.ct_transitions.push({ id: other, account_id: account, transition: 'upgraded', created_at: '2026-09-17T00:00:00Z', ct_accounts: { user_id: user } });
  assert.equal((await (await get('dashboard')).json()).events[0].id, event, 'funded phase advancement cannot replay the same pass');
}));

test('commerce outage does not hide account dashboard and unissued slots have no invented account', async () => fixture(async ({ get, allocation, tables, setCommerceFailure }) => {
  allocation.slots[0].account_id = null; allocation.slots[0].state = 'checkout_reserved'; tables.ct_accounts = [];
  tables.cm_checkouts[0].state = 'pending';
  let data = await (await get('dashboard')).json();
  assert.deepEqual(data.accounts, []); assert.deepEqual(data.checkout, { id: checkout, state: 'pending', slot_ids: [slot] });
  assert.equal(data.allocation.slots[0].account_id, null);
  setCommerceFailure();
  const response = await get('dashboard'); assert.equal(response.status, 200); data = await response.json();
  assert.equal(data.checkoutAvailable, false); assert.equal(data.allocation.slots.length, 1); assert.equal(data.checkout, null);
  assert.equal(JSON.stringify(data).includes('PRIVATE_CANARY'), false);
}));

test('inventory pages retain the selected current account and expose a bounded archive continuation', async () => fixture(async ({ get, allocation, tables }) => {
  const currentId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  allocation.slots[0].account_id = currentId;
  tables.ct_accounts = [
    ...Array.from({ length: 105 }, (_, index) => ({ id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, user_id: user, kind: 'evaluation', lifecycle: 'failed' })),
    { id: currentId, user_id: user, slot_id: slot, vendor_id: 'current', kind: 'evaluation', lifecycle: 'active' },
  ];
  const first = await (await get('dashboard')).json();
  assert.equal(first.accounts.length, 101); assert.ok(first.accounts.some((row: FixtureRow) => row.id === currentId));
  assert.equal(first.history.accounts.length, 100); assert.equal(first.history.hasMore, true);
  const second = await (await get(`dashboard?cursor=${first.history.nextCursor}`)).json();
  assert.equal(second.history.hasMore, false); assert.equal(second.history.accounts.length, 5);
  assert.ok(second.accounts.some((row: FixtureRow) => row.id === currentId));
  const archivedId = '20000000-0000-4000-8000-000000000105';
  assert.equal(first.accounts.some((row: FixtureRow) => row.id === archivedId), false);
  const direct = await get(`accounts/${archivedId}`);
  assert.equal(direct.status, 200); assert.equal((await direct.json()).id, archivedId, 'deep-linked history can use the owned detail endpoint without scanning pages');
  tables.ct_accounts.push({ id: 'ffffffff-ffff-4fff-8fff-fffffffffff0', user_id: other, kind: 'evaluation', lifecycle: 'failed' });
  assert.equal((await get('accounts/ffffffff-ffff-4fff-8fff-fffffffffff0')).status, 404);
}));

test('game account reads use current compliance coordinator instead of the removed account flag', async () => fixture(async () => {
  const request = new Request(`https://web.example.test/api/awards/accounts/${account}/game`, { headers: { Authorization: `Bearer ${token()}` } });
  const response = await awardsResponse(request, ['accounts', account, 'game']);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.account.id, account); assert.equal(data.account.compliance_pending, true);
  assert.equal(data.vendor_progress.step, 5); assert.equal(data.funded_issued, false);
  assert.equal(JSON.stringify(data).includes('PRIVATE_CANARY'), false);
}));

test('activity denies cross-user accounts and validates real dates and month boundaries', async () => fixture(async ({ get, calls }) => {
  assert.equal((await get(`accounts/${otherAccount}/activity?month=2026-09`)).status, 404);
  for (const query of ['month=2026-13', 'month=2026-09&date=2026-09-31', 'month=2026-09&date=2026-08-31', 'month=2026-02&date=2026-02-29', 'month=2026-09&date=bad']) {
    assert.equal((await get(`accounts/${account}/activity?${query}`)).status, 400);
  }
  assert.equal(calls.filter(url => url.pathname.endsWith('ct_records')).length, 0, 'invalid inputs and another owner cannot read records');
}));

test('activity selects canonical overnight session, returns decimal strings, and distinguishes absent data from zero', async () => fixture(async ({ get, tables }) => {
  const response = await get(`accounts/${account}/activity?month=2026-09&date=2026-09-16`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.day, { netPnl: '250.75', tradesClosed: 1 });
  assert.equal(data.selectedDate, '2026-09-16'); assert.equal(data.trades.length, 1);
  assert.equal(data.trades[0].openedAt, '2026-09-15T23:00:00Z'); assert.equal(data.trades[0].quantity, '2');
  assert.equal(data.trades[0].entryPrice, '5100.25'); assert.equal(data.freshness.tradesComplete, true);
  assert.equal(data.freshness.calendarComplete, false); assert.equal(JSON.stringify(data).includes('CANARY'), false);
  const missing = await (await get(`accounts/${account}/activity?month=2026-09&date=2026-09-14`)).json();
  assert.deepEqual(missing.day, { netPnl: null, tradesClosed: null }); assert.equal(missing.freshness.tradesComplete, false);
  tables.ct_records = [];
  const unavailable = await (await get(`accounts/${account}/activity?month=2026-09`)).json();
  assert.equal(unavailable.freshness.updatedAt, null); assert.deepEqual(unavailable.days, []);
}));

test('trade pages use selected-session cursor with chronological ordering and reject reuse on other dates', async () => fixture(async ({ get, tables }) => {
  tables.ct_records[0].data.items[0].trades_closed = 52;
  tables.ct_records = [tables.ct_records[0], ...Array.from({ length: 52 }, (_, index) => ({
    id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, user_id: user, account_id: account, kind: 'trades', vendor_updated_at: updated,
    data: { session_date: '2026-09-16', closed_at: '2026-09-16T19:00:00Z', net_pnl: '1.00' },
  }))];
  const base = `accounts/${account}/activity?month=2026-09&date=2026-09-16`;
  const first = await (await get(base)).json(); assert.equal(first.trades.length, 50); assert.equal(first.hasMore, true); assert.equal(first.freshness.tradesComplete, false);
  const second = await (await get(`${base}&cursor=${first.nextCursor}`)).json();
  assert.equal(second.trades.length, 2); assert.equal(second.hasMore, false); assert.equal(second.freshness.tradesComplete, true);
  assert.equal(new Set([...first.trades, ...second.trades].map(trade => trade.id)).size, 52);
  assert.equal((await get(`accounts/${account}/activity?month=2026-09&date=2026-09-15&cursor=${first.nextCursor}`)).status, 400);
  tables.ct_records[0].vendor_updated_at = '2026-09-17T00:00:00Z';
  assert.equal((await get(`${base}&cursor=${first.nextCursor}`)).status, 409, 'changed daily evidence requires refreshing pages');
}));

test('default activity month and highlighted day follow Toronto after UTC midnight', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-01T01:00:00Z') });
  await fixture(async ({ get, tables }) => {
    tables.ct_records[0].data.items = [
      { session_date: '2026-09-30', net_pnl: '10.00', trades_closed: 1 },
      { session_date: '2026-10-01', net_pnl: '20.00', trades_closed: 1 },
    ];
    let data = await (await get(`accounts/${account}/activity`)).json();
    assert.equal(data.month, '2026-09'); assert.equal(data.selectedDate, '2026-09-30');
    assert.deepEqual(data.day, { netPnl: '10.00', tradesClosed: 1 });
    context.mock.timers.setTime(new Date('2026-09-17T01:00:00Z').getTime());
    tables.ct_records[0].data.items = [
      { session_date: '2026-09-16', net_pnl: '10.00', trades_closed: 1 },
      { session_date: '2026-09-17', net_pnl: '20.00', trades_closed: 1 },
    ];
    data = await (await get(`accounts/${account}/activity?month=2026-09`)).json();
    assert.equal(data.selectedDate, '2026-09-16', 'today is Toronto today, even if a later overnight session has reports');
    assert.equal(data.days[1].date, '2026-09-17', 'stored vendor session dates remain unchanged');
  });
});

test('conflicting daily reports and numeric money never become invented financial totals', () => {
  assert.deepEqual(calendarDays({ items: [
    { session_date: '2026-09-01', net_pnl: '10.00', trades_closed: 1 },
    { session_date: '2026-09-01', net_pnl: '20.00', trades_closed: 1 },
    { session_date: '2026-09-02', net_pnl: 10.99, trades_closed: 1 },
    { session_date: '2026-09-31', net_pnl: '99.00', trades_closed: 1 },
  ] }, '2026-09'), [
    { date: '2026-09-01', netPnl: null, tradesClosed: null },
    { date: '2026-09-02', netPnl: null, tradesClosed: 1 },
  ]);
});
