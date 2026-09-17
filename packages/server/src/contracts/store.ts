import 'server-only';
import { tradingStore } from '../tradara/store';
import { TradingError, type Row } from '../tradara/contracts';
export class ContractStore {
  readonly db;
  constructor(timeout = 10000) { this.db = tradingStore(process.env, timeout).db; }
  async rpc(name: string, args: Row = {}): Promise<any> {
    const { data, error } = await this.db.rpc(`cc_${name}`, args);
    if (error) {
      const code = ['conflict','not_found','cooldown','request_busy','template_not_configured','tax_choice_required','already_approved','provider_id_required','immutable_template_version'].find(code => error.message.includes(code));
      throw new TradingError(code ?? 'contracts_store_unavailable', code ? 409 : 503);
    }
    return data;
  }
  async one(id: string): Promise<Row | null> {
    const { data, error } = await this.db.from('cc_requests').select('*').eq('id', id).maybeSingle();
    if (error) throw new TradingError('contracts_store_unavailable', 503);
    return data;
  }
}
export const publicRequest = (row: Row) => Object.fromEntries(['id','kind','requirement','version','provider','provider_id','state','error_code','created_at','checked_at','completed_at'].map(key => [key, row[key] ?? null]));
