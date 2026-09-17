import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeWebEnvironment } from '../packages/server/src/startup';
import { environmentFor, settingsFromEnvironment, type Environment } from '../packages/server/src/environment.mjs';
import { readSettings } from '../scripts/environment.mjs';

const settings = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_deployment_test',
  WEB_ORIGIN: 'https://certa-preview.vercel.app',
  ADMIN_ORIGIN: 'https://admin.example.test',
  API_ORIGIN: 'https://certa-preview.vercel.app',
};

test('Vercel builds consume explicit settings without falling back to a local private .env', () => {
  const configured = readSettings({ VERCEL: '1', ...settings });
  assert.equal(configured.SUPABASE_URL, settings.SUPABASE_URL);
  assert.equal(configured.SUPABASE_SECRET_KEY, '');
  assert.equal(configured.TRADARA_FIRM_API_KEY, '');
  assert.equal(configured.RESEND_API_KEY, '');
  assert.throws(() => environmentFor('web', readSettings({ VERCEL: '1' }), {}));
});

test('hosted startup derives the same auth and origin configuration as the launcher', () => {
  const environment: Environment = { ...settings, VERCEL: '1', SUPABASE_SECRET_KEY: 'server-secret-canary' };
  initializeWebEnvironment(environment);
  const local = environmentFor('web', settingsFromEnvironment({ ...settings, SUPABASE_SECRET_KEY: 'server-secret-canary' }), {});
  for (const [key, value] of Object.entries(local)) assert.equal(environment[key], value);
  assert.equal(environment.CERTA_APP, 'web');
  assert.equal(environment.CERTA_APP_ORIGIN, settings.WEB_ORIGIN);
  assert.equal(environment.CERTA_ALLOWED_ORIGINS, `${settings.WEB_ORIGIN},${settings.ADMIN_ORIGIN}`);
  assert.equal(Object.keys(environment).some(key => key.startsWith('NEXT_PUBLIC_')), false);
  assert.equal(Object.keys(environment).some(key => key.startsWith('EXPO_PUBLIC_')), false);
  initializeWebEnvironment(environment);
  assert.equal(environment.CERTA_APP_ORIGIN, settings.WEB_ORIGIN);
});

test('hosted startup fails closed for missing config, privileged public keys and unsafe origins', () => {
  for (const override of [
    { SUPABASE_URL: '' }, { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' },
    { WEB_ORIGIN: 'http://external.example' }, { WEB_ORIGIN: 'https://example.com/path' },
    { CERTA_APP: 'admin' },
  ]) {
    const environment: Environment = { ...settings, ...override };
    assert.throws(() => initializeWebEnvironment(environment));
    assert.equal(environment.CERTA_APP_ORIGIN, undefined);
  }
});

test('Vercel build identity survives the launcher without allowing deployment tokens or unrelated settings', () => {
  const environment = environmentFor('web', settings, {
    VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'certa-preview.vercel.app',
    VERCEL_DEPLOYMENT_ID: 'dpl_fixture', VERCEL_TOKEN: 'private-canary',
    NEXT_PUBLIC_PRIVATE: 'private-canary',
  });
  assert.equal(environment.VERCEL, '1');
  assert.equal(environment.VERCEL_DEPLOYMENT_ID, 'dpl_fixture');
  assert.equal(JSON.stringify(environment).includes('private-canary'), false);
});
