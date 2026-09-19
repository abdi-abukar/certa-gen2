import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountAge, accountLabel, accountFacts, accountSlotLayout, accountView, journeys, number, type DashboardSnapshot, type GameSnapshot, type Summary, type TradingAccount } from '../apps/web/app/account/dashboard-model';
import { accountApi, AccountApiError } from '../apps/web/app/account/dashboard-api';

const evaluation: TradingAccount = { id: '20000000-0000-4000-8000-000000000001', vendor_id: 'vendor-eval-1', kind: 'evaluation', lifecycle: 'active', vendor_updated_at: '2026-09-17T12:00:00Z' };
test('account saves use vendor names and actual elapsed start age, never last refresh', () => {
  const now = Date.parse('2026-09-19T12:00:00Z');
  assert.equal(accountAge('2026-09-19T10:00:00Z', now), 'Started today');
  assert.equal(accountAge('2026-09-18T12:00:00Z', now), 'Started 1 day ago');
  assert.equal(accountAge('2026-09-16T12:00:00Z', now), 'Started 3 days ago');
  for (const value of [undefined, null, 'invalid', '2026-09-20T12:00:00Z']) assert.equal(accountAge(value, now), null);
  assert.equal(accountLabel({ ...evaluation, name: ' My evaluation ' }), 'My evaluation');
  assert.equal(accountLabel({ ...evaluation, name: ' ' }), accountLabel(evaluation));
});
function snapshot(): DashboardSnapshot {
  return {
    accounts: [evaluation],
    allocation: { limit: 3, occupied: 2, available: 1, over_capacity: false, reconciliation_pending: false, compliance: { kyc: false, tax: false, agreement: false }, slots: [
      { id: 'slot-eval', account_id: evaluation.id, state: 'active' },
      { id: 'slot-pending', account_id: null, state: 'compliance_pending', pending_entitlement_id: 'entitlement' },
    ] },
    access: { status: 'ACTIVE', checked_at: null, requires_acceptance: false, login_url: null },
    checkout: null, checkoutAvailable: true, history: { accounts: [], hasMore: false, nextCursor: null }, events: [],
  };
}

test('account slot cards fill only confirmed free capacity and keep pending slots occupied', () => {
  const data = snapshot();
  const layout = accountSlotLayout(data);
  assert.equal(layout.current.length, 2);
  assert.equal(layout.available, 1);
  assert.equal(layout.checking, 0);
  data.accounts = [];
  data.allocation = { ...data.allocation, occupied: 0, available: 3, slots: [] };
  assert.deepEqual(accountSlotLayout(data), { current: [], previous: [], available: 3, checking: 0 });
  data.allocation.occupied = 1; data.allocation.available = 2;
  assert.equal(accountSlotLayout(data).checking, 1, 'missing occupied-slot details cannot become another purchase slot');
  assert.equal(accountSlotLayout(data).available, 2);
});

test('saved checkout occupies one display card and reserved purchases are not hidden', () => {
  const data = snapshot();
  data.allocation.slots[1] = { id: 'slot-pending', account_id: null, state: 'checkout_reserved', checkout: { id: 'cart', state: 'pending' } };
  data.checkout = { id: 'cart', state: 'pending', slot_ids: ['slot-pending'] };
  assert.equal(accountSlotLayout(data).current.length, 2);
  assert.equal(accountSlotLayout(data).available, 1);
  data.accounts = [];
  data.allocation = { ...data.allocation, occupied: 0, available: 3, slots: [] };
  data.checkout.slot_ids = [];
  const layout = accountSlotLayout(data);
  assert.equal(layout.current.length, 1);
  assert.equal(layout.current[0].slot?.checkout?.id, 'cart');
  assert.equal(layout.available, 2);
});

test('uncertain capacity shows checking cards, never extra purchase slots or hidden accounts', () => {
  const data = snapshot();
  for (const patch of [{ over_capacity: true }, { reconciliation_pending: true }, { limit: null }, { available: -1 }]) {
    const layout = accountSlotLayout({ ...data, allocation: { ...data.allocation, ...patch } } as DashboardSnapshot);
    assert.equal(layout.available, 0);
    assert.equal(layout.current.length, 2);
    assert.equal(layout.checking, 1);
  }
  data.accounts = Array.from({ length: 4 }, (_, index) => ({ ...evaluation, id: `account-${index}` }));
  data.allocation = { ...data.allocation, slots: [], occupied: 4, available: 0, over_capacity: true };
  assert.equal(accountSlotLayout(data).current.length, 4, 'an over-capacity exception must not hide real accounts');
  assert.equal(accountSlotLayout(data).available, 0);
});

test('closed account history does not consume an available slot, but funded setup keeps its slot', () => {
  const data = snapshot();
  data.accounts = [{ ...evaluation, lifecycle: 'passed' }];
  data.allocation = { ...data.allocation, slots: [], occupied: 0, available: 3 };
  assert.equal(accountSlotLayout(data).available, 3);
  assert.equal(accountSlotLayout(data).previous.length, 1);
  data.allocation = { ...data.allocation, occupied: 1, available: 2, slots: [{ id: 'continued-slot', account_id: evaluation.id, state: 'compliance_pending', pending_entitlement_id: 'funded' }] };
  assert.equal(accountSlotLayout(data).current.length, 1);
  assert.equal(accountSlotLayout(data).previous.length, 0);
  assert.equal(accountSlotLayout(data).available, 2);
});

test('only the selected evaluation determines pending/compliance/setup view', () => {
  const data = snapshot();
  let [active, pending] = journeys(data);
  assert.equal(accountView(active, data), 'active');
  assert.equal(accountView(pending, data), 'compliance');
  for (const [state, expected] of [['failed', 'setup-issue'], ['unknown', 'reconciling'], ['running', 'reconciling'], ['queued', 'preparing'], ['plan_mapping_required', 'setup-issue']] as const) {
    data.allocation.slots[1].state = state;
    [active, pending] = journeys(data);
    assert.equal(accountView(pending, data), expected);
    assert.equal(accountView(active, data), 'active', `${state} in another slot cannot replace the selected evaluation`);
    assert.equal(pending.account, null, 'an entitlement is never an issued trading account');
  }
});

test('paid evaluation keeps its same slot across pass, compliance and funded preparation', () => {
  const data = snapshot();
  data.accounts[0] = { ...evaluation, lifecycle: 'passed' };
  data.allocation.slots[0] = { id: 'slot-eval', account_id: evaluation.id, state: 'compliance_pending', pending_entitlement_id: 'funded-entitlement' };
  const journey = journeys(data)[0];
  assert.equal(journey.id, 'slot-eval'); assert.equal(journey.account?.id, evaluation.id);
  assert.equal(accountView(journey, data), 'compliance');
  journey.slot!.state = 'ready';
  assert.equal(accountView(journey, data), 'preparing');
  data.access.requires_acceptance = true;
  assert.equal(accountView(journey, data), 'invitation');
  assert.equal(journey.account?.kind, 'evaluation', 'waiting for funded issuance does not fabricate a funded account');
});

test('unknown lifecycle requires reconciliation while confirmed locks and terminal states remain distinct', () => {
  const data = snapshot(), journey = journeys(data)[0];
  for (const [lifecycle, expected] of [['unknown', 'reconciling'], ['unrecognized_vendor_state', 'reconciling'], ['created', 'preparing'], ['locked', 'locked'], ['passed', 'passed'], ['upgraded', 'passed'], ['failed', 'failed'], ['closed', 'closed']] as const) {
    journey.account = { ...evaluation, lifecycle };
    assert.equal(accountView(journey, data), expected);
  }
});

test('saved purchase remains its own selectable journey without borrowing account state or balance', () => {
  const data = snapshot();
  data.checkout = { id: 'saved-checkout', state: 'pending', slot_ids: [] };
  const purchase = journeys(data).find(journey => journey.id === 'purchase:saved-checkout')!;
  assert.equal(purchase.account, null); assert.equal(accountView(purchase, data), 'payment');
  assert.equal(accountView(journeys(data)[0], data), 'active');
});

test('missing or malformed financial evidence stays unknown and never borrows the account starting balance', () => {
  const empty = accountFacts(null, null);
  assert.equal(empty.balance, null); assert.equal(empty.pnl, null); assert.equal(empty.remaining, null); assert.equal(empty.lossLimit, null);
  const summary: Summary = { account: { ...evaluation, data: { starting_balance: '50000', balance: '51000' } }, records: [] };
  assert.equal(accountFacts(summary, null).balance, null);
  for (const invalid of [null, undefined, [], {}, false, '', ' ', '0x10', 'NaN', Infinity]) assert.equal(number(invalid), null);
  assert.equal(number('0'), 0); assert.equal(number('125.75'), 125.75);
  summary.records = [{ kind: 'balances', data: { balance: [] }, vendor_updated_at: '2026-09-17T12:00:00Z' }];
  assert.equal(accountFacts(summary, null).balance, null);
});

test('latest summary evidence wins over stale game PnL and reaching the target never confirms a pass', () => {
  const summary: Summary = { account: { ...evaluation, data: { passing_criteria: { profit_target_dollars: '3000' } } }, records: [
    { kind: 'balances', data: { balance: '50000' }, vendor_updated_at: '2026-09-16T12:00:00Z' },
    { kind: 'stats', data: { net_pnl: '3500' }, vendor_updated_at: '2026-09-17T12:00:00Z' },
    { kind: 'balances', data: { balance: '53500' }, vendor_updated_at: '2026-09-17T12:00:00Z' },
  ] };
  const game: GameSnapshot = { account: { id: evaluation.id, kind: 'evaluation', lifecycle: 'active', compliance_pending: true, as_of: null }, vendor_progress: { step: 0, target: '3000', net_pnl: '0', awaiting_vendor_pass: false }, eligibility: null, funded_issued: false };
  const facts = accountFacts(summary, game);
  assert.equal(facts.balance, 53500); assert.equal(facts.pnl, 3500); assert.equal(facts.remaining, 0);
  assert.ok(facts.progress < 1, 'visual progress cannot silently declare evaluation completion');
  const data = snapshot(); assert.equal(accountView(journeys(data)[0], data), 'active');
});

test('client API preserves not-found, session and changed-activity status for safe recovery', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403, 404, 409, 503]) {
      globalThis.fetch = async (_input, options) => {
        assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.cache, 'no-store');
        return Response.json({ error: 'synthetic-safe-error' }, { status });
      };
      await assert.rejects(accountApi('/api/trading/accounts/owned-history'), error => error instanceof AccountApiError && error.status === status);
    }
  } finally { globalThis.fetch = original; }
});

test('expired verification returns to password sign-in without redirecting ordinary permission denials', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const redirects: string[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { replace: (path: string) => redirects.push(path) } } });
  try {
    for (const [status, error] of [[403, 'permission_denied'], [403, 'second_factor_required'], [401, 'unauthorized']] as const) {
      globalThis.fetch = async () => Response.json({error}, {status});
      await assert.rejects(accountApi('/api/trading/dashboard'));
      if (error === 'permission_denied') assert.deepEqual(redirects, []);
    }
    assert.deepEqual(redirects, ['/login', '/login']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
