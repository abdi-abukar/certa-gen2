import 'server-only';
import { TradingError, object, type Row } from './contracts';
export type VendorConfig = { origin: string; key: string; firmId: string };
export function vendorConfig(env = process.env): VendorConfig {
  const origin = env.TRADARA_API_BASE_URL || 'https://api.tradara.com';
  if (!['https://api.tradara.com','https://api.sandbox.tradara.com'].includes(origin)) throw new TradingError('invalid_tradara_origin', 503);
  if (!env.TRADARA_FIRM_API_KEY || !env.TRADARA_FIRM_ID) throw new TradingError('tradara_not_configured', 503);
  return { origin, key: env.TRADARA_FIRM_API_KEY, firmId: env.TRADARA_FIRM_ID };
}
export class VendorFailure extends TradingError {
  constructor(code: string, public ambiguous: boolean, public retryAfter = 0) { super(code, 502); }
}
export type Budget = (kind: string) => Promise<void>;
export class TradaraClient {
  writeAccepted = false;
  constructor(private config: VendorConfig, private budget: Budget, private fetcher: typeof fetch = fetch, private pause: (kind: string, seconds: number) => Promise<void> = async () => {}) {}
  async request(method: 'GET'|'POST'|'PATCH'|'DELETE', path: string, body?: Row): Promise<Row> {
    if (!path.startsWith('/v1/') || path.includes('://') || path.includes('..')) throw new TradingError('invalid_vendor_path');
    const kind = path.startsWith('/v1/admin/query/') ? 'admin' : method !== 'GET' ? 'write' : path.startsWith('/v1/firm-control/') ? 'firm' : 'read';
    await this.budget(kind);
    let response: Response;
    try {
      response = await this.fetcher(this.config.origin + path, { method, headers: { 'X-Tradara-Api-Key': this.config.key, 'Content-Type':'application/json', Accept:'application/json' }, body: body ? JSON.stringify(body) : undefined, cache:'no-store', redirect:'error', signal: AbortSignal.timeout(method === 'GET' ? 8000 : 15000) });
    } catch { throw new VendorFailure('vendor_transport_failure', method !== 'GET'); }
    const retry = Math.min(3600, Math.max(1, Number(response.headers.get('retry-after')) || 30));
    if (!response.ok) { await response.body?.cancel(); if(response.status===429)await this.pause(kind,retry); throw new VendorFailure(`vendor_http_${response.status}`, method !== 'GET' && response.status >= 500, response.status === 429 ? retry : 0); }
    if (method !== 'GET') this.writeAccepted = true;
    if (response.status === 204) return {};
    if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new VendorFailure('vendor_invalid_response', method !== 'GET'); }
    try {
      const reader = response.body?.getReader(); if (!reader) throw new Error();
      let size = 0; const chunks: Uint8Array[] = [];
      try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2_000_000) { await reader.cancel(); throw new Error(); } chunks.push(part.value); } } finally { reader.releaseLock(); }
      return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch { throw new VendorFailure('vendor_invalid_response', method !== 'GET'); }
  }
  async page(path: string): Promise<{ items: Row[]; next: string | null }> {
    const data = await this.request('GET', path); const items = data.items ?? data.data;
    if (!Array.isArray(items) || items.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new VendorFailure('vendor_invalid_list', false);
    const next = data.next_cursor;
    if (next !== undefined && next !== null && typeof next !== 'string') throw new VendorFailure('vendor_invalid_cursor', false);
    return { items: items as Row[], next: next ? String(next) : null };
  }
}
