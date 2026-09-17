import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { TradingError, object, pick, string, type Row } from '../tradara/contracts';
export function cents(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > 1_000_000_000) throw new TradingError('invalid_amount_cents');
  return value;
}
export function money(value: unknown): bigint {
  const raw = String(value);
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(raw)) throw new TradingError('invalid_cash_precision', 409);
  const negative = raw.startsWith('-'); const [whole, fraction = ''] = raw.replace('-', '').split('.');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
}
export const dollars = (amount: number | bigint) => `${BigInt(amount) / 100n}.${String(BigInt(amount) % 100n).padStart(2, '0')}`;
function destinationKey() {
  const raw = process.env.PAYOUT_DESTINATION_KEY ?? '';
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new TradingError('payout_destinations_not_configured', 503);
  return Buffer.from(raw, 'hex');
}
export const destinationFingerprint = (value: string) => createHmac('sha256', destinationKey()).update(value).digest('hex');
export function encryptDestination(value: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', destinationKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decryptDestination(value: string): string {
  const bytes = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', destinationKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
export function contentUrl(value: unknown): string {
  let url: URL;
  try { url = new URL(string(value, 'url', 1000)); } catch { throw new TradingError('invalid_content_url'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new TradingError('invalid_content_url');
  url.hash = ''; return url.toString();
}
export function payoutPublic(row: Row): Row {
  const method = object(row.method_snapshot);
  return Object.fromEntries(Object.entries({
    id: row.id, kind: row.kind, account_id: row.account_id, session_id: row.session_id,
    state: row.state, amount_cents: row.amount_cents, currency: row.currency,
    method: { kind: method.kind, label: method.label, masked: method.masked },
    requested_at: row.requested_at, approved_at: row.approved_at, paid_at: row.paid_at,
    reason: row.state === 'rejected' ? row.reason : null,
    transfer_reference: row.transfer_reference,
  }));
}
export function validateAdjustment(raw: unknown, payout: Row, vendorId: string): Row {
  const row = object(raw);
  if (typeof row.id !== 'string' || row.account_id !== vendorId || row.direction !== 'withdrawal' || row.is_payout_withdrawal !== true || row.reason_code !== 'PAYOUT' || row.note !== `Certa payout ${payout.id}` || money(row.amount) !== BigInt(String(payout.amount_cents)) || money(row.delta) !== -BigInt(String(payout.amount_cents)) || money(row.balance_before) + money(row.delta) !== money(row.balance_after)) throw new TradingError('adjustment_not_verified', 409);
  return pick(row, ['id','account_id','direction','amount','delta','balance_before','balance_after','reason_code','note','is_payout_withdrawal','created_at']);
}
