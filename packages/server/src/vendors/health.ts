import 'server-only';
import { docusealOrigin } from '../contracts/providers';
import { findVendor, type VendorId } from './registry';
export { vendors, findVendor } from './registry';
export type Health = {
  vendor: VendorId; status: 'healthy' | 'degraded' | 'unavailable' | 'not_configured';
  checkedAt: string; latencyMs: number; detail: string;
};
// Only sanitized service results are shared. Never cache sessions, bodies or users.
export function createHealthChecker(fetcher: typeof fetch = fetch, env = process.env, now = Date.now) {
  const cache = new Map<VendorId, { expires: number; result: Promise<Health> }>();
  async function probe(id: VendorId): Promise<Health> {
    const start = now();
    const result = (status: Health['status'], detail: string): Health => ({ vendor: id, status, detail, checkedAt: new Date(now()).toISOString(), latencyMs: Math.max(0, now() - start) });
    let url: string; let headers: Record<string, string>;
    if (id === 'supabase') {
      if (!env.CERTA_SUPABASE_URL || !env.CERTA_SUPABASE_PUBLISHABLE_KEY) return result('not_configured', 'Project configuration is missing.');
      url = new URL('/auth/v1/settings', env.CERTA_SUPABASE_URL).href;
      headers = { apikey: env.CERTA_SUPABASE_PUBLISHABLE_KEY };
    } else if (id === 'resend') {
      if (!env.RESEND_HEALTH_API_KEY) return result('not_configured', 'Set the admin health key with domains read permission. Delivery stays inactive.');
      url = 'https://api.resend.com/domains';
      headers = { Authorization: `Bearer ${env.RESEND_HEALTH_API_KEY}` };
    } else if (id === 'docuseal') {
      if (!env.DOCUSEAL_HEALTH_API_KEY) return result('not_configured', 'Set the admin-only template read key.');
      try { url = `${docusealOrigin(env)}/templates?limit=1`; } catch { return result('not_configured', 'Invalid DocuSeal API environment.'); }
      headers = { 'X-Auth-Token': env.DOCUSEAL_HEALTH_API_KEY };
    } else if (id === 'anthropic') {
      if(env.ANTHROPIC_HEALTH_ENABLED!=='true') return result('not_configured','Enable the public Anthropic status probe.');
      url='https://status.anthropic.com/api/v2/status.json';headers={};
    } else if (id === 'discord') {
      if(env.DISCORD_HEALTH_ENABLED!=='true') return result('not_configured','Enable the public Discord status probe.');
      url='https://discordstatus.com/api/v2/status.json';headers={};
    } else if (id === 'veriff') {
      if (env.VERIFF_HEALTH_ENABLED !== 'true') return result('not_configured', 'Enable the public service-status probe in the admin environment.');
      url = 'https://status.veriff.com/api/v2/status.json';
      headers = {};
    } else {
      if (!env.TRADARA_HEALTH_API_KEY) return result('not_configured', 'Set the admin read key and confirmed API environment. Backend activation is pending.');
      const origin = env.TRADARA_API_BASE_URL || 'https://api.tradara.com';
      if (!['https://api.tradara.com', 'https://api.sandbox.tradara.com'].includes(origin)) return result('not_configured', 'Invalid Tradara API environment.');
      url = `${origin}/v1/firm-control/firm`;
      headers = { 'X-Tradara-Api-Key': env.TRADARA_HEALTH_API_KEY };
    }
    try {
      const response = await fetcher(url, { method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(4000) });
      if ((id === 'veriff' || id === 'discord' || id === 'anthropic') && response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const body = await response.json();
        return body?.status?.indicator === 'none' ? result('healthy', 'Provider reports operational. Integration credentials are not tested.') : result('degraded', 'Provider reports an incident or an unexpected status.');
      }
      // Never retain account/domain data or vendor error bodies.
      await response.body?.cancel();
      if (response.ok && !response.headers.get('content-type')?.includes('application/json')) return result('degraded', 'Probe returned an unexpected response format.');
      if (response.ok) return result('healthy', 'Read probe succeeded. See the documented scope.');
      if (response.status === 401 || response.status === 403) return result('degraded', 'Vendor rejected credentials or permissions.');
      if (response.status === 429) return result('degraded', 'Vendor rate limit reached. No immediate retry.');
      return result('unavailable', `Read probe returned HTTP ${response.status}.`);
    } catch { return result('unavailable', 'Probe failed or exceeded the four-second budget.'); }
  }
  return function check(id: VendorId): Promise<Health> {
    const previous = cache.get(id);
    if (previous && previous.expires > now()) return previous.result;
    const pending = probe(id);
    cache.set(id, { expires: now() + (findVendor(id)?.intervalSeconds ?? 60) * 1000, result: pending });
    return pending;
  };
}
export const checkVendorHealth = createHealthChecker();
