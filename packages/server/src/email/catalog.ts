import { contextFromUser, LOGIN_CODE_SCHEMA, PASSWORD_RESET_SCHEMA, parseLoginCode, parsePasswordReset, type EmailContext, type EmailDataMap, type EmailId, type RenderedEmail } from './schema';
import { renderLoginCode } from './templates/auth-login-code';
import { renderPasswordReset } from './templates/password-reset';

const sampleUser = contextFromUser({ id: '00000000-0000-4000-8000-000000000001', email: 'alex@example.test', user_metadata: { full_name: 'Alex Rivera', username: 'ariver' }, email_confirmed_at: '2026-01-01T00:00:00Z' });

type Definition<T> = {
  version: number; category: 'authentication' | 'transactional' | 'marketing';
  description: string; schema: object; parse: (value: unknown) => T;
  render: (context: EmailContext, data: T) => RenderedEmail;
  sample: { context: EmailContext; data: T };
};

export const emailCatalog: { [K in EmailId]: Definition<EmailDataMap[K]> } = {
  'auth-login-code': {
    version: 1, category: 'authentication', description: 'Reference login-code email; no live authentication trigger yet.',
    schema: LOGIN_CODE_SCHEMA, parse: parseLoginCode, render: renderLoginCode,
    sample: {
      context: sampleUser,
      data: { code: '482193', expiresInMinutes: 10 },
    },
  },
  'password-reset': {
    version: 1, category: 'authentication', description: 'Certa password reset delivered by Resend; live auth delivery not yet connected.',
    schema: PASSWORD_RESET_SCHEMA, parse: parsePasswordReset, render: renderPasswordReset,
    sample: { context: sampleUser, data: { resetUrl: 'https://certafutures.com/auth/confirm?token_hash=preview-only&type=recovery', expiresInMinutes: 60 } },
  },
};

export function renderEmail<K extends EmailId>(id: K, context: EmailContext, value: EmailDataMap[K]): RenderedEmail {
  if (!Object.hasOwn(emailCatalog, id)) throw new Error('Unknown email template.');
  const template: Definition<EmailDataMap[K]> = emailCatalog[id];
  const rendered = template.render(context, template.parse(value));
  if (!rendered.subject.trim() || rendered.subject.length > 200 || /[\r\n]/.test(rendered.subject)
    || !rendered.html.trim() || !rendered.text.trim()) throw new Error('Invalid rendered email.');
  return rendered;
}
