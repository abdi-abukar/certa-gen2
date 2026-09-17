import 'server-only';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { object, string, uuid, TradingError, type Row } from '../tradara/contracts';
export type Provider = 'docuseal' | 'veriff';
export type Verified = { state: 'pending' | 'approved' | 'rejected' | 'expired'; at: string; artifacts: { name: string; url: string }[]; signerId?: string; launchUrl?: string };
export class ProviderFailure extends TradingError {
  constructor(code: string, readonly ambiguous = false, readonly retryAfter = 30) { super(code, 502); }
}
export function docusealOrigin(env = process.env) {
  const origin = env.DOCUSEAL_API_ORIGIN || 'https://api.docuseal.com';
  if (!['https://api.docuseal.com', 'https://api.docuseal.eu'].includes(origin)) throw new TradingError('invalid_docuseal_origin', 503);
  return origin;
}
export function veriffOrigin(env = process.env) {
  const origin = env.VERIFF_API_ORIGIN || 'https://stationapi.veriff.com';
  if (!['https://stationapi.veriff.com'].includes(origin)) throw new TradingError('invalid_veriff_origin', 503);
  return origin;
}
export function providerId(provider: Provider, value: unknown): string {
  if (provider === 'veriff') return uuid(value);
  const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : string(value, 'provider_id', 30);
  if (!/^[1-9]\d{0,17}$/.test(id)) throw new TradingError('invalid_provider_id');
  return id;
}
export function safeProviderUrl(provider: Provider, value: unknown): string {
  const url = new URL(string(value, 'provider_url', 4096));
  const allowed = provider === 'docuseal' ? ['docuseal.com', 'docuseal.eu'] : ['veriff.me', 'veriff.com'];
  if (url.protocol !== 'https:' || url.username || url.password || !allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new TradingError('unsafe_provider_url', 502);
  return url.href;
}
const correlation = (id: unknown) => `certa:${uuid(id)}`;
const eventTime = (value: unknown) => {
  const at = new Date(string(value, 'provider_time', 60));
  if (!Number.isFinite(at.getTime())) throw new TradingError('invalid_provider_time', 502);
  return at.toISOString();
};
export function verifyCallback(provider: Provider, bytes: Uint8Array, headers: Headers, env = process.env, now = Date.now()) {
  let expected: Buffer; let supplied: string;
  if (provider === 'docuseal') {
    if (!env.DOCUSEAL_WEBHOOK_SECRET) throw new TradingError('webhook_not_configured', 503);
    const [timestamp, signature] = (headers.get('x-docuseal-signature') || '').split('.');
    if (!/^\d{10}$/.test(timestamp ?? '') || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new TradingError('invalid_webhook_signature', 401);
    supplied = signature ?? '';
    expected = createHmac('sha256', env.DOCUSEAL_WEBHOOK_SECRET).update(`${timestamp}.`).update(bytes).digest();
  } else {
    if (!env.VERIFF_SHARED_SECRET || !env.VERIFF_API_KEY) throw new TradingError('webhook_not_configured', 503);
    if (headers.get('x-auth-client') !== env.VERIFF_API_KEY) throw new TradingError('invalid_webhook_signature', 401);
    supplied = headers.get('x-hmac-signature') ?? '';
    expected = createHmac('sha256', env.VERIFF_SHARED_SECRET).update(bytes).digest();
  }
  if (!/^[a-fA-F0-9]{64}$/.test(supplied) || !timingSafeEqual(expected, Buffer.from(supplied, 'hex'))) throw new TradingError('invalid_webhook_signature', 401);
}
export function callbackHint(provider: Provider, raw: Row, bytes: Uint8Array): { id: string; providerId: string; requestId: string | null; terminalExpected: boolean } | null {
  let id: unknown; let external: unknown; let terminalExpected = false;
  if (provider === 'docuseal') {
    if (!['form.completed', 'form.declined', 'submission.completed', 'submission.expired', 'submission.declined'].includes(String(raw.event_type))) return null;
    const data = object(raw.data); const submission = data.submission ? object(data.submission) : null;
    id = data.submission_id ?? submission?.id ?? (String(raw.event_type).startsWith('submission.') ? data.id : undefined);
    external = data.external_id; terminalExpected = true;
  } else {
    // Only the decision integration is consumed. Watchlist/full-auto integrations need their own policy.
    const verification = raw.verification ? object(raw.verification) : null;
    if (!verification) return null;
    id = verification.id; external = verification.vendorData; terminalExpected = ['approved','declined','expired','abandoned'].includes(String(verification.status));
  }
  let requestId: string | null = null;
  if (typeof external === 'string' && external.startsWith('certa:')) requestId = uuid(external.slice(6));
  return { id: `${provider}:${createHash('sha256').update(bytes).digest('hex')}`, providerId: providerId(provider, id), requestId, terminalExpected };
}

export class ContractProviders {
  writeAccepted = false;
  constructor(private budget: (provider: Provider) => Promise<void>, private env = process.env, private fetcher: typeof fetch = fetch) {}
  async request(provider: Provider, method: 'GET' | 'POST', path: string, body?: Row): Promise<unknown> {
    if (path.includes('..') || path.includes('://') || !path.startsWith(provider === 'docuseal' ? '/submissions' : '/v1/sessions')) throw new TradingError('invalid_provider_path');
    const key = provider === 'docuseal' ? this.env.DOCUSEAL_API_KEY : this.env.VERIFF_API_KEY;
    if (!key || provider === 'veriff' && !this.env.VERIFF_SHARED_SECRET) throw new TradingError('provider_not_configured', 503);
    await this.budget(provider);
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const text = body ? JSON.stringify(body) : undefined;
    if (provider === 'docuseal') headers['X-Auth-Token'] = key;
    else {
      headers['X-AUTH-CLIENT'] = key;
      headers['X-HMAC-SIGNATURE'] = createHmac('sha256', this.env.VERIFF_SHARED_SECRET!).update(method === 'POST' ? text! : path.split('/')[3]).digest('hex');
    }
    let response: Response;
    try { response = await this.fetcher((provider === 'docuseal' ? docusealOrigin(this.env) : veriffOrigin(this.env)) + path, { method, headers, body: text, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) }); }
    catch { throw new ProviderFailure('provider_transport_failure', method === 'POST'); }
    if (!response.ok) { await response.body?.cancel(); throw new ProviderFailure(`provider_http_${response.status}`, method === 'POST' && response.status >= 500, Math.min(3600, Math.max(30, Number(response.headers.get('retry-after')) || 30))); }
    if (method === 'POST') this.writeAccepted = true;
    try {
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error();
      const reader = response.body?.getReader(); if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2_000_000) { await reader.cancel(); throw new Error(); } chunks.push(part.value); } } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw new ProviderFailure('provider_invalid_response', method === 'POST'); }
  }
  async create(request: Row): Promise<{ providerId: string; signerId: string | null; launchUrl: string }> {
    if (request.provider === 'veriff') {
      const body = object(await this.request('veriff', 'POST', '/v1/sessions', { verification: { vendorData: correlation(request.id), endUserId: request.user_id } }));
      const session = object(body.verification);
      return { providerId: providerId('veriff', session.id), signerId: null, launchUrl: safeProviderUrl('veriff', session.url) };
    }
    const id = providerId('docuseal', request.provider_template_id);
    if (!Number.isSafeInteger(Number(id))) throw new TradingError('invalid_template_id');
    const body = await this.request('docuseal', 'POST', '/submissions', { template_id: Number(id), send_email: false, send_sms: false, submitters: [{ email: request.email, role: request.signer_role, external_id: correlation(request.id), send_email: false, send_sms: false }] });
    if (!Array.isArray(body)) throw new ProviderFailure('provider_invalid_response', true);
    const signer = body.map(object).find(row => row.external_id === correlation(request.id) && String(row.email).toLowerCase() === request.email);
    if (!signer) throw new ProviderFailure('provider_owner_mismatch', true);
    return { providerId: providerId('docuseal', signer.submission_id), signerId: providerId('docuseal', signer.id), launchUrl: safeProviderUrl('docuseal', signer.embed_src) };
  }
  async verify(request: Row, id: string): Promise<Verified> {
    const provider = request.provider as Provider;
    providerId(provider, id);
    if (provider === 'veriff') {
      const body = object(await this.request(provider, 'GET', `/v1/sessions/${id}/decision`));
      if (!body.verification) {
        if (request.provider_id !== id) throw new TradingError('provider_owner_unverified', 409);
        return { state: 'pending', at: new Date().toISOString(), artifacts: [] };
      }
      const decision = object(body.verification);
      if (decision.id !== id || decision.vendorData !== correlation(request.id) || decision.endUserId && decision.endUserId !== request.user_id) throw new TradingError('provider_owner_mismatch', 409);
      const status = String(decision.status);
      const state = status === 'approved' ? 'approved' : status === 'declined' ? 'rejected' : ['expired', 'abandoned'].includes(status) ? 'expired' : 'pending';
      return { state, at: state === 'pending' ? new Date().toISOString() : eventTime(decision.decisionTime), artifacts: [] };
    }
    const body = object(await this.request(provider, 'GET', `/submissions/${id}`));
    if (String(body.id) !== id || String(object(body.template).id) !== request.provider_template_id) throw new TradingError('provider_template_mismatch', 409);
    const signers = Array.isArray(body.submitters) ? body.submitters.map(object) : [];
    const signer = signers.find(row => row.external_id === correlation(request.id) && String(row.email).toLowerCase() === request.email && row.role === request.signer_role);
    if (!signer) throw new TradingError('provider_owner_mismatch', 409);
    const state = body.status === 'completed' && signers.length > 0 && signers.every(row => row.status === 'completed') ? 'approved' : body.status === 'declined' ? 'rejected' : body.status === 'expired' ? 'expired' : 'pending';
    const documents: { name: string; url: string }[] = [];
    if (state === 'approved') {
      if (Array.isArray(body.documents)) for (const value of body.documents.slice(0, 20)) { const doc = object(value); documents.push({ name: string(doc.name ?? 'Signed document', 'document_name'), url: safeProviderUrl(provider, doc.url) }); }
      if (body.audit_log_url) documents.push({ name: 'Signature audit trail', url: safeProviderUrl(provider, body.audit_log_url) });
    }
    return { state, at: state === 'pending' ? new Date().toISOString() : eventTime(state === 'approved' ? body.completed_at : state === 'rejected' ? signer.declined_at ?? body.updated_at : body.expire_at ?? body.updated_at), artifacts: documents, signerId: providerId(provider, signer.id), ...(signer.embed_src || signer.slug ? { launchUrl: safeProviderUrl(provider, signer.embed_src ?? `${docusealOrigin(this.env).replace('api.', '')}/s/${encodeURIComponent(String(signer.slug))}`) } : {}) };
  }
}
