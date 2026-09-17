import type { User } from '@supabase/supabase-js';

export const EMAIL_BRAND = Object.freeze({ name: 'Certa Futures', shortName: 'Certa', domain: 'certafutures.com', email: 'support@certafutures.com' });

/** Presentation data only. Identity must come from a verified server user/hook. */
export type EmailUser = {
  id: string; email: string; displayName: string; firstName: string;
  username: string; greeting: string; emailConfirmed: boolean;
};
export type EmailContext = { user: EmailUser; brand: typeof EMAIL_BRAND };
export type RenderedEmail = { subject: string; html: string; text: string };
export type LoginCodeData = { code: string; expiresInMinutes: number };
export type PasswordResetData = { resetUrl: string; expiresInMinutes: number };
export type EmailDataMap = { 'auth-login-code': LoginCodeData; 'password-reset': PasswordResetData };
export type EmailId = keyof EmailDataMap;

// Machine-readable field inventory for agents, previews, and future editor tooling.
// Do not put arbitrary metadata, secrets, or full auth records into template context.
export const EMAIL_VARIABLES = {
  'user.id': { kind: 'text', source: 'Supabase user.id', required: true },
  'user.email': { kind: 'email', source: 'Supabase user.email', required: true },
  'user.displayName': { kind: 'text', source: 'user_metadata.full_name or name', required: false },
  'user.firstName': { kind: 'text', source: 'user_metadata.first_name or first display-name word', required: false },
  'user.username': { kind: 'text', source: 'user_metadata.username', required: false },
  'user.greeting': { kind: 'text', source: 'firstName, username, or there', required: true },
  'user.emailConfirmed': { kind: 'boolean', source: 'Supabase user.email_confirmed_at', required: true },
  'brand.name': { kind: 'text', source: 'EMAIL_BRAND', required: true },
  'brand.shortName': { kind: 'text', source: 'EMAIL_BRAND', required: true },
  'brand.domain': { kind: 'text', source: 'EMAIL_BRAND', required: true },
  'brand.email': { kind: 'email', source: 'EMAIL_BRAND', required: true },
} as const;

export function emailAddress(input: unknown): string {
  if (typeof input !== 'string' || input.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(input)) throw new Error('Invalid email address.');
  return input;
}
function displayText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) : '';
}
export function contextFromUser(user: Pick<User, 'id' | 'email' | 'user_metadata' | 'email_confirmed_at'>): EmailContext {
  if (!user.id || typeof user.id !== 'string' || user.id.length > 128) throw new Error('A verified user ID is required.');
  const email = emailAddress(user.email);
  const displayName = displayText(user.user_metadata?.full_name) || displayText(user.user_metadata?.name);
  const firstName = displayText(user.user_metadata?.first_name) || displayName.split(/\s+/)[0] || '';
  const username = displayText(user.user_metadata?.username);
  return { brand: EMAIL_BRAND, user: { id: user.id, email, displayName, firstName, username, greeting: firstName || username || 'there', emailConfirmed: Boolean(user.email_confirmed_at) } };
}

export function safeEmailUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Email links must use HTTPS without embedded credentials.');
  return value;
}

export const LOGIN_CODE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['code', 'expiresInMinutes'],
  properties: { code: { type: 'string', pattern: '^[0-9]{6,10}$', sensitive: true }, expiresInMinutes: { type: 'integer', minimum: 1, maximum: 60 } },
} as const;

export function parseLoginCode(value: unknown): LoginCodeData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid login-code data.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !Object.hasOwn(LOGIN_CODE_SCHEMA.properties, key))
    || typeof data.code !== 'string' || !new RegExp(LOGIN_CODE_SCHEMA.properties.code.pattern).test(data.code)
    || typeof data.expiresInMinutes !== 'number' || !Number.isInteger(data.expiresInMinutes)
    || data.expiresInMinutes < 1 || data.expiresInMinutes > 60) throw new Error('Invalid login-code data.');
  return { code: data.code, expiresInMinutes: data.expiresInMinutes };
}

export const PASSWORD_RESET_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['resetUrl', 'expiresInMinutes'],
  properties: { resetUrl: { type: 'string', format: 'uri', maxLength: 4096, sensitive: true }, expiresInMinutes: { type: 'integer', minimum: 1, maximum: 1440 } },
} as const;

export function parsePasswordReset(value: unknown): PasswordResetData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid password-reset data.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !Object.hasOwn(PASSWORD_RESET_SCHEMA.properties, key))
    || typeof data.resetUrl !== 'string' || data.resetUrl.length > 4096
    || typeof data.expiresInMinutes !== 'number' || !Number.isInteger(data.expiresInMinutes)
    || data.expiresInMinutes < 1 || data.expiresInMinutes > 1440) throw new Error('Invalid password-reset data.');
  safeEmailUrl(data.resetUrl);
  return { resetUrl: data.resetUrl, expiresInMinutes: data.expiresInMinutes };
}
