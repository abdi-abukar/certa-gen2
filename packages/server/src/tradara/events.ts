import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { object, pick, string, TradingError, type Row } from './contracts';
export const eventTypes = [
  'users.created','users.updated','relationships.created','relationships.updated','relationships.revoked','relationships.status_changed',
  'accounts.created','accounts.updated','accounts.closed','accounts.locked','accounts.unlocked','accounts.phase_advanced','accounts.passed','accounts.status_changed','accounts.config_updated','accounts.personal_risk_lock_armed',
  'orders.state','orders.ack','orders.cancelled','fills.persisted','fills.fee_computed','fills.voided',
  'positions.created','positions.updated','positions.closed','trades.opened','trades.closed','trades.rebuilt',
  'balances.updated','stats.updated','risk.breach','risk.account_locked',
  'ip_logs.created','ip_logs.flagged','devices.seen','devices.flagged','fingerprints.seen','fingerprints.flagged','hedge.incidents.flagged','hedge.incidents.resolved','hedge.cluster.updated','webhook.test',
] as const;
export type NormalEvent = { id: string; type: string; firm: string; user: string | null; account: string | null; at: string; data: Row; seq: string | null; channel: string };
const allowedData = [
  'id','account_id','user_id','owner_id','relationship_id','relationship_type','status','stage','account_type','account_name','name',
  'status_change_reason','lockout_reason','lockout_active','hard_breach','predecessor_account_id','successor_account_id','plan_reference','is_shadow',
  'balance','equity','total_cash_adjustments','cash','available_margin','used_margin','margin_used','initial_balance','starting_balance','realized_pnl','unrealized_pnl','net_pnl',
  'risk_profile','max_loss_limit','daily_loss_limit','max_drawdown_value','max_drawdown_mode','max_drawdown_limit','max_drawdown_lock_ceiling','max_loss_limit_trigger','risk_profile_id','passing_criteria','total_trades','open_trades','winning_trades','losing_trades','total_net_pnl','win_rate','profit_factor',
  'trade_id','order_id','execution_id','instrument_id','quantity','net_quantity','side','price','entry_price','exit_price','fees','commissions','session_date','trades_closed','gross_pnl','closing_balance','created_at','updated_at','closed_at','opened_at',
];
export function parseEvent(raw: Row, channel: string, expectedFirm: string): NormalEvent {
  const originalType = string(raw.type, 'event_type', 100);
  const type = originalType === 'account.updated' ? 'accounts.updated' : originalType;
  const firm = string(raw.firm_id, 'firm', 100);
  if (firm !== expectedFirm) throw new TradingError('wrong_firm', 403);
  const outer = object(raw.data ?? {});
  const family = type.split('.')[0];
  const nested = outer[({accounts:'account',stats:'stats',balances:'balance',trades:'trade',orders:'order',positions:'position',fills:'fill',relationships:'relationship',users:'user'} as Record<string,string>)[family]];
  const data = nested && typeof nested === 'object' && !Array.isArray(nested) ? {...outer,...object(nested)} : outer;
  const account = raw.account_id ?? data.account_id ?? (type.startsWith('accounts.') ? data.id : null);
  const user = raw.user_id ?? data.user_id ?? data.owner_id ?? (type.startsWith('users.') ? data.id : null);
  const rawAt = raw.ts ?? raw.created_at;
  const at = typeof rawAt === 'number' ? new Date(rawAt) : new Date(String(rawAt));
  if (!Number.isFinite(at.getTime())) throw new TradingError('invalid_event_time');
  let seq: string | null = null;
  if (raw.seq !== undefined) {
    if (typeof raw.seq !== 'number' || !Number.isSafeInteger(raw.seq) || raw.seq < 0) throw new TradingError('unsafe_event_sequence');
    seq = String(raw.seq);
  }
  if (channel.startsWith('ws:') && !seq) throw new TradingError('missing_event_sequence');
  const id = channel.startsWith('ws:') ? `ws:${firm}:${seq}` : string(raw.event_id, 'event_id', 180);
  return { id, type, firm, account: account ? string(account,'account',100) : null, user: user ? string(user,'user',100) : null, at: at.toISOString(), data: pick(data, allowedData), seq, channel };
}
export function verifyWebhook(bytes: Uint8Array, header: string | null, secret: string, now = Date.now()) {
  if (!secret || !header) throw new TradingError('invalid_webhook_signature', 401);
  const fields = Object.fromEntries(header.split(',').map(part => part.trim().split('=',2)));
  if (!/^\d{10}$/.test(fields.t ?? '') || !/^[a-fA-F0-9]{64}$/.test(fields.v1 ?? '') || Math.abs(now/1000 - Number(fields.t)) > 300) throw new TradingError('invalid_webhook_signature',401);
  const expected = createHmac('sha256',secret).update(`${fields.t}.`).update(bytes).digest();
  if (!timingSafeEqual(expected,Buffer.from(fields.v1,'hex'))) throw new TradingError('invalid_webhook_signature',401);
}
// Shared projection policy: only authenticated vendor events change account truth.
export function lifecycle(event: NormalEvent): string | null {
  const reason = String(event.data.status_change_reason ?? event.data.lockout_reason ?? '').toLowerCase();
  if (event.type === 'accounts.passed' || reason === 'evaluation_passed') return 'passed';
  if (event.type === 'accounts.phase_advanced' && event.data.successor_account_id || reason === 'evaluation_upgraded') return 'upgraded';
  if (event.type === 'accounts.closed') return 'closed';
  if (event.data.hard_breach === true) return 'failed';
  if (event.type === 'accounts.locked' || event.type === 'risk.account_locked') return 'locked';
  if (event.type === 'accounts.unlocked') return 'active';
  return typeof event.data.status === 'string' ? event.data.status.toLowerCase() : null;
}
export function project(event: NormalEvent): Row {
  const known = (eventTypes as readonly string[]).includes(event.type);
  const family = event.type.split('.')[0];
  return { ...event, known, family, lifecycle: lifecycle(event),
    // Footprint collection is not needed for Certa account operations.
    ignored: !known || ['ip_logs','devices','fingerprints','hedge'].includes(family) || event.type === 'webhook.test',
  };
}
