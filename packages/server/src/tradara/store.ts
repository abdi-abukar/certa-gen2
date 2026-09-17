import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TradingError, type Row } from './contracts';
export function tradingStore(env = process.env, timeoutMs = 10000): TradingStore {
  if (!env.CERTA_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new TradingError('trading_store_not_configured',503);
  const client = createClient(env.CERTA_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession:false,autoRefreshToken:false,detectSessionInUrl:false }, global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',signal:AbortSignal.timeout(timeoutMs)})} });
  return new TradingStore(client);
}
export class TradingStore {
  constructor(readonly db: SupabaseClient) {}
  async rpc(name: string, args: Row = {}): Promise<any> {
    const { data, error } = await this.db.rpc(`ct_${name}`,args);
    if (error) {
      const known = ['conflict','not_entitled','not_found','cooldown','account_busy','compliance_required','slots_full','kyc_required','plan_unavailable','closure_required','invitation_required','unsupported_account_edit'];
      const code = known.find(code => error.message.includes(code));
      throw new TradingError(code ?? 'trading_store_unavailable', code ? 409 : 503);
    }
    return data;
  }
  async one(table: string, field: string, value: string): Promise<Row | null> {
    const { data,error } = await this.db.from(`ct_${table}`).select('*').eq(field,value).maybeSingle();
    if (error) throw new TradingError('trading_store_unavailable',503); return data;
  }
  async list(table: string, filters: Record<string,string> = {}, after?: string, limit = 50): Promise<Row[]> {
    let query = this.db.from(`ct_${table}`).select('*').order('id').limit(limit);
    for (const [key,value] of Object.entries(filters)) query=query.eq(key,value);
    if(after) query=query.gt('id',after);
    const {data,error}=await query; if(error) throw new TradingError('trading_store_unavailable',503); return data ?? [];
  }
  async budget(kind: string) {
    if (!await this.rpc('budget',{p_kind:kind})) throw new TradingError('vendor_budget_exhausted',429);
  }
}
