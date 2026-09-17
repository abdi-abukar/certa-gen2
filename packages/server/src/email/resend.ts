import 'server-only';
import { emailAddress, type RenderedEmail } from './schema';

export class EmailDeliveryError extends Error {
  constructor(public readonly code: 'disabled' | 'configuration' | 'network' | 'rate_limited' | 'provider' | 'response', public readonly retryable = false, public readonly retryAfterSeconds?: number) {
    super(`Email delivery: ${code}.`);
  }
}
export type ResendConfig = { mode: 'disabled' | 'live'; apiKey?: string; from?: string; replyTo?: string };
export type Delivery = { to: string; message: RenderedEmail; idempotencyKey: string; unsubscribeUrl?: string };

/** Single attempt. The trigger owner controls bounded retries using the SAME key/body. */
export function createResendDelivery(config: ResendConfig, request: typeof fetch = fetch) {
  return async ({ to, message, idempotencyKey, unsubscribeUrl }: Delivery): Promise<{ status: 'accepted'; providerId: string }> => {
    if (config.mode !== 'live') throw new EmailDeliveryError('disabled');
    if (!config.apiKey?.startsWith('re_') || !config.from || /[\r\n]/.test(config.from)) throw new EmailDeliveryError('configuration');
    emailAddress(config.from.match(/<([^<>]+)>$/)?.[1] ?? config.from);
    emailAddress(to);
    if (config.replyTo) emailAddress(config.replyTo);
    if (!message.subject.trim() || message.subject.length > 200 || /[\r\n]/.test(message.subject)
      || !message.text.trim() || !message.html.trim() || message.html.length > 1_000_000 || message.text.length > 1_000_000) throw new Error('Invalid email content.');
    if (!/^[a-zA-Z0-9_:/.-]{1,256}$/.test(idempotencyKey)) throw new Error('Invalid email idempotency key.');
    if (unsubscribeUrl && (!/^https:\/\//.test(unsubscribeUrl) || /[\r\n<>]/.test(unsubscribeUrl))) throw new Error('Invalid unsubscribe URL.');
    let response: Response;
    try {
      response = await request('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ from: config.from, to: [to], reply_to: config.replyTo, subject: message.subject, html: message.html, text: message.text, ...(unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}) }), signal: AbortSignal.timeout(10000),
      });
    } catch { throw new EmailDeliveryError('network', true); }
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await response.body?.cancel();
      throw new EmailDeliveryError(response.status === 429 ? 'rate_limited' : 'provider', response.status === 429 || response.status >= 500,
        Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 3600) : undefined);
    }
    const data = await response.json().catch(() => null);
    if (typeof data?.id !== 'string' || !data.id) throw new EmailDeliveryError('response', true);
    return { status: 'accepted', providerId: data.id };
  };
}
