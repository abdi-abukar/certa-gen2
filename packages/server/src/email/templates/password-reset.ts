import { escapeHtml, renderCertaEmail } from '../render';
import type { EmailContext, PasswordResetData, RenderedEmail } from '../schema';

export function renderPasswordReset(context: EmailContext, data: PasswordResetData): RenderedEmail {
  const subject = `Reset your ${context.brand.shortName} password`;
  const message = `We received a request to reset your ${context.brand.name} password.`;
  const expiry = `This link expires in ${data.expiresInMinutes} minutes. If you did not request a reset, you can ignore this email.`;
  const footer = 'Never share this link. Certa staff will never ask for your password.';
  return {
    subject,
    html: renderCertaEmail({ title: 'Reset your password', greeting: context.user.greeting, preheader: 'Choose a new password for your account.',
      bodyHtml: `<p>${escapeHtml(message)}</p><p>${escapeHtml(expiry)}</p>`, ctaLabel: 'Reset password', ctaUrl: data.resetUrl, footer }),
    text: [`Hi ${context.user.greeting},`, message, `Reset password: ${data.resetUrl}`, expiry, footer].join('\n\n'),
  };
}
