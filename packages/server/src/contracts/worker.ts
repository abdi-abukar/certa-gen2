import 'server-only';
import { randomUUID } from 'node:crypto';
import { ContractStore } from './store';
import { ContractProviders, ProviderFailure, type Provider } from './providers';
import { TradingError, object, type Row } from '../tradara/contracts';
export class ContractsWorker {
  readonly owner = randomUUID();
  readonly store = new ContractStore();
  readonly providers = new ContractProviders(async provider => {
    if (!await this.store.rpc('budget', { p_id: `api:${provider}`, p_limit: 2, p_seconds: 1 })) throw new TradingError('provider_budget_exhausted', 429);
  });
  async lease() {
    const { data, error } = await this.store.db.rpc('ct_lease', { p_id: 'contracts-worker', p_owner: this.owner });
    if (error) throw new TradingError('contracts_lease_unavailable', 503);
    return data;
  }
  async update(table: string, id: string, values: Row) {
    const { error } = await this.store.db.from(`cc_${table}`).update(values).eq('id', id);
    if (error) throw new TradingError('contracts_store_unavailable', 503);
  }
  async tick() {
    const job = await this.store.rpc('claim', { p_owner: this.owner });
    if (!job) return;
    if (job.type === 'create') {
      const request = object(job.request);
      this.providers.writeAccepted = false;
      try {
        // Recheck template activation/version after the queue delay, without creating stale forms.
        const { data: template, error } = await this.store.db.from('cc_templates').select('enabled,version,requirement').eq('id', request.template_id).single();
        const { data: required, error: requiredError } = await this.store.db.from('ct_compliance_requirements').select('version').eq('id', request.requirement).single();
        if (error || requiredError || !template?.enabled || template.version !== required?.version) throw new TradingError('template_not_configured', 409);
        const result = await this.providers.create(request);
        await this.store.rpc('bind', { p_request: request.id, p_provider_id: result.providerId, p_signer: result.signerId, p_url: result.launchUrl });
      } catch (error) {
        const ambiguous = this.providers.writeAccepted || error instanceof ProviderFailure && error.ambiguous;
        const { error: persistenceError } = await this.store.db.from('cc_requests').update({ state: ambiguous ? 'unknown' : 'failed', error_code: error instanceof TradingError ? error.code : 'provider_failed' }).eq('id', request.id).eq('state', 'creating');
        if (persistenceError) throw new TradingError('contracts_store_unavailable',503);
      }
      return;
    }
    const callback = object(job.callback);
    try {
      let request = callback.request_id ? await this.store.one(String(callback.request_id)) : null;
      if (!request) {
        const { data, error } = await this.store.db.from('cc_requests').select('*').eq('provider', callback.provider).eq('provider_id', callback.provider_id).maybeSingle();
        if (error) throw new TradingError('contracts_store_unavailable', 503);
        request = data;
      }
      if (!request) throw new TradingError('request_not_mapped', 409);
      if (request.provider !== callback.provider || request.provider_id && request.provider_id !== callback.provider_id) throw new TradingError('provider_owner_mismatch', 409);
      const result = await this.providers.verify(request, String(callback.provider_id));
      // The verified provider correlation is required before recovering an unbound request.
      if (!request.provider_id) await this.store.rpc('bind', { p_request: request.id, p_provider_id: callback.provider_id, p_signer: result.signerId ?? null, p_url: result.launchUrl ?? null });
      await this.store.rpc('apply', { p_request: request.id, p_provider_id: callback.provider_id, p_state: result.state, p_at: result.at, p_artifacts: result.artifacts });
      if (callback.terminal_expected && result.state === 'pending') throw new TradingError('provider_result_pending',409);
      await this.update('callbacks', String(callback.id), { state: 'done', error_code: null });
    } catch (error) {
      const code = error instanceof TradingError ? error.code : 'verification_failed';
      const permanent = ['provider_owner_mismatch','provider_template_mismatch','unsafe_provider_url','invalid_provider_time'].includes(code);
      const delay = Math.max(error instanceof ProviderFailure ? error.retryAfter : 30, 30 * 2 ** Number(callback.attempts));
      await this.update('callbacks', String(callback.id), { state: !permanent && Number(callback.attempts) < 5 ? 'queued' : 'failed', next_at: new Date(Date.now() + delay * 1000).toISOString(), error_code: code });
    }
  }
}
