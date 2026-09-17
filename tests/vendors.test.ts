import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHealthChecker, vendors } from '../packages/server/src/vendors/health';
import { environmentFor } from '../scripts/environment.mjs';

test('every vendor has a unique endpoint and unconfigured probes make no calls', async () => {
  const check = createHealthChecker(async () => { throw new Error('Unexpected network'); }, {});
  assert.equal(new Set(vendors.map(v => v.healthEndpoint)).size, vendors.length);
  for (const vendor of vendors) assert.equal((await check(vendor.id)).status, 'not_configured');
});
test('probe requests coalesce, expire, discard data and refuse redirects', async () => {
  let calls = 0; let time = 1000;
  const check = createHealthChecker(async (_url, init) => {
    calls++; assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    return Response.json({ private: 'never-return-this' });
  }, { TRADARA_HEALTH_API_KEY: 'secret' }, () => time);
  const results = await Promise.all([check('tradara'), check('tradara')]);
  assert.equal(calls, 1); assert.equal(results[0]?.status, 'healthy');
  assert.ok(!JSON.stringify(results).includes('never-return-this'));
  time += 60001; await check('tradara'); assert.equal(calls, 2);
});
test('auth failures, rate limits, server failures and timeouts never show healthy', async () => {
  for (const code of [401, 403, 429, 500]) {
    const check = createHealthChecker(async () => new Response(null, { status: code }), { RESEND_HEALTH_API_KEY: 'secret' });
    assert.equal((await check('resend')).status, code === 500 ? 'unavailable' : 'degraded');
  }
  const check = createHealthChecker(async () => { throw new Error('private provider message'); }, { RESEND_HEALTH_API_KEY: 'secret' });
  const result = await check('resend'); assert.equal(result.status, 'unavailable'); assert.ok(!JSON.stringify(result).includes('private provider'));
});
test('health credentials reach admin only', () => {
  const settings = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_for_tests', WEB_ORIGIN: 'http://localhost:3200', ADMIN_ORIGIN: 'http://localhost:3201', API_ORIGIN: 'http://localhost:3200', RESEND_HEALTH_API_KEY: 'health-canary', TRADARA_HEALTH_API_KEY: 'health-canary' };
  for (const app of ['web', 'admin', 'mobile']) {
    assert.equal(JSON.stringify(environmentFor(app, settings, {})).includes('health-canary'), app === 'admin');
  }
});

test('a successful HTML response cannot masquerade as vendor API health', async () => {
  const check = createHealthChecker(async () => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }), { TRADARA_HEALTH_API_KEY: 'secret' });
  assert.equal((await check('tradara')).status, 'degraded');
});
