import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailCatalog, renderEmail } from '../packages/server/src/email/catalog';
import { contextFromUser, parseLoginCode, parsePasswordReset } from '../packages/server/src/email/schema';
import { createResendDelivery, EmailDeliveryError } from '../packages/server/src/email/resend';
import { dispatchEmail, emailIdempotencyKey } from '../packages/server/src/email/triggers';
import { environmentFor } from '../scripts/environment.mjs';

const fixture = emailCatalog['auth-login-code'].sample;
const message = renderEmail('auth-login-code', fixture.context, fixture.data);
const config = { mode: 'live' as const, apiKey: 're_fixture_only', from: 'Certa <support@example.test>' };
const delivery = { to: 'alex@example.test', message, idempotencyKey: 'fixture/event-1' };

test('email context exposes only approved user fields, with safe missing-name fallbacks', () => {
  const context = contextFromUser({ id: 'user-1', email: 'alex@example.test', user_metadata: { token: 'never-copy-me', email: 'attacker@example.test', role: 'admin' }, email_confirmed_at: undefined });
  assert.equal(context.user.email, 'alex@example.test');
  assert.equal(context.user.greeting, 'there');
  assert.equal(JSON.stringify(context).includes('never-copy-me'), false);
  assert.equal(Object.hasOwn(context.user, 'role'), false);
  assert.throws(() => contextFromUser({ id: 'user-1', email: 'bad\nrecipient@example.test', user_metadata: {}, email_confirmed_at: undefined }));
});

test('templates escape editable metadata and keep challenge secrets out of subject/preheader', () => {
  const context = contextFromUser({ id: 'user-1', email: 'alex@example.test', user_metadata: { first_name: '<img src=x onerror=alert(1)>' }, email_confirmed_at: undefined });
  const output = renderEmail('auth-login-code', context, fixture.data);
  assert.ok(output.html.includes('&lt;img'));
  assert.equal(output.html.includes('<img src=x'), false);
  assert.equal(output.subject.includes(fixture.data.code), false);
  assert.ok(output.text.includes(fixture.data.code));
  assert.ok(output.html.includes(fixture.data.code));
});

test('missing, extra, invalid, or unsafe template variables fail before delivery', () => {
  for (const data of [{}, { code: 'abc', expiresInMinutes: 10 }, { code: '123456', expiresInMinutes: 0 }, { code: '123456', expiresInMinutes: 10, access_token: 'secret' }]) assert.throws(() => parseLoginCode(data));
  for (const resetUrl of ['javascript:alert(1)', 'http://example.test/reset', 'https://user:pass@example.test/reset']) assert.throws(() => parsePasswordReset({ resetUrl, expiresInMinutes: 60 }));
  const reset = emailCatalog['password-reset'].sample;
  const output = renderEmail('password-reset', reset.context, reset.data);
  assert.ok(output.text.includes(reset.data.resetUrl));
  assert.ok(output.html.includes('Reset password'));
});

test('disabled delivery and inactive triggers cannot send mail', async () => {
  let requests = 0;
  const send = createResendDelivery({ ...config, mode: 'disabled' }, async () => { requests++; return Response.json({ id: 'fixture' }); });
  await assert.rejects(send(delivery), (error: unknown) => error instanceof EmailDeliveryError && error.code === 'disabled');
  await assert.rejects(dispatchEmail({ id: 'event-1', type: 'auth.login-code.requested', user: { id: 'user-1', email: 'alex@example.test', user_metadata: {} }, data: fixture.data }), /not been activated/);
  assert.equal(requests, 0);
});

test('Resend request uses fixed destination, one recipient, both formats and a stable idempotency key', async () => {
  let requests = 0;
  const send = createResendDelivery(config, async (url, init) => {
    requests++; assert.equal(url, 'https://api.resend.com/emails');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Idempotency-Key'), delivery.idempotencyKey);
    const body = JSON.parse(init?.body as string);
    assert.deepEqual(body.to, ['alex@example.test']); assert.equal(body.html, message.html); assert.equal(body.text, message.text);
    return Response.json({ id: 'resend-fixture' });
  });
  assert.deepEqual(await send(delivery), { status: 'accepted', providerId: 'resend-fixture' });
  assert.equal(requests, 1);
  assert.equal(emailIdempotencyKey('event-1', 'password-reset', 'user-1'), emailIdempotencyKey('event-1', 'password-reset', 'user-1'));
  assert.notEqual(emailIdempotencyKey('event-1', 'password-reset', 'user-1'), emailIdempotencyKey('event-2', 'password-reset', 'user-1'));
});

test('provider failures produce safe retry metadata, never recipient or code-bearing response bodies', async () => {
  const send = createResendDelivery(config, async () => Response.json({ error: 'private-token-and-recipient' }, { status: 429, headers: { 'Retry-After': '3' } }));
  await assert.rejects(send(delivery), (error: unknown) => {
    assert.ok(error instanceof EmailDeliveryError); assert.equal(error.retryable, true); assert.equal(error.retryAfterSeconds, 3);
    assert.equal(error.message.includes('private-token'), false); return true;
  });
  const failed = createResendDelivery(config, async () => { throw new Error('private transport detail'); });
  await assert.rejects(failed(delivery), (error: unknown) => error instanceof EmailDeliveryError && error.code === 'network' && !error.message.includes('private'));
});

test('Resend secrets reach only the web server environment', () => {
  const settings = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_key', WEB_ORIGIN: 'http://localhost:3200', ADMIN_ORIGIN: 'http://localhost:3201', API_ORIGIN: 'http://localhost:3200', RESEND_API_KEY: 're_private_canary', EMAIL_DELIVERY_MODE: 'disabled' };
  assert.equal(environmentFor('web', settings, {}).RESEND_API_KEY, 're_private_canary');
  for (const app of ['admin', 'mobile']) assert.equal(JSON.stringify(environmentFor(app, settings, {})).includes('re_private_canary'), false);
});
