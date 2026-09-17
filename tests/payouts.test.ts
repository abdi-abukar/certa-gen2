import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TradaraClient } from '../packages/server/src/tradara/client';
import { payoutOperation } from '../packages/server/src/payouts/worker';
import { money, cents, dollars, validateAdjustment, payoutPublic, encryptDestination, decryptDestination, destinationFingerprint } from '../packages/server/src/payouts/contracts';
import type { TradingOperations } from '../packages/server/src/tradara/operations';
import type { Row } from '../packages/server/src/tradara/contracts';
import { environmentFor } from '../scripts/environment.mjs';
const account = { id: 'account', vendor_id: 'vendor-account', user_id: 'user', firm_id: 'firm', kind: 'funded' };
const operation = { id: 'operation', account_id: 'account', user_id: 'user', action: 'payout-settle', payload: { payout_id: 'payout' } };
const initial: Row = { id: 'payout', operation_id: 'operation', account_id: 'account', step: 'not_started', amount_cents: 100000, cap_offset: '0' };
const adjustment = { id: 'adjustment', account_id: 'vendor-account', direction: 'withdrawal', amount: '1000.00', delta: '-1000.00', balance_before: '2000.00', balance_after: '1000.00', is_payout_withdrawal: true, reason_code: 'PAYOUT', note: 'Certa payout payout' };
function fixture(fail?: string) {
  let payout = { ...initial }; let withdrew = false; const calls: string[] = [];
  const db: any = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: payout }) }) }) }),
    rpc: async (name: string, args: Row) => {
      if (name !== 'cp_checkpoint') throw new Error(name);
      assert.equal(payout.step, args.p_expected);
      calls.push(`checkpoint:${args.p_next}`);
      payout = { ...payout, step: args.p_next, ...(args.p_next === 'withdrawal_confirmed' ? { adjustment_id: 'adjustment' } : {}) };
      return { data: payout };
    },
  };
  const vendor = new TradaraClient({ origin: 'https://api.tradara.com', key: 'fixture', firmId: 'firm' }, async () => {}, async (url, init) => {
    const path = String(url).replace('https://api.tradara.com', ''); const method = init?.method ?? 'GET'; calls.push(`${method}:${path}`);
    if (method === 'PATCH') return Response.json({ item: { account_id: 'vendor-account', max_drawdown_limit: '0', max_drawdown_lock_ceiling: fail === 'cap' ? '100' : '0' } });
    if (method === 'POST') {
      assert.equal(payout.step, 'withdrawal_dispatching');
      assert.deepEqual(JSON.parse(String(init?.body)), { direction: 'withdrawal', amount: 1000, reason_code: 'PAYOUT', is_payout_withdrawal: true, note: 'Certa payout payout' });
      withdrew = true;
      if (fail === 'timeout') throw new Error('lost response');
      return Response.json({ item: adjustment });
    }
    if (path.includes('/adjustments?')) return Response.json({ items: [adjustment] });
    if (path.startsWith('/v1/firm-control')) return Response.json({ item: { id: 'vendor-account', status: fail === 'unlocked' ? 'ACTIVE' : 'LOCKED', max_drawdown_limit: '0', max_drawdown_mode: 'end_of_day_balance' } });
    if (path.startsWith('/v1/balances')) return Response.json({ item: { account_id: 'vendor-account', balance: withdrew ? '1000.00' : fail === 'cash' ? '900.00' : '2000.00', starting_balance: '0.00' } });
    throw new Error(`Unexpected ${path}`);
  });
  const ops = {
    firm: 'firm', vendor,
    store: { db, one: async (table: string) => table === 'accounts' ? account : { status: 'ACTIVE' }, rpc: async () => ({ kyc: true, tax: true, agreement: true }) },
    requireFlat: async () => { calls.push('flat'); if (fail === 'positions') throw new Error('open positions'); },
    apply: async () => { calls.push('projection'); },
  } as unknown as TradingOperations;
  return { ops, calls, payout: () => payout };
}
test('payout applies and confirms the cap before debiting; cash confirmation precedes ready', async () => {
  const f = fixture(); await payoutOperation(f.ops, operation);
  assert.equal(f.payout().step, 'withdrawal_confirmed');
  assert.ok(f.calls.indexOf('checkpoint:cap_confirmed') < f.calls.indexOf('checkpoint:withdrawal_dispatching'));
  assert.ok(f.calls.findIndex(x => x.startsWith('POST:')) < f.calls.lastIndexOf('GET:/v1/balances/vendor-account'));
  assert.equal(f.calls.filter(x => x.startsWith('POST:')).length, 1);
});
test('timeout after a debit cannot cause another debit, and verified history recovers it', async () => {
  const f = fixture('timeout'); await assert.rejects(payoutOperation(f.ops, operation));
  assert.equal(f.payout().step, 'withdrawal_dispatching');
  await assert.rejects(payoutOperation(f.ops, operation), /reconciliation_required/);
  assert.equal(f.calls.filter(x => x.startsWith('POST:')).length, 1);
  await payoutOperation(f.ops, { ...operation, action: 'payout-reconcile', payload: { payout_id: 'payout', adjustment_id: 'adjustment', offset: 0 } });
  assert.equal(f.payout().step, 'withdrawal_confirmed');
  assert.equal(f.calls.filter(x => x.startsWith('POST:')).length, 1);
});
test('unsafe cash, open exposure, absent lock, or an unexpected cap never dispatch withdrawal', async () => {
  for (const failure of ['cash','positions','unlocked','cap']) {
    const f = fixture(failure); await assert.rejects(payoutOperation(f.ops, operation));
    assert.equal(f.calls.some(x => x.startsWith('POST:')), false, failure);
  }
});
test('reconciliation rejects a different payout, account, amount, sign, or unmarked adjustment', () => {
  assert.equal(validateAdjustment(adjustment, initial, 'vendor-account').id, 'adjustment');
  for (const change of [{ account_id: 'other' }, { amount: '999.00' }, { delta: '1000.00' }, { balance_after: '999.00' }, { is_payout_withdrawal: false }, { note: 'another payout' }]) assert.throws(() => validateAdjustment({ ...adjustment, ...change }, initial, 'vendor-account'));
});
test('exact amounts reject excess precision and customer payout DTOs omit staff and destination secrets', () => {
  assert.equal(money('250.01'), 25001n); assert.equal(money('-250.01'), -25001n); assert.equal(dollars(25001), '250.01');
  for (const invalid of [NaN, Infinity, 1.1, -1]) assert.throws(() => cents(invalid));
  assert.throws(() => money('250.001'));
  const dto = payoutPublic({ ...initial, state: 'approved', eligibility: { private: true }, reason: 'internal review', method_snapshot: { kind: 'bank', label: 'Bank', masked: '1234', encrypted: 'SECRET' } });
  assert.ok(!JSON.stringify(dto).includes('SECRET')); assert.equal(dto.eligibility, undefined); assert.equal(dto.reason, null);
});
test('destination encryption is authenticated, fingerprints stable, and key only enters web/admin', () => {
  const previous = process.env.PAYOUT_DESTINATION_KEY; process.env.PAYOUT_DESTINATION_KEY = '12'.repeat(32);
  try {
    const encrypted = encryptDestination('fixture account 1234'); assert.equal(decryptDestination(encrypted), 'fixture account 1234');
    assert.notEqual(encryptDestination('fixture account 1234'), encrypted);
    assert.equal(destinationFingerprint('same'), destinationFingerprint('same'));
    const altered = Buffer.from(encrypted, 'base64'); altered[altered.length - 1] ^= 1; assert.throws(() => decryptDestination(altered.toString('base64')));
    const settings = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_for_tests', WEB_ORIGIN: 'http://localhost:3200', ADMIN_ORIGIN: 'http://localhost:3201', API_ORIGIN: 'http://localhost:3200', PAYOUT_DESTINATION_KEY: 'secret-canary' };
    for (const app of ['web','admin','mobile','tradara','contracts']) assert.equal(JSON.stringify(environmentFor(app, settings, {})).includes('secret-canary'), ['web','admin'].includes(app));
  } finally { if (previous === undefined) delete process.env.PAYOUT_DESTINATION_KEY; else process.env.PAYOUT_DESTINATION_KEY = previous; }
});
