import 'server-only';
import { principal, authorized, cors } from '../request';
import { object, exact, string, uuid, readBody, TradingError, type Row } from '../tradara/contracts';
import { ContractStore, publicRequest } from './store';
import { callbackHint, providerId, safeProviderUrl, verifyCallback, type Provider } from './providers';
const kinds = ['kyc', 'sim_funded', 'w9', 'w8ben'];
const key = (request: Request) => {
  const value = string(request.headers.get('idempotency-key'), 'idempotency_key', 100);
  if (!/^[A-Za-z0-9:_-]{8,100}$/.test(value)) throw new TradingError('invalid_idempotency_key');
  return value;
};
export async function complianceResponse(request: Request, segments: string[], staff = false): Promise<Response> {
  let headers = new Headers({ 'Cache-Control': 'private, no-store' });
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const who = await principal(request, staff);
    const store = new ContractStore(); const path = segments.join('/');
    const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
    const user = staff && segments[0] === 'users' ? uuid(segments[1]) : who.id;
    if (staff) authorized(who, request.method === 'GET' ? 'compliance:read' : path.startsWith('templates/') ? 'compliance:config' : 'compliance:manage');
    let record: Row | null = null;
    if (segments[0] === 'requests' && segments[1]) {
      record = await store.one(uuid(segments[1]));
      if (!record || !staff && record.user_id !== who.id) throw new TradingError('not_found', 404);
    }
    if (request.method === 'GET') {
      if (path === 'status' || staff && /^users\/[^/]+\/status$/.test(path)) {
        const { data: compliance, error } = await store.db.rpc('ct_compliance', { p_user: user });
        const { data: requirements, error: requiredError } = await store.db.from('ct_compliance_requirements').select('id,version');
        const { data: tax, error: taxError } = await store.db.from('cc_tax_choices').select('kind,revision').eq('user_id', user).maybeSingle();
        if (error || requiredError || taxError) throw new TradingError('contracts_store_unavailable', 503);
        return reply({ compliance, requirements, tax_choice: tax });
      }
      if (path === 'requests' || staff && /^users\/[^/]+\/requests$/.test(path)) {
        const after = new URL(request.url).searchParams.get('cursor');
        let query = store.db.from('cc_requests').select('id,kind,requirement,version,provider,provider_id,state,error_code,created_at,checked_at,completed_at').eq('user_id', user).order('id').limit(50);
        if (after) query = query.gt('id', uuid(after));
        const { data, error } = await query;
        if (error) throw new TradingError('contracts_store_unavailable', 503);
        return reply(data);
      }
      if (record && segments.length === 2) return reply(publicRequest(record));
      if (record && segments.length === 3 && segments[2] === 'documents') {
        if (staff) authorized(who, 'compliance:documents');
        if (record.kind === 'kyc' || record.state !== 'approved') throw new TradingError('signed_documents_unavailable', 409);
        const artifacts = Array.isArray(record.artifacts) ? record.artifacts.map(value => { const doc = object(value); return { name: doc.name, url: safeProviderUrl('docuseal', doc.url) }; }) : [];
        return reply({ request_id: record.id, provider_id: record.provider_id, version: record.version, documents: artifacts, storage: 'provider' });
      }
      if (staff && path === 'templates') {
        const { data, error } = await store.db.from('cc_templates').select('*').order('created_at', { ascending: false }).limit(100);
        if (error) throw new TradingError('contracts_store_unavailable', 503);
        return reply(data);
      }
      if (staff && path === 'callbacks') {
        const { data, error } = await store.db.from('cc_callbacks').select('id,provider,request_id,state,attempts,error_code,next_at,created_at').eq('state', 'failed').order('created_at', { ascending: false }).limit(100);
        if (error) throw new TradingError('contracts_store_unavailable', 503);
        return reply(data);
      }
      throw new TradingError('not_found', 404);
    }
    if (request.method !== 'POST') throw new TradingError('method_not_allowed', 405);
    if (!request.headers.get('content-type')?.includes('application/json')) throw new TradingError('json_required', 415);
    let body: Row;
    try { body = object(JSON.parse(Buffer.from(await readBody(request)).toString())); } catch (error) { if (error instanceof TradingError) throw error; throw new TradingError('invalid_json'); }
    if (!staff && path === 'tax-choice') {
      exact(body, ['kind']);
      if (!['w9','w8ben'].includes(String(body.kind))) throw new TradingError('invalid_tax_choice');
      return reply(await store.rpc('choose_tax', { p_user: who.id, p_kind: body.kind }));
    }
    if (!staff && path === 'requests') {
      exact(body, ['kind']);
      if (!kinds.includes(String(body.kind))) throw new TradingError('invalid_kind');
      if (!who.email || !who.emailVerified) throw new TradingError('verified_email_required', 409);
      return reply(publicRequest(await store.rpc('begin', { p_user: who.id, p_email: who.email, p_kind: body.kind, p_key: key(request) })), 202);
    }
    if (record && segments.length === 3 && segments[2] === 'launch' && !staff) {
      exact(body, []);
      if (record.state !== 'pending' || !record.launch_url) throw new TradingError('launch_unavailable', 409);
      return reply({ url: safeProviderUrl(record.provider as Provider, record.launch_url) });
    }
    if (record && segments.length === 3 && segments[2] === 'refresh') {
      exact(body, []);
      await store.rpc('refresh', { p_actor: who.id, p_request: record.id });
      return reply({ queued: true }, 202);
    }
    if (staff && record && segments.length === 3 && segments[2] === 'reconcile') {
      exact(body, ['provider_id', 'reason']);
      await store.rpc('refresh', { p_actor: who.id, p_request: record.id, p_provider_id: providerId(record.provider as Provider, body.provider_id), p_reason: string(body.reason, 'reason', 500) });
      return reply({ queued: true }, 202);
    }
    if (staff && record && segments.length === 3 && ['retry','cancel','not-created'].includes(segments[2])) {
      exact(body, ['reason']);
      await store.rpc('admin_action', { p_actor: who.id, p_request: record.id, p_action: segments[2], p_reason: string(body.reason, 'reason', 500) });
      return reply({ recorded: true });
    }
    if (staff && segments.length === 2 && segments[0] === 'templates') {
      exact(body, ['version','provider_template_id','signer_role','reason']);
      if (!kinds.includes(segments[1])) throw new TradingError('invalid_kind');
      const kyc = segments[1] === 'kyc';
      if (kyc && (body.provider_template_id || body.signer_role)) throw new TradingError('unexpected_kyc_template');
      return reply(await store.rpc('publish', { p_actor: who.id, p_kind: segments[1], p_version: string(body.version, 'version', 100), p_template: kyc ? null : providerId('docuseal', body.provider_template_id), p_role: kyc ? null : string(body.signer_role, 'signer_role', 100), p_reason: string(body.reason, 'reason', 500) }));
    }
    throw new TradingError('not_found', 404);
  } catch (error) {
    return Response.json({ error: error instanceof TradingError ? error.code : 'compliance_unavailable' }, { status: error instanceof TradingError ? error.status : 503, headers });
  }
}
export async function complianceWebhook(request: Request, provider: Provider): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (!request.headers.get('content-type')?.includes('application/json')) throw new TradingError('json_required', 415);
    const bytes = await readBody(request, 1024 * 1024);
    verifyCallback(provider, bytes, request.headers);
    let payload: Row; try { payload = object(JSON.parse(Buffer.from(bytes).toString())); } catch { throw new TradingError('invalid_json'); }
    const hint = callbackHint(provider, payload, bytes);
    if (hint) await new ContractStore(4000).rpc('callback', { p_id: hint.id, p_provider: provider, p_provider_id: hint.providerId, p_request: hint.requestId, p_terminal: hint.terminalExpected });
    return Response.json({ received: true, ignored: !hint }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof TradingError ? error.code : 'webhook_unavailable' }, { status: error instanceof TradingError ? error.status : 503, headers });
  }
}
