import 'server-only';
import { principal, authorized, cors } from '../request';
import { exact, object, readBody, string, uuid, TradingError, type Row } from '../tradara/contracts';
import { PayoutStore } from './store';
import { cents, contentUrl, decryptDestination, destinationFingerprint, encryptDestination, payoutPublic } from './contracts';

const idempotencyKey = (request: Request) => {
  const key = string(request.headers.get('idempotency-key'), 'idempotency_key', 100);
  if (!/^[A-Za-z0-9:_-]{8,100}$/.test(key)) throw new TradingError('invalid_idempotency_key');
  return key;
};
const enumeration = (value: unknown, allowed: string[]) => {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new TradingError('invalid_choice'); return value;
};
export async function payoutResponse(request: Request, segments: string[], staff = false): Promise<Response> {
  let headers = new Headers({ 'Cache-Control': 'private, no-store' });
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const who = await principal(request, staff); const store = new PayoutStore();
    const path = segments.join('/'); const url = new URL(request.url);
    const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
    if (staff) authorized(who, 'payouts:read');
    const after = url.searchParams.get('cursor'); if (after) uuid(after);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const oneOwned = async (table: string, id: string) => {
      const row = await store.one(table, uuid(id));
      if (!row || !staff && row.user_id !== who.id) throw new TradingError('not_found', 404); return row;
    };
    if (request.method === 'GET') {
      if (path === 'summary') return reply(await store.rpc('summary', { p_user: staff ? (url.searchParams.get('user_id') ? uuid(url.searchParams.get('user_id')) : null) : who.id, p_session: staff && url.searchParams.get('session_id') ? uuid(url.searchParams.get('session_id')) : null }));
      if (segments[0] === 'accounts' && segments.length === 3 && segments[2] === 'eligibility') {
        const account = await store.trading.one('accounts', 'id', uuid(segments[1]));
        if (!account || !staff && account.user_id !== who.id) throw new TradingError('not_found', 404);
        return reply(await store.rpc('eligibility', { p_user: account.user_id, p_account: account.id }));
      }
      if (segments[0] === 'requests' && segments.length >= 2) {
        const row = await oneOwned('payouts', segments[1]);
        if (segments.length === 3 && segments[2] === 'destination' && staff) {
          authorized(who, 'payouts:send');
          await store.rpc('event', { p_user: row.user_id, p_entity: row.id, p_actor: who.id, p_action: 'destination-read' });
          return reply({ destination: decryptDestination(String(object(row.method_snapshot).encrypted)) });
        }
        if (segments.length !== 2) throw new TradingError('not_found', 404);
        const { data: timeline, error } = await store.db.from('cp_events').select(staff ? 'id,action,actor_id,data,created_at' : 'id,action,created_at').eq('entity_id', row.id).order('created_at').limit(100);
        if (error) throw new TradingError('payout_store_unavailable', 503);
        const operation = staff && row.operation_id ? await store.trading.one('operations', 'id', String(row.operation_id)) : null;
        return reply({ payout: staff ? { ...row, method_snapshot: { ...object(row.method_snapshot), encrypted: undefined } } : payoutPublic(row), timeline, ...(staff ? { operation } : {}) });
      }
      const lists: Record<string, { table: string; fields: string; admin?: boolean }> = {
        requests: { table: 'payouts', fields: '*' },
        methods: { table: 'methods', fields: 'id,kind,label,masked,active,created_at' },
        affiliates: { table: 'affiliates', fields: '*', admin: true },
        codes: { table: 'codes', fields: '*' },
        earnings: { table: 'earnings', fields: '*' },
        commissions: { table: 'earnings', fields: '*' },
        content: { table: 'content', fields: '*' },
        sessions: { table: 'sessions', fields: '*', admin: true },
      };
      const spec = lists[path];
      if (!spec || spec.admin && !staff) throw new TradingError('not_found', 404);
      let query = store.db.from(`cp_${spec.table}`).select(spec.fields).order('id').limit(limit);
      if (!staff) query = query.eq('user_id', who.id);
      else if (url.searchParams.get('user_id') && path !== 'sessions') query = query.eq('user_id', uuid(url.searchParams.get('user_id')));
      if (after) query = query.gt('id', after);
      if (path === 'commissions') query = query.eq('kind', 'commission');
      if (url.searchParams.get('state') && ['requests','codes','commissions','content'].includes(path)) query = query.eq('state', string(url.searchParams.get('state'), 'state', 30));
      if (path === 'requests') {
        if (url.searchParams.get('kind')) query = query.eq('kind', enumeration(url.searchParams.get('kind'), ['trader','affiliate']));
        if (url.searchParams.get('session_id')) query = query.eq('session_id', uuid(url.searchParams.get('session_id')));
      }
      const { data, error } = await query;
      if (error) throw new TradingError('payout_store_unavailable', 503);
      const rows = (data ?? []) as unknown as Row[];
      return reply({ items: path === 'requests' ? rows.map(row => staff ? { ...row, method_snapshot: { ...object(row.method_snapshot), encrypted: undefined } } : payoutPublic(row)) : rows, next_cursor: rows.length === limit ? rows.at(-1)?.id : null });
    }
    if (request.method !== 'POST') throw new TradingError('method_not_allowed', 405);
    if (!request.headers.get('content-type')?.includes('application/json')) throw new TradingError('json_required', 415);
    const key = idempotencyKey(request);
    let body: Row;
    try { body = object(JSON.parse(Buffer.from(await readBody(request)).toString())); } catch (error) { if (error instanceof TradingError) throw error; throw new TradingError('invalid_json'); }
    let action = ''; let user = who.id; let payload: Row = {};
    if (path === 'methods' && !staff) {
      exact(body, ['kind','label','destination']);
      const destination = string(body.destination, 'destination', 2000);
      const kind = enumeration(body.kind, ['bank','wise','paypal','crypto']); const label = string(body.label, 'label', 80);
      action = 'method'; payload = { kind, label, masked: `••••${destination.slice(-4)}`, encrypted: encryptDestination(destination), fingerprint: destinationFingerprint(destination) };
    } else if (segments[0] === 'methods' && segments.length === 3 && segments[2] === 'disable' && !staff) {
      exact(body, []); await oneOwned('methods', segments[1]); action = 'disable-method'; payload = { id: uuid(segments[1]) };
    } else if (path === 'affiliates/enroll' && !staff) {
      exact(body, []); action = 'affiliate-enroll';
    } else if (path === 'codes' && !staff) {
      exact(body, ['code','application']); action = 'code-apply';
      const code = string(body.code, 'code', 32).toUpperCase(); if (!/^[A-Z0-9_-]{4,32}$/.test(code)) throw new TradingError('invalid_code');
      payload = { code, application: string(body.application, 'application', 2000) };
    } else if (path === 'content' && !staff) {
      exact(body, ['platform','url','note']); action = 'content-submit';
      payload = { platform: enumeration(body.platform, ['x','instagram','youtube','tiktok','discord','other']), url: contentUrl(body.url), note: body.note ? string(body.note, 'note', 1000) : '' };
    } else if (path === 'requests' && !staff) {
      exact(body, ['account_id','method_id','amount_cents']); action = 'request';
      payload = { account_id: uuid(body.account_id), method_id: uuid(body.method_id), amount_cents: cents(body.amount_cents, 25000) };
    } else if (segments[0] === 'accounts' && segments.length === 3 && segments[2] === 'refresh-evidence') {
      exact(body, []); const account = await store.trading.one('accounts', 'id', uuid(segments[1]));
      if (!account || !staff && account.user_id !== who.id) throw new TradingError('not_found', 404);
      action = 'refresh-evidence'; user = String(account.user_id); payload = { account_id: account.id };
    } else if (staff && segments.length === 3 && segments[2] === 'review' && ['codes','commissions','content'].includes(segments[0])) {
      authorized(who, 'affiliates:review'); const table = { codes: 'codes', commissions: 'earnings', content: 'content' }[segments[0]]!;
      const row = await oneOwned(table, segments[1]); user = String(row.user_id); payload = { id: row.id };
      if (segments[0] === 'content') {
        exact(body, ['state','views','reward_cents','evidence']); action = 'content-review';
        const state = enumeration(body.state, ['approved','rejected']);
        payload = { ...payload, state, views: cents(body.views), reward_cents: state === 'approved' ? cents(body.reward_cents) : 0, evidence: string(body.evidence, 'evidence', 2000) };
      } else {
        exact(body, ['state','reason']); action = segments[0] === 'codes' ? 'code-review' : 'commission-review';
        payload = { ...payload, state: enumeration(body.state, segments[0] === 'codes' ? ['approved','rejected','disabled'] : ['approved','rejected']), reason: string(body.reason, 'reason', 1000) };
      }
    } else if (staff && segments[0] === 'affiliates' && segments.length === 3 && segments[2] === 'manage') {
      authorized(who, 'affiliates:manage'); exact(body, ['status','commission_bps','reason']);
      user = uuid(segments[1]); action = 'affiliate-manage'; const bps = cents(body.commission_bps); if (bps > 10000) throw new TradingError('invalid_commission_rate');
      payload = { status: enumeration(body.status, ['active','suspended']), commission_bps: bps, reason: string(body.reason, 'reason', 1000) };
    } else if (staff && segments[0] === 'requests' && segments.length === 3) {
      const row = await oneOwned('payouts', segments[1]); user = String(row.user_id); action = segments[2]; payload = { id: row.id };
      const permissions: Record<string,string> = { approve: 'payouts:approve', reopen: 'payouts:approve', reject: 'payouts:approve', 'mark-paid': 'payouts:send', 'contracts-confirm': 'payouts:approve', 'change-cap': 'payouts:recovery', 'not-applied': 'payouts:recovery', resume: 'payouts:recovery', reconcile: 'payouts:recovery' };
      if (!permissions[action]) throw new TradingError('not_found', 404); authorized(who, permissions[action]);
      if (action === 'reopen') {
        exact(body, ['method_id','reason']); payload.method_id = uuid(body.method_id); payload.reason = string(body.reason, 'reason', 1000);
      } else if (action === 'approve' || action === 'change-cap') {
        exact(body, ['cap_offset','reason']); payload.reason = string(body.reason, 'reason', 1000);
        if (row.kind === 'trader') { authorized(who, 'trading:finance'); payload.cap_offset = string(body.cap_offset, 'cap_offset', 20); }
      } else if (action === 'mark-paid') {
        exact(body, ['transfer_reference']); payload.transfer_reference = string(body.transfer_reference, 'transfer_reference', 200);
      } else if (action === 'contracts-confirm' || action === 'not-applied') {
        exact(body, ['evidence']); payload.evidence = string(body.evidence, 'evidence', 1000);
      } else if (action === 'reconcile') {
        exact(body, ['adjustment_id','offset','reason']); payload.reason = string(body.reason, 'reason', 1000);
        payload.adjustment_id = body.adjustment_id ? uuid(body.adjustment_id) : null;
        payload.offset = body.offset === undefined ? 0 : cents(body.offset);
      } else { exact(body, ['reason']); payload.reason = string(body.reason, 'reason', 1000); }
    } else throw new TradingError('not_found', 404);
    return reply(await store.rpc('command', { p_actor: who.id, p_user: user, p_key: key, p_action: action, p_body: payload }), 202);
  } catch (error) {
    return Response.json({ error: error instanceof TradingError ? error.code : 'payout_unavailable' }, { status: error instanceof TradingError ? error.status : 503, headers });
  }
}
