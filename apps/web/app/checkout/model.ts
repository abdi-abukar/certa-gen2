export type Processor = { id: 'nmi' | 'authnet' | 'crypto'; enabled: boolean; configured: boolean; routing_version: number; scriptUrl?: string; tokenizationKey?: string; apiLoginId?: string; clientKey?: string };
export type Product = { id: string; label: string; price_cents: number; enabled: boolean };
export type Creator = { code: string; discount_bps: number; available: boolean };
export type Quote = { product_id: string; product_label: string; quantity: number; subtotal_cents: number; total_cents: number; discount_kind: 'creator' | 'ticket' | 'coupon' | null; ticket_id: string | null; affiliate_code: string | null; coupon_code: string | null; currency: string };
export type Evidence = { address?: string; city?: string; postal_code?: string; name: string; country: string; state: string; accepted: boolean; terms_version: string };
export type Attempt = { id: string; processor: Processor['id']; state: 'prepared' | 'submitted' | 'unknown' | 'declined' | 'paid' | 'superseded'; invoice: string; payment_url: string | null };
export type Purchase = { requires_acceptance?: boolean; checkout: { id: string; state: 'open' | 'pending' | 'paid' | 'cancelled'; slot_order: string | null }; revision: Quote & { id: string; evidence: Evidence }; attempts: Attempt[]; issuance: { slot_id: string; account_id: string | null; state: string }[] };
export type Catalog = { products: Product[]; processors: Processor[]; terms: { version: string; url: string } | null };
export type Context = { evaluation_count: number; profile: { first_name: string; last_name: string; country: string } | null; creator: Creator | null; allocation: { available: number; occupied: number; limit: number; compliance: { kyc: boolean }; slots: { id: string }[] } };
export type Ticket = { id: string; title: string; revealed_at: string | null; used_at?: string | null; prize?: { kind: string; value: number; label?: string } };
export type Token = { paymentToken?: string; dataDescriptor?: string; dataValue?: string };
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export function pendingPurchase(purchase: Purchase | null) { return purchase?.checkout.state === 'pending' || purchase?.checkout.state === 'paid' && !purchase.requires_acceptance && (!purchase.issuance.length || purchase.issuance.some(item => !item.account_id && !['failed', 'cancelled', 'plan_mapping_required', 'compliance_pending'].includes(item.state))); }
export function safeInvoiceUrl(value: string | null | undefined) { try { const url = new URL(value ?? ''); return url.protocol === 'https:' && url.hostname === 'nowpayments.io' ? url.href : null; } catch { return null; } }
const errors: Record<string, string> = {
 commerce_not_ready: 'Checkout is not available yet. Please contact support so we can finish setting it up.',
 commerce_unavailable: 'Checkout is temporarily unavailable. Please try again shortly.',
 invalid_affiliate: 'That creator code isn’t available. Check the code or remove it to continue.', coupon_unavailable: 'That coupon isn’t available for this purchase.', coupon_limit: 'This coupon has reached its usage limit. Choose another discount.',
 payment_pending: 'This checkout has a payment in progress. Check its status before continuing.', quote_changed: 'The price changed. Review your updated total before paying.', slots_full: 'All three account slots are in use. View your accounts to continue.', kyc_required: 'Complete compliance before adding another evaluation.',
 processor_unavailable: 'This payment method is unavailable. Choose another method or try again later.', crypto_minimum: 'Crypto payments require a total of at least $10.', product_unavailable: 'This evaluation is no longer available. Choose another evaluation.',
 ticket_unavailable: 'This ticket can’t be used for this purchase.', ticket_held: 'This ticket is reserved by another checkout.', ticket_reserved: 'This ticket is reserved by another checkout.',
 billing_region_unavailable: 'Evaluations aren’t available in this billing region.', accept_current_terms: 'Please review and accept the current evaluation agreement.', terms_unavailable: 'The evaluation agreement is currently unavailable. Please try again later.',
 not_found: 'This checkout isn’t available on your account.', verified_email_required: 'Verify your email to continue.', purchase_declined: 'This account can’t complete a purchase. Contact support.',
};
export class CheckoutError extends Error { constructor(public code: string) { super(errors[code] ?? 'We couldn’t update your checkout. Check your connection and try again.'); } }
export async function commerce<T>(path: string, body?: unknown): Promise<T> {
 const response = await fetch(`/api/commerce/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(25000) });
 const result = await response.json(); if (!response.ok) throw new CheckoutError(result.error ?? 'unavailable'); return result as T;
}
