import 'server-only';
import { object, TradingError, vendorCashAmount, type Row } from '../tradara/contracts';
import type { TradingOperations } from '../tradara/operations';
import { PayoutStore } from './store';
import { dollars, money, validateAdjustment } from './contracts';
const item = (value: Row) => object(value.item ?? value.balance ?? value);

export async function payoutOperation(ops: TradingOperations, operation: Row): Promise<Row> {
  const store = new PayoutStore(ops.store); const input = object(operation.payload);
  const account = await ops.store.one('accounts', 'id', String(operation.account_id));
  if (!account || account.user_id !== operation.user_id || account.firm_id !== ops.firm) throw new TradingError('account_not_found', 404);
  const vendorId = String(account.vendor_id); const id = encodeURIComponent(vendorId);
  if (operation.action === 'payout-evidence') {
    const liveAccount = item(await ops.vendor.request('GET', `/v1/firm-control/accounts/${id}`));
    if (String(liveAccount.id ?? liveAccount.account_id) !== vendorId) throw new TradingError('account_not_verified', 409);
    await ops.apply('accounts.updated', liveAccount, vendorId, undefined, new Date().toISOString(), String(operation.id));
    await ops.refresh({ ...operation, payload: { resource: 'summary' } }, account, null);
    await ops.refresh({ ...operation, payload: { resource: 'daily-stats' } }, account, null);
    return { refreshed: true };
  }
  let payout = await store.one('payouts', String(input.payout_id));
  if (!payout || payout.operation_id !== operation.id || payout.account_id !== account.id) throw new TradingError('payout_not_found', 404);
  const checkpoint = async (expected: string, next: string, data: Row = {}) => {
    payout = await store.rpc('checkpoint', { p_id: payout!.id, p_operation: operation.id, p_expected: expected, p_next: next, p_data: data });
  };
  if (operation.action === 'payout-reconcile') {
    if (payout.step === 'cap_dispatching') {
      const live = item(await ops.vendor.request('GET', `/v1/firm-control/accounts/${id}`));
      const risk = live.risk_profile ? object(live.risk_profile) : live;
      if (risk.max_drawdown_mode !== 'end_of_day_balance') throw new TradingError('payout_risk_mode_not_verified', 409);
      if (money(risk.max_drawdown_limit) !== money(payout.cap_offset)) throw new TradingError('cap_not_verified', 409);
      await checkpoint('cap_dispatching', 'cap_confirmed', risk);
      // A separate explicit resume is needed before any withdrawal.
      return { cap_verified: true, resume_required: true };
    }
    const offset = Number(input.offset ?? 0);
    const page = await ops.vendor.request('GET', `/v1/balances/${id}/adjustments?is_payout_withdrawal=true&limit=100&offset=${offset}`);
    if (!Array.isArray(page.items)) throw new TradingError('adjustments_unavailable', 409);
    const matches = page.items.filter(value => object(value).note === `Certa payout ${payout!.id}`);
    if (matches.length !== 1 || object(matches[0]).id !== input.adjustment_id) throw new TradingError('adjustment_not_verified', 409);
    const adjustment = validateAdjustment(matches[0], payout, vendorId);
    await ops.vendor.request('GET', `/v1/balances/${id}`);
    await checkpoint(String(payout.step), 'withdrawal_confirmed', adjustment);
    return { reconciled: true, adjustment_id: adjustment.id };
  }
  if (payout.step === 'withdrawal_confirmed') return { adjustment_id: payout.adjustment_id };
  if (!['not_started', 'cap_confirmed'].includes(String(payout.step))) throw new TradingError('reconciliation_required', 409);
  const compliance = await ops.store.rpc('compliance', { p_user: account.user_id });
  const member = await ops.store.one('memberships', 'user_id', String(account.user_id));
  if (!compliance.kyc || !compliance.tax || !compliance.agreement || member?.status !== 'ACTIVE') throw new TradingError('compliance_required', 409);
  // Staff locks this single account through the existing trading control API.
  // Never unlock automatically: another operational/compliance hold may still apply.
  const currentAccount = item(await ops.vendor.request('GET', `/v1/firm-control/accounts/${id}`));
  if (String(currentAccount.id ?? currentAccount.account_id) !== vendorId || (String(currentAccount.status).toUpperCase() !== 'LOCKED' && currentAccount.lockout_active !== true) || currentAccount.hard_breach === true) throw new TradingError('payout_account_lock_required', 409);
  const currentRisk = currentAccount.risk_profile ? object(currentAccount.risk_profile) : currentAccount;
  if (currentRisk.max_drawdown_mode !== 'end_of_day_balance') throw new TradingError('payout_risk_mode_not_verified', 409);
  await ops.requireFlat(vendorId);
  const balance = item(await ops.vendor.request('GET', `/v1/balances/${id}`));
  const starting = money(balance.starting_balance);
  const after = money(balance.balance) - BigInt(String(payout.amount_cents));
  const ceiling = starting + money(payout.cap_offset);
  // The API itself permits negative cash. Check both cash and the chosen cap.
  if ((money(balance.balance) - starting) < BigInt(String(payout.amount_cents)) * 2n || after < 0n || after < ceiling) throw new TradingError('unsafe_post_payout_balance', 409);
  if (payout.step === 'cap_confirmed') {
    const risk = currentAccount.risk_profile ? object(currentAccount.risk_profile) : currentAccount;
    if (money(risk.max_drawdown_limit) !== money(payout.cap_offset)) throw new TradingError('cap_not_verified', 409);
  }
  if (payout.step === 'not_started') {
    // Budget is consumed by the adapter; an interruption after this checkpoint is
    // deliberately uncertain, even when it happened just before the HTTP request.
    await checkpoint('not_started', 'cap_dispatching');
    const cap = item(await ops.vendor.request('PATCH', `/v1/firm-control/accounts/${id}/max-loss-limit`, {
      max_drawdown_limit: payout!.cap_offset, reason_code: 'PAYOUT', note: `Certa payout ${payout!.id}`,
    }));
    if (cap.account_id !== vendorId || money(cap.max_drawdown_limit) !== money(payout!.cap_offset) || money(cap.max_drawdown_lock_ceiling) !== ceiling) throw new TradingError('cap_not_verified', 409);
    await checkpoint('cap_dispatching', 'cap_confirmed', cap);
  }
  // Recheck after the cap call; a confirmed cap alone isn't a confirmed payout.
  await ops.requireFlat(vendorId);
  const latest = item(await ops.vendor.request('GET', `/v1/balances/${id}`));
  const latestAfter = money(latest.balance) - BigInt(String(payout!.amount_cents));
  if ((money(latest.balance) - starting) < BigInt(String(payout!.amount_cents)) * 2n || latestAfter < 0n || latestAfter < ceiling) throw new TradingError('unsafe_post_payout_balance', 409);
  await checkpoint('cap_confirmed', 'withdrawal_dispatching');
  const response = await ops.vendor.request('POST', `/v1/balances/${id}/adjust`, {
    direction: 'withdrawal', amount: vendorCashAmount(dollars(BigInt(String(payout!.amount_cents)))),
    reason_code: 'PAYOUT', is_payout_withdrawal: true, note: `Certa payout ${payout!.id}`,
  });
  const adjustment = validateAdjustment(response.item, payout!, vendorId);
  const liveBalance = item(await ops.vendor.request('GET', `/v1/balances/${id}`));
  if (money(liveBalance.balance) !== money(adjustment.balance_after)) throw new TradingError('balance_reconciliation_required', 409);
  await checkpoint('withdrawal_dispatching', 'withdrawal_confirmed', adjustment);
  await ops.apply('balances.updated', liveBalance, vendorId, undefined, new Date().toISOString(), String(operation.id));
  return { adjustment_id: adjustment.id, ready_for_payment: true };
}
