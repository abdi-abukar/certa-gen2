import 'server-only';
import { tradingStore, type TradingStore } from '../tradara/store';
import { TradingError, type Row } from '../tradara/contracts';
export class PayoutStore {
  readonly db;
  constructor(readonly trading: TradingStore = tradingStore()) { this.db = trading.db; }
  async rpc(name: string, args: Row = {}): Promise<any> {
    const { data, error } = await this.db.rpc(`cp_${name}`, args);
    if (error) {
      const known = ['not_found','conflict','funded_active_required','fresh_evidence_required','settled_balance_required','not_eligible','method_required','compliance_required','account_busy','cooldown','cap_required','affiliate_suspended','contracts_confirmation_required','reconciliation_required','invalid_affiliate'];
      const code = known.find(value => error.message.includes(value));
      throw new TradingError(code ?? (error.code === '23505' ? 'conflict' : 'payout_store_unavailable'), code || error.code === '23505' ? 409 : 503);
    }
    return data;
  }
  async one(table: string, id: string): Promise<Row | null> {
    const { data, error } = await this.db.from(`cp_${table}`).select('*').eq('id', id).maybeSingle();
    if (error) throw new TradingError('payout_store_unavailable', 503); return data;
  }
}
