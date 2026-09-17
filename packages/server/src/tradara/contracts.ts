export class TradingError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export type Row = Record<string, unknown>;
export function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TradingError('invalid_object');
  return value as Row;
}
export function string(value: unknown, name: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TradingError(`invalid_${name}`);
  return value.trim();
}
export function uuid(value: unknown): string {
  const id = string(value, 'id', 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new TradingError('invalid_id');
  return id;
}
export function decimal(value: unknown, positive = false): string {
  if (typeof value !== 'string' || !/^-?\d{1,15}(\.\d{1,8})?$/.test(value)) throw new TradingError('invalid_decimal_string');
  if (positive && (value.startsWith('-') || !/[1-9]/.test(value))) throw new TradingError('amount_must_be_positive');
  return value;
}
// The cash-adjustment endpoint documents a JSON number. Preserve the ledger string
// and refuse any value whose JSON numeric representation would change its amount.
export function vendorCashAmount(value: unknown): number {
  const raw=decimal(value,true);
  const scaled=(text:string)=>{if(!/^\d+(\.\d{1,8})?$/.test(text))throw new TradingError('vendor_amount_precision_unsupported');const [whole,fraction='']=text.split('.');return BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));};
  const number=Number(raw);
  if(scaled(JSON.stringify(number))!==scaled(raw))throw new TradingError('vendor_amount_precision_unsupported');
  return number;
}
export function date(value: unknown): string {
  const raw = string(value, 'date', 40);
  if (!Number.isFinite(Date.parse(raw))) throw new TradingError('invalid_date');
  return new Date(raw).toISOString();
}
export function pick(input: Row, allowed: string[]): Row {
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key)));
}
export function exact(input: Row, fields: string[]) {
  if (Object.keys(input).some(key => !fields.includes(key))) throw new TradingError('unexpected_field');
}
export const actions = ['access-check','invite','suspend','restore','lock','unlock','cancel-orders','flatten','cash-adjustment','max-loss-limit','provision','refresh','halt','halt-release','correction-preview','correction','catalog-refresh','usage-refresh'] as const;
export type Action = typeof actions[number];
export const permissions: Record<Action, string> = {
  'access-check':'trading:read', invite:'trading:access', suspend:'trading:access', restore:'trading:access',
  lock:'trading:control', unlock:'trading:control', 'cancel-orders':'trading:control', flatten:'trading:control',
  'cash-adjustment':'trading:finance', 'max-loss-limit':'trading:finance',
  provision:'trading:provision', refresh:'trading:read', halt:'trading:emergency', 'halt-release':'trading:emergency',
  'correction-preview':'trading:finance', correction:'trading:finance', 'catalog-refresh':'trading:config', 'usage-refresh':'trading:read',
};
export function validateAction(action: Action, body: unknown): Row {
  const data = object(body);
  const base = ['reason'];
  const fields: Partial<Record<Action, string[]>> = {
    lock:['expires_at'], 'cash-adjustment':['direction','amount'], 'max-loss-limit':['max_drawdown_limit'],
    provision:['entitlement_id'], refresh:['resource','from','to','cursor'], halt:['liquidate_sim_accounts'],
    'correction-preview':['start_at','end_at'], correction:['start_at','end_at'], 'usage-refresh':['month'],
  };
  exact(data, [...base, ...(fields[action] ?? [])]);
  const result: Row = {};
  if (!['access-check','invite','refresh','catalog-refresh','usage-refresh','provision'].includes(action)) result.reason = string(data.reason, 'reason', 500);
  else if (data.reason !== undefined) result.reason = string(data.reason, 'reason', 500);
  if (action === 'lock') {
    result.expires_at = date(data.expires_at);
    if (Date.parse(result.expires_at as string) <= Date.now()) throw new TradingError('lock_expiry_in_past');
  }
  if (action === 'cash-adjustment') {
    if (!['deposit','withdrawal'].includes(String(data.direction))) throw new TradingError('invalid_direction');
    result.direction = data.direction; result.amount = decimal(data.amount, true);
  }
  if (action === 'max-loss-limit') result.max_drawdown_limit = decimal(data.max_drawdown_limit);
  if (action === 'provision') result.entitlement_id = uuid(data.entitlement_id);
  if (action === 'halt') {
    if (typeof data.liquidate_sim_accounts !== 'boolean') throw new TradingError('invalid_liquidation_choice');
    result.liquidate_sim_accounts = data.liquidate_sim_accounts;
  }
  if (action.startsWith('correction')) {
    result.start_at = date(data.start_at); result.end_at = date(data.end_at);
    const duration = Date.parse(result.end_at as string) - Date.parse(result.start_at as string);
    if (duration <= 0 || duration > 7 * 86400000) throw new TradingError('invalid_window');
  }
  if (action === 'refresh') {
    if (!['summary','trades','daily-stats','exposure','cash-adjustments','entitlements','accounts'].includes(String(data.resource))) throw new TradingError('invalid_resource');
    result.resource = data.resource;
    for (const key of ['from','to']) if (data[key]) result[key] = date(data[key]);
    if (data.cursor) result.cursor = string(data.cursor, 'cursor', 2048);
  }
  if (action === 'usage-refresh') {
    if (typeof data.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month)) throw new TradingError('invalid_month');
    result.month = data.month;
  }
  return result;
}
export async function readBody(request: Request, limit = 16384): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > limit) throw new TradingError('body_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > limit) { await reader.cancel(); throw new TradingError('body_too_large', 413); } parts.push(value);
  } } finally { reader.releaseLock(); }
  const output = new Uint8Array(size); let at = 0;
  for (const part of parts) { output.set(part, at); at += part.length; } return output;
}
