import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUsername, normalizeUsername } from '../packages/server/src/signup/username';
import { ACCEPTED_COUNTRIES, isAcceptedCountry } from '../packages/server/src/signup/countries';
import { STATIC_RESTRICTED_COUNTRY_CODES } from '../packages/server/src/commerce/restricted-countries';
import { signupResponse, hashSignupCode, hashSignupProof } from '../packages/server/src/signup/http';

test('username rules match the original: format, brand, reserved, leet-folded profanity', () => {
  assert.deepEqual(validateUsername(' Trader.One '), { ok: true, username: 'traderone' });
  assert.equal(normalizeUsername('@Ab-1'), 'ab1');
  for (const bad of ['', '1abc', 'abcdefghijklm', 'certa1', 'tr4dara', 'admin', 'adm1n', 'sh1t', 'ADMIN']) assert.equal(validateUsername(bad).ok, false, bad);
  assert.match((validateUsername('certafan') as { error: string }).error, /reserved/);
});

test('accepted countries exclude restricted jurisdictions and uninhabited territories', () => {
  assert.ok(ACCEPTED_COUNTRIES.length > 200);
  assert.ok(ACCEPTED_COUNTRIES.some(country => country.code === 'CA'));
  for (const code of STATIC_RESTRICTED_COUNTRY_CODES) assert.equal(isAcceptedCountry(code), false, code);
  for (const code of ['AQ', 'ZZ', 'us', 'USA', 42, null]) assert.equal(isAcceptedCountry(code), false, String(code));
  assert.equal(isAcceptedCountry('US'), true);
});

test('signup handler: same-origin only, keyed hashes, fail-closed delivery, proof before account creation', async () => {
  const savedEnv = { ...process.env }; const savedFetch = globalThis.fetch;
  Object.assign(process.env, { CERTA_APP: 'web', CERTA_APP_ORIGIN: 'https://web.example.test', CERTA_ALLOWED_ORIGINS: 'https://web.example.test', CERTA_SUPABASE_URL: 'https://supabase.example.test', CERTA_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', SUPABASE_SECRET_KEY: 'sb_secret_synthetic', CERTA_AUTH_CHALLENGE_SECRET: 'synthetic-signup-secret-'.repeat(3), EMAIL_DELIVERY_MODE: 'disabled' });
  const calls: Array<{ path: string; body: any }> = [];
  let taken = false; let claim = true;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (path === '/rest/v1/rpc/cu_username_available') return Response.json(!taken);
    if (path === '/rest/v1/rpc/cu_email_registered') return Response.json(false);
    if (path === '/rest/v1/rpc/cu_signup_begin') return Response.json({ state: 'created', id: body.p_id });
    if (path === '/rest/v1/rpc/cu_signup_delivery') return new Response(null, { status: 204 });
    if (path === '/rest/v1/rpc/cu_signup_verify') return Response.json(true);
    if (path === '/rest/v1/rpc/cu_signup_claim') return Response.json(claim);
    if (path === '/rest/v1/rpc/cu_signup_release') return new Response(null, { status: 204 });
    if (path === '/rest/v1/ce_templates') return Response.json({ message: 'template store offline' }, { status: 500 });
    throw new Error(`Unexpected mocked request: ${path}`);
  };
  const origin = { Origin: 'https://web.example.test' };
  const request = (path: string, body?: object, headers: Record<string, string> = origin) => new Request(`https://web.example.test/api/auth/signup/${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const run = (path: string, body?: object, headers?: Record<string, string>) => signupResponse(request(path, body, headers), path.split('?')[0]!.split('/'));
  const challengeId = '40000000-0000-4000-8000-000000000001';
  const account = { firstName: 'Ada', lastName: 'Lovelace', username: 'ada1', country: 'CA', email: 'Ada@Example.test', password: 'a-long-enough-password', acceptedTerms: true, challengeId, proof: 'p'.repeat(64) };
  try {
    // Availability: local rules answer without the store; free and taken names come from the store.
    let response = await run('username?username=admin'); assert.equal(response.status, 200);
    assert.equal((await response.json()).available, false); assert.equal(calls.length, 0);
    response = await run('username?username=Ada1'); assert.deepEqual(await response.json(), { available: true, username: 'ada1' });
    taken = true; response = await run('username?username=ada1'); assert.equal((await response.json()).available, false); taken = false;
    // Cross-origin and bodiless posts are refused before any store access.
    assert.equal((await run('email/send', { email: 'ada@example.test' }, {})).status, 403);
    assert.equal((await run('email/send', { email: 'ada@example.test' }, { Origin: 'https://evil.example.test' })).status, 403);
    // Disabled delivery fails closed before a challenge is written.
    const before = calls.length;
    response = await run('email/send', { email: 'ada@example.test' }); assert.equal(response.status, 503); assert.equal((await response.json()).error, 'email_delivery_disabled'); assert.equal(calls.length, before);
    // Live mode with an unavailable template store records a failed delivery and never returns a code.
    process.env.EMAIL_DELIVERY_MODE = 'live';
    response = await run('email/send', { email: 'ada@example.test' }); assert.equal(response.status, 503); assert.equal((await response.json()).error, 'email_delivery_unavailable');
    const begin = calls.find(call => call.path.endsWith('cu_signup_begin'))!.body; const delivery = calls.find(call => call.path.endsWith('cu_signup_delivery'))!.body;
    assert.equal(begin.p_email, 'ada@example.test'); assert.equal(begin.p_hash.length, 64); assert.equal(begin.p_ip_hash.length, 64); assert.equal(delivery.p_accepted, false);
    assert.equal(JSON.stringify(calls).match(/"p_hash":"\d{6}"/), null);
    process.env.EMAIL_DELIVERY_MODE = 'disabled';
    // Verification binds the code and the returned proof to the challenge and email, never storing either raw.
    response = await run('email/verify', { challengeId, email: 'ada@example.test', code: '123456' }); assert.equal(response.status, 200);
    const { proof } = await response.json(); assert.equal(typeof proof, 'string'); assert.equal(proof.length, 64);
    const verify = calls.find(call => call.path.endsWith('cu_signup_verify'))!.body;
    assert.equal(verify.p_hash, hashSignupCode(challengeId, 'ada@example.test', '123456')); assert.equal(verify.p_proof_hash, hashSignupProof(challengeId, 'ada@example.test', proof));
    assert.notEqual(hashSignupCode(challengeId, 'other@example.test', '123456'), verify.p_hash);
    assert.equal((await run('email/verify', { challengeId, email: 'ada@example.test', code: '12345' })).status, 400);
    // Account creation validates everything before touching Supabase Auth.
    for (const [patch, code] of [[{ country: 'KP' }, 'country_unavailable'], [{ password: 'short' }, 'invalid_password'], [{ acceptedTerms: false }, 'terms_required'], [{ username: 'certa' }, 'invalid_username'], [{ firstName: ' ' }, 'invalid_first_name'], [{ extra: 1 }, 'unexpected_field']] as const) {
      const start = calls.length;
      response = await run('create', { ...account, ...patch }); assert.equal(response.status, 400, code); assert.equal((await response.json()).error, code); assert.equal(calls.length, start, `${code} reached the store`);
    }
    for (const password of ['1234567', 'p'.repeat(1025)]) {
      const start = calls.length;
      response = await run('create', { ...account, password });
      assert.equal((await response.json()).error, 'invalid_password');
      assert.equal(calls.length, start, 'invalid password must not reach the store');
    }
    claim = false;
    for (const password of ['12345678', 'p'.repeat(1024)]) {
      response = await run('create', { ...account, password });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'email_not_verified', 'valid password still requires mailbox proof');
    }
    claim = true;
    taken = true; response = await run('create', account); assert.equal(response.status, 409); assert.equal((await response.json()).error, 'username_taken');
    assert.ok(calls.some(call => call.path.endsWith('cu_signup_release')), 'a failed creation releases the mailbox proof for retry');
    assert.equal(calls.some(call => call.path.startsWith('/auth/v1/admin')), false, 'no auth user is created before the checks pass');
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
});
