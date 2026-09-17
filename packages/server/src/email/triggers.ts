import 'server-only';
import { createHash } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { emailCatalog, renderEmail } from './catalog';
import { contextFromUser, type LoginCodeData, type PasswordResetData } from './schema';
import { createResendDelivery } from './resend';

export const emailTriggers = {
  'auth.login-code.requested': {
    template: 'auth-login-code', enabled: false,
    owner: 'Future verified Supabase Auth send-email hook or reviewed application challenge flow',
    condition: 'An authorized challenge exists, is unexpired, and permits this delivery attempt.',
  },
  'auth.password-reset.requested': {
    template: 'password-reset', enabled: false,
    owner: 'Future verified Supabase Auth send-email hook',
    condition: 'A valid recovery token exists and its recipient/redirect have been verified.',
  },
} as const;
export type EmailEvent = {
  /** Persisted non-secret event/challenge ID, not a random ID generated on each retry. */
  id: string;
  user: Pick<User, 'id' | 'email' | 'user_metadata' | 'email_confirmed_at'>;
} & ({ type: 'auth.login-code.requested'; data: LoginCodeData } | { type: 'auth.password-reset.requested'; data: PasswordResetData });

export function emailIdempotencyKey(eventId: string, templateId: string, userId: string) {
  if (!eventId || eventId.length > 200) throw new Error('A stable email event ID is required.');
  return `certa/${createHash('sha256').update(JSON.stringify([eventId, templateId, userId])).digest('hex')}`;
}

// Intentionally no public arbitrary-send endpoint or browser-supplied recipient.
export async function dispatchEmail(event: EmailEvent) {
  if (!Object.hasOwn(emailTriggers, event.type)) throw new Error('Unknown email trigger.');
  const trigger = emailTriggers[event.type];
  if (!trigger.enabled) throw new Error('This email trigger has not been activated.');
  const context = contextFromUser(event.user);
  const message = event.type === 'auth.login-code.requested'
    ? renderEmail('auth-login-code', context, event.data)
    : renderEmail('password-reset', context, event.data);
  const send = createResendDelivery({
    mode: process.env.EMAIL_DELIVERY_MODE === 'live' ? 'live' : 'disabled',
    apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, replyTo: process.env.EMAIL_REPLY_TO,
  });
  const result = await send({ to: context.user.email, message, idempotencyKey: emailIdempotencyKey(event.id, trigger.template, context.user.id) });
  return { ...result, templateId: trigger.template, templateVersion: emailCatalog[trigger.template].version };
}
