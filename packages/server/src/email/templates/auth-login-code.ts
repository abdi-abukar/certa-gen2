import { escapeHtml, renderCertaEmail } from '../render';
import type { EmailContext, LoginCodeData, RenderedEmail } from '../schema';

/** Adapted from the old login_pin template. Edit this file to redesign only this email. */
export function renderLoginCode(context: EmailContext, data: LoginCodeData): RenderedEmail {
  const subject = `Your ${context.brand.shortName} login code`;
  const message = `Use this code to finish signing in to your ${context.brand.name} account.`;
  const expiry = `This code expires in ${data.expiresInMinutes} minutes. If you did not request it, you can ignore this email.`;
  const footer = 'Never share this code. Certa staff will never ask for it.';
  return {
    // Keep codes out of subjects/preheaders, where notification previews expose them.
    subject,
    html: renderCertaEmail({
      title: 'Your login code', greeting: context.user.greeting, preheader: 'Use your one-time code to continue.',
      bodyHtml: `<p style="margin:0 0 12px">${escapeHtml(message)}</p><p class="certa-pin" style="font-size:32px;font-weight:600;letter-spacing:4px;margin:24px 0">${escapeHtml(data.code)}</p><p>${escapeHtml(expiry)}</p>`, footer,
    }),
    text: [`Hi ${context.user.greeting},`, message, data.code, expiry, footer].join('\n\n'),
  };
}
