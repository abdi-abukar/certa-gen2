import 'server-only';
import { date, exact, object, string, uuid, TradingError, type Row } from './contracts';
import type { TradingStore } from './store';

type Context = { user: string; actor: string; staff: boolean; authorize: (permission: string) => void };
const key = (request: Request) => {
  const value = string(request.headers.get('idempotency-key'), 'idempotency_key', 100);
  if (!/^[A-Za-z0-9:_-]{8,100}$/.test(value)) throw new TradingError('invalid_idempotency_key');
  return value;
};
const reason = (body: Row) => string(body.reason, 'reason', 500);
const boolean = (value: unknown) => {
  if (typeof value !== 'boolean') throw new TradingError('invalid_boolean');
  return value;
};

/** Identity, staff status, Origin and no-store headers are supplied by the shared HTTP boundary. */
export async function allocationResponse(request: Request, segments: string[], store: TradingStore, context: Context, headers: Headers, body?: Row): Promise<Response | null> {
  const path = segments.join('/');
  const { user, actor, staff, authorize } = context;
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
  if (request.method === 'GET') {
    if (path === 'allocation' || staff && /^users\/[^/]+\/allocation$/.test(path)) {
      return reply(await store.rpc('allocation_snapshot', { p_user: user }));
    }
    if (path === 'plans') {
      const { data, error } = await store.db.from('ct_plans').select(staff ? '*' : 'id').eq('enabled', true).eq('pass_only_verified', true).order('id').limit(100);
      if (error) throw new TradingError('trading_store_unavailable', 503);
      return reply(data);
    }
    if (/^reservations\/[^/]+$/.test(path)) {
      const order = await store.one('slot_orders', 'id', uuid(segments[1]));
      if (!order || !staff && order.user_id !== actor) throw new TradingError('not_found', 404);
      return reply(order);
    }
    if (staff && /^users\/[^/]+\/(compliance-evidence|account-entitlements|closures)$/.test(path)) {
      authorize('trading:read');
      const table = { 'compliance-evidence': 'compliance_evidence', 'account-entitlements': 'entitlements', closures: 'closures' }[segments[2]]!;
      const url = new URL(request.url); const cursor = url.searchParams.get('cursor');
      return reply(await store.list(table, { user_id: user }, cursor ? uuid(cursor) : undefined, 100));
    }
    return null;
  }
  if (!body) return null;
  if (path === 'reservations' && !staff) {
    exact(body, ['plan_id', 'quantity']);
    if (!Number.isInteger(body.quantity) || Number(body.quantity) < 1 || Number(body.quantity) > 3) throw new TradingError('invalid_quantity');
    return reply(await store.rpc('reserve', { p_user: actor, p_key: key(request), p_plan: string(body.plan_id, 'plan_id'), p_quantity: body.quantity }), 201);
  }
  if (!staff) return null;
  if (/^reservations\/[^/]+\/settle$/.test(path)) {
    authorize('trading:finance'); exact(body, ['result', 'reference', 'reason']);
    if (!['paid', 'cancelled'].includes(String(body.result))) throw new TradingError('invalid_result');
    return reply(await store.rpc('settle_order', { p_actor: actor, p_order: uuid(segments[1]), p_result: body.result, p_reference: string(body.reference, 'reference'), p_reason: reason(body) }));
  }
  if (/^users\/[^/]+\/compliance-evidence$/.test(path)) {
    authorize('trading:compliance');
    exact(body, ['requirement', 'version', 'status', 'source', 'effective_at', 'expires_at', 'evidence_reference', 'reason']);
    if (!['kyc', 'tax', 'agreement'].includes(String(body.requirement)) || !['approved', 'revoked', 'rejected'].includes(String(body.status))) throw new TradingError('invalid_compliance');
    const data = { requirement: body.requirement, status: body.status, version: string(body.version, 'version', 100), source: string(body.source, 'source'), effective_at: date(body.effective_at), expires_at: body.expires_at ? date(body.expires_at) : null, evidence_reference: string(body.evidence_reference, 'evidence_reference'), reason: reason(body) };
    return reply(await store.rpc('record_compliance', { p_actor: actor, p_user: user, p_data: data }));
  }
  if (/^users\/[^/]+\/account-grants$/.test(path)) {
    authorize('trading:provision'); exact(body, ['kind', 'plan_reference', 'replace_account_id', 'reason']);
    if (!['funded', 'evaluation', 'practice'].includes(String(body.kind))) throw new TradingError('invalid_kind');
    if (body.replace_account_id) authorize('trading:control');
    return reply(await store.rpc('grant_account', { p_actor: actor, p_user: user, p_key: key(request), p_plan: string(body.plan_reference, 'plan_reference'), p_kind: body.kind, p_replace: body.replace_account_id ? uuid(body.replace_account_id) : null, p_reason: reason(body) }), 202);
  }
  if (/^accounts\/[^/]+\/closure-request$/.test(path)) {
    authorize('trading:control'); exact(body, ['reason']);
    return reply(await store.rpc('request_closure', { p_actor: actor, p_account: uuid(segments[1]), p_reason: reason(body) }), 202);
  }
  if (/^entitlements\/[^/]+\/cancel$/.test(path)) {
    authorize('trading:provision'); exact(body, ['reason']);
    return reply(await store.rpc('cancel_entitlement', { p_actor: actor, p_entitlement: uuid(segments[1]), p_reason: reason(body) }));
  }
  if (/^plans\/[^/]+$/.test(path)) {
    authorize('trading:config'); exact(body, ['evaluation_plan', 'funded_plan', 'enabled', 'pass_only_verified', 'reason']);
    await store.rpc('configure_plan', { p_actor: actor, p_id: string(segments[1], 'plan_id', 100), p_data: { evaluation_plan: string(body.evaluation_plan, 'evaluation_plan'), funded_plan: string(body.funded_plan, 'funded_plan'), enabled: boolean(body.enabled), pass_only_verified: boolean(body.pass_only_verified), reason: reason(body) } });
    return reply({ updated: true });
  }
  if (/^compliance-requirements\/(kyc|tax|agreement)$/.test(path)) {
    authorize('trading:compliance'); exact(body, ['version', 'reason']);
    await store.rpc('compliance_version', { p_actor: actor, p_requirement: segments[1], p_version: string(body.version, 'version', 100), p_reason: reason(body) });
    return reply({ updated: true });
  }
  if (/^operations\/[^/]+\/bind-account$/.test(path)) {
    authorize('trading:recovery'); exact(body, ['inventory_operation_id', 'vendor_account_id', 'reason']);
    const op = await store.one('operations', 'id', uuid(segments[1]));
    const inventory = await store.one('operations', 'id', uuid(body.inventory_operation_id));
    if (!op || op.action !== 'provision' || !['unknown', 'failed'].includes(String(op.state)) || !inventory || inventory.user_id !== op.user_id || inventory.state !== 'confirmed' || inventory.action !== 'refresh' || object(inventory.payload).resource !== 'accounts') throw new TradingError('verified_inventory_required', 409);
    const rows = object(inventory.result).items;
    const row = Array.isArray(rows) ? rows.find(value => (value.id ?? value.account_id) === body.vendor_account_id) : null;
    if (!row) throw new TradingError('account_not_in_inventory', 409);
    return reply(await store.rpc('recover_provision', { p_actor: actor, p_operation: op.id, p_inventory: inventory.id, p_vendor: string(body.vendor_account_id, 'vendor_account_id'), p_firm: string(process.env.TRADARA_FIRM_ID, 'firm'), p_reason: reason(body) }));
  }
  return null;
}
