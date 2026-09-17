import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocationResponse } from '../packages/server/src/tradara/allocation-http';
import { TradingOperations } from '../packages/server/src/tradara/operations';
import { TradingError } from '../packages/server/src/tradara/contracts';
import type { TradingStore } from '../packages/server/src/tradara/store';
import type { TradaraClient } from '../packages/server/src/tradara/client';
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const headers = new Headers({ 'Cache-Control': 'private, no-store' });
const request = () => new Request('https://certa.test/api/trading/reservations', { method: 'POST', headers: { 'Idempotency-Key': 'fixture-request' } });

test('customer reservation binds authenticated identity and rejects invented payment/compliance fields', async () => {
  const calls: unknown[] = [];
  const store = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { id: other }; } } as unknown as TradingStore;
  const context = { user, actor: user, staff: false, authorize: () => { throw new Error('staff only'); } };
  const response = await allocationResponse(request(), ['reservations'], store, context, headers, { plan_id: '50k', quantity: 1 });
  assert.equal(response?.status, 201);
  assert.deepEqual(calls, [['reserve', { p_user: user, p_key: 'fixture-request', p_plan: '50k', p_quantity: 1 }]]);
  for (const extra of [{ user_id: other }, { paid: true }, { compliance_approved: true }]) {
    await assert.rejects(allocationResponse(request(), ['reservations'], store, context, headers, { plan_id: '50k', quantity: 1, ...extra }));
  }
  assert.equal(calls.length, 1);
});

test('funded replacement needs both provisioning and account-control permissions', async () => {
  let calls = 0;
  const store = { rpc: async () => { calls++; return {}; } } as unknown as TradingStore;
  const context = { user, actor: other, staff: true, authorize: (permission: string) => { if (permission !== 'trading:provision') throw new TradingError('permission_denied', 403); } };
  await assert.rejects(allocationResponse(request(), ['users', user, 'account-grants'], store, context, headers, { kind: 'funded', plan_reference: 'funded-50k', replace_account_id: other, reason: 'Replacement' }));
  assert.equal(calls, 0);
  const response = await allocationResponse(request(), ['users', user, 'account-grants'], store, context, headers, { kind: 'funded', plan_reference: 'funded-50k', reason: 'Grant' });
  assert.equal(response?.status, 202);
});

test('customer cannot record compliance evidence or settle payments through allocation routes', async () => {
  const store = { rpc: async () => { throw new Error('must not reach RPC'); } } as unknown as TradingStore;
  const context = { user, actor: user, staff: false, authorize: () => {} };
  assert.equal(await allocationResponse(request(), ['users', user, 'compliance-evidence'], store, context, headers, {}), null);
  assert.equal(await allocationResponse(request(), ['reservations', other, 'settle'], store, context, headers, {}), null);
  const scoped = { ...store, one: async () => ({ id: other, user_id: other }) } as unknown as TradingStore;
  await assert.rejects(allocationResponse(new Request('https://certa.test'), ['reservations', other], scoped, context, headers), (error: unknown) => error instanceof TradingError && error.status === 404);
});

test('worker rechecks database eligibility before any vendor issuance and binds the result transactionally', async () => {
  const steps: string[] = [];
  let eligible = false;
  const store = {
    one: async () => ({ vendor_user_id: 'vendor-user', status: 'ACTIVE' }),
    rpc: async (name: string) => {
      steps.push(name);
      if (name === 'assert_provision') { if (!eligible) throw new TradingError('compliance_required', 409); return { kind: 'funded', plan_reference: 'funded-50k' }; }
      return { vendor_account_id: 'new-account' };
    },
  } as unknown as TradingStore;
  const vendor = { request: async () => { steps.push('vendor-create'); return { accounts: { items: [{ id: 'new-account' }] } }; } } as unknown as TradaraClient;
  const operations = new TradingOperations(store, vendor, 'firm');
  const op = { id: other, user_id: user, action: 'provision', payload: { entitlement_id: other } };
  await assert.rejects(operations.run(op));
  assert.deepEqual(steps, ['assert_provision']);
  eligible = true; steps.length = 0;
  assert.deepEqual(await operations.run(op), { vendor_account_id: 'new-account' });
  assert.deepEqual(steps, ['assert_provision', 'vendor-create', 'bind_provision']);
});
