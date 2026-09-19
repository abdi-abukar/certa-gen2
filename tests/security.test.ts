import assert from 'node:assert/strict';
import { test } from 'node:test';
import { environmentFor, validateSettings } from '../scripts/environment.mjs';
import { publicConfig } from '../packages/supabase/src/config';
import { isStaff, safeNext, validCredentials } from '../packages/supabase/src/policy';
import { createSecureStorage, type SecureStorageDriver } from '../packages/supabase/src/secure-storage';

const settings = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_for_tests',
  WEB_ORIGIN: 'http://localhost:3200', ADMIN_ORIGIN: 'http://localhost:3201', API_ORIGIN: 'http://localhost:3200',
};
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('privileged keys are rejected before any app starts or client is created', () => {
  for (const key of ['sb_secret_do_not_ship', jwt('service_role'), jwt('authenticated'), 'not-a-key']) {
    assert.throws(() => validateSettings({ ...settings, SUPABASE_PUBLISHABLE_KEY: key }));
    assert.throws(() => publicConfig(settings.SUPABASE_URL, key));
  }
  assert.doesNotThrow(() => validateSettings({ ...settings, SUPABASE_PUBLISHABLE_KEY: jwt('anon') }));
});

test('master environment does not leak secrets or arbitrary public-prefixed values to any app', () => {
  const inherited = { PATH: '/bin', SUPABASE_SERVICE_ROLE_KEY: 'private-canary', DATABASE_URL: 'private-canary', NEXT_PUBLIC_WRONG: 'private-canary', EXPO_PUBLIC_WRONG: 'private-canary', VITE_WRONG: 'private-canary', NODE_OPTIONS: 'private-canary' };
  for (const app of ['web', 'admin', 'mobile']) {
    const output = environmentFor(app, { ...settings, NEW_VENDOR_SECRET: 'private-canary' }, inherited);
    assert.equal(JSON.stringify(output).includes('private-canary'), false);
    assert.equal(output.PATH, '/bin');
    assert.equal(output.EXPO_NO_DOTENV, '1');
    if (app === 'mobile') assert.equal(output.CERTA_SUPABASE_PUBLISHABLE_KEY, undefined);
  }
  assert.throws(() => environmentFor('unregistered', settings));
  assert.throws(() => environmentFor('trading', settings));
  assert.equal(environmentFor('web', settings, {}).CERTA_ALLOWED_ORIGINS, `${settings.WEB_ORIGIN},${settings.ADMIN_ORIGIN}`);
});

test('external origins require TLS and cannot include credentials or paths', () => {
  for (const origin of ['http://certa.example', 'https://user:pass@certa.example', 'https://certa.example/path', 'https://certa.example?next=other']) {
    assert.throws(() => validateSettings({ ...settings, WEB_ORIGIN: origin }));
  }
});

test('staff policy denies normal users and accepts existing server-managed staff roles', () => {
  for (const metadata of [undefined, null, {}, { role: 'user' }, { certa_admin: 'true' }, { user_metadata: { role: 'admin' } }]) assert.equal(isStaff(metadata), false);
  for (const metadata of [{ role: 'admin' }, { role: 'certa_admin' }, { role: 'super_admin' }, { certa_admin: true }]) assert.equal(isStaff(metadata), true);
});

test('auth callbacks cannot redirect to attacker origins', () => {
  for (const target of ['https://evil.example', '//evil.example', '/\\evil.example', '/%2f%2fevil.example', '/account?next=https://evil.example', null]) assert.equal(safeNext(target), '/account');
  assert.equal(safeNext('/reset-password'), '/reset-password');
});

test('credentials have bounded input sizes without trimming the password', () => {
  assert.equal(validCredentials('trader@example.com', ' existing password '), true);
  assert.equal(validCredentials('invalid', 'password'), false);
  assert.equal(validCredentials('trader@example.com', ''), false);
  assert.equal(validCredentials('trader@example.com', 'x'.repeat(1025)), false);
});

function storageFixture() {
  const values = new Map<string, string>();
  let fail = false;
  const driver: SecureStorageDriver = {
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      assert.ok(Buffer.byteLength(value) <= 2048);
      if (fail && key.endsWith('.1')) throw new Error('Simulated storage failure');
      values.set(key, value);
    },
    deleteItemAsync: async key => { values.delete(key); },
  };
  return { values, storage: createSecureStorage(driver), failWrites: () => { fail = true; } };
}

test('large Unicode sessions survive secure storage and sign-out removes all chunks', async () => {
  const { storage, values } = storageFixture();
  const session = JSON.stringify({ token: 'x'.repeat(8000), name: '🎉'.repeat(900) });
  await storage.setItem('session', session);
  assert.equal(await storage.getItem('session'), session);
  await storage.setItem('session', 'replacement');
  assert.equal(await storage.getItem('session'), 'replacement');
  assert.equal(values.size, 2);
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  assert.equal(values.size, 0);
});

test('a failed token refresh cannot destroy the previously committed secure session', async () => {
  const { storage, values, failWrites } = storageFixture();
  await storage.setItem('session', 'old-session');
  failWrites();
  await assert.rejects(storage.setItem('session', 'new-session'.repeat(100)));
  assert.equal(await storage.getItem('session'), 'old-session');
  assert.equal(values.size, 2);
});

test('overlapping session writes, reads, and sign-out remain atomic', async () => {
  const { storage, values } = storageFixture();
  const token = 'session'.repeat(1000);
  const [, readBeforeSignout, , readAfterSignout] = await Promise.all([
    storage.setItem('session', token), storage.getItem('session'),
    storage.removeItem('session'), storage.getItem('session'),
  ]);
  assert.equal(readBeforeSignout, token);
  assert.equal(readAfterSignout, null);
  assert.equal(values.size, 0);
});

test('corrupt or incomplete native storage is rejected instead of returning partial tokens', async () => {
  const { storage, values } = storageFixture();
  values.set('session', '{invalid');
  assert.equal(await storage.getItem('session'), null);
  values.set('session', JSON.stringify({ version: 'safe', count: 999999 }));
  assert.equal(await storage.getItem('session'), null);
  await storage.setItem('session', 'x'.repeat(800));
  const key = [...values.keys()].find(key => key.endsWith('.1'))!;
  values.delete(key);
  assert.equal(await storage.getItem('session'), null);
});


test('checkout and challenge credentials stay in web; email worker receives only its delivery settings', () => {
 const privateSettings={...settings,AUTHORIZE_NET_TRANSACTION_KEY:'charge-secret',NMI_SECURITY_KEY:'charge-secret',NOWPAYMENTS_API_KEY:'charge-secret',CERTA_AUTH_CHALLENGE_SECRET:'challenge-secret',RESEND_API_KEY:'email-secret',EMAIL_DELIVERY_MODE:'disabled'};
 for(const app of ['web','admin','mobile','tradara','contracts','discord','content']) {
   const projected=environmentFor(app,privateSettings,{});
   assert.equal(JSON.stringify(projected).includes('charge-secret'),app==='web');
   assert.equal(JSON.stringify(projected).includes('challenge-secret'),app==='web');
   assert.equal(JSON.stringify(projected).includes('email-secret'),app==='web'||app==='content');
 }
});
