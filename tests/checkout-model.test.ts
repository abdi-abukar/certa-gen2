import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pendingPurchase, safeInvoiceUrl, type Purchase } from '../apps/web/app/checkout/model';
const purchase = (state: string, issuance: unknown[] = []) => ({ checkout: { state }, issuance } as Purchase);
test('checkout waits for every purchased evaluation without mistaking payment for issuance', () => {
 assert.equal(pendingPurchase(purchase('pending')), true);
 assert.equal(pendingPurchase(purchase('paid')), true);
 assert.equal(pendingPurchase(purchase('paid', [{ account_id: 'a' }, { account_id: null, state: 'queued' }])), true);
 assert.equal(pendingPurchase(purchase('paid', [{ account_id: 'a' }])), false);
 assert.equal(pendingPurchase(purchase('paid', [{ account_id: null, state: 'compliance_pending' }])), false);
 assert.equal(pendingPurchase(purchase('paid', [{ account_id: null, state: 'failed' }])), false);
 assert.equal(pendingPurchase(purchase('open')), false);
 assert.equal(pendingPurchase({...purchase('paid'),requires_acceptance:true}), false);
});
test('crypto continuation only opens the known HTTPS invoice host', () => {
 for (const url of ['javascript:alert(1)', 'https://nowpayments.io.attacker.test', 'http://nowpayments.io', 'https://attacker.test', null]) assert.equal(safeInvoiceUrl(url), null);
 assert.equal(safeInvoiceUrl('https://nowpayments.io/payment/?iid=123'), 'https://nowpayments.io/payment/?iid=123');
});
