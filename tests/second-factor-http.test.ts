import test from 'node:test';
import assert from 'node:assert/strict';
import { secondFactorResponse } from '../packages/server/src/second-factor-http';
import { identityResponse } from '../packages/server/src/api';
import { createApiClient } from '../packages/api-client/src';
const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const factorId = '30000000-0000-4000-8000-000000000001';
const challengeId = '40000000-0000-4000-8000-000000000001';
function token(aal = 'aal1') {
  return [ { alg: 'HS256', typ: 'JWT' }, { sub: userId, session_id: sessionId, aal, exp: 4102444800 }, 'synthetic' ].map((part, index) => index < 2 ? Buffer.from(JSON.stringify(part)).toString('base64url') : Buffer.from(String(part)).toString('base64url')).join('.');
}
test('actual factor handlers enforce identity, precedence, proof binding and native TOTP rotation', async () => {
  const savedEnv = { ...process.env }; const savedFetch = globalThis.fetch;
  Object.assign(process.env, { CERTA_APP: 'web', CERTA_APP_ORIGIN: 'https://web.example.test', CERTA_ALLOWED_ORIGINS: 'https://web.example.test', CERTA_SUPABASE_URL: 'https://supabase.example.test', CERTA_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', SUPABASE_SECRET_KEY: 'sb_secret_synthetic', CERTA_AUTH_CHALLENGE_SECRET: 'synthetic-challenge-secret'.repeat(3), EMAIL_DELIVERY_MODE: 'disabled' });
  let factors: Array<{ id: string; factor_type: string; status: string }> = [];
  let proof = false; let unavailable = false; let trusted = true;
  const calls: Array<{ path: string; body: any; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body, authorization: headers.get('authorization') });
    if (path === '/auth/v1/user') return Response.json({ id: userId, email: 'person@example.test', app_metadata: {}, user_metadata: { certa_email_2fa: false }, factors });
    if (path === '/rest/v1/rpc/cf_prove_totp') return new Response(null, { status: 204 });
    if (path === '/rest/v1/rpc/cf_verified_totp') return Response.json(false);
    if (path === '/rest/v1/rpc/cf_factors') return Response.json(trusted ? [factorId] : []);
    if (path === '/rest/v1/rpc/cf_verified') return unavailable ? Response.json({ message: 'unavailable' }, { status: 500 }) : Response.json(proof);
    if (path === '/rest/v1/rpc/cf_verify') return Response.json(true);
    if (path === '/rest/v1/rpc/cf_clear') return new Response(null, { status: 204 });
    if (path === `/auth/v1/factors/${factorId}/challenge`) return Response.json({ id: challengeId, type: 'totp', expires_at: 4102444800 });
    if (path === `/auth/v1/factors/${factorId}/verify`) return Response.json({ access_token: token('aal2'), refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user: { id: userId, factors } });
    throw new Error(`Unexpected mocked request: ${path}`);
  };
  const request = (path: string, body?: object, extra?: Record<string, string>) => new Request(`https://web.example.test/api/auth/second-factor/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token()}`, ...extra }, body: body ? JSON.stringify(body) : undefined });
  const run = (path: string, body?: object, extra?: Record<string, string>) => secondFactorResponse(request(path, body, extra), path.split('/'));
  try {
    let response = await run('status'); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { mode: 'email', verified: false, factorId: null, email: 'p***@example.test' });
    assert.equal((await identityResponse(request('status'))).status, 403, 'metadata opt-out cannot bypass API');
    proof = true; assert.equal((await identityResponse(request('status'))).status, 200); proof = false;
    assert.equal((await run('totp/enroll', {})).status, 403);
    assert.equal((await run('email/send', {})).status, 503);
    response = await run('email/verify', { challengeId, code: '123456' }); assert.equal(response.status, 200);
    const verification = calls.find(call => call.path.endsWith('/cf_verify'))!.body;
    assert.equal(verification.p_user, userId); assert.equal(verification.p_session, sessionId); assert.equal(verification.p_email, 'person@example.test');
    assert.equal(verification.p_hash.length, 64); assert.equal(JSON.stringify(verification).includes('123456'), false);
    factors = [{ id: factorId, factor_type: 'totp', status: 'verified' }]; proof = true;
    assert.equal((await identityResponse(request('status'))).status, 403, 'email proof cannot bypass TOTP');
    assert.equal((await run('email/verify', { challengeId, code: '123456' })).status, 409);
    assert.equal((await identityResponse(request('status', undefined, { Authorization: `Bearer ${token('aal2')}` }))).status, 403, 'bare AAL2 lacks proof of which trusted factor was used');
    response = await run('totp/verify', { factorId, code: '123456' }); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).session, { access_token: token('aal2'), refresh_token: 'synthetic-refresh' });
    assert.deepEqual(calls.find(call => call.path.endsWith('/cf_prove_totp'))!.body, { p_user: userId, p_session: sessionId, p_factor: factorId });
    assert.equal(calls.find(call => call.path.endsWith('/challenge'))!.authorization, `Bearer ${token()}`);
    trusted = false; proof = false;
    response = await run('status', undefined, { Authorization: `Bearer ${token('aal2')}` });
    assert.deepEqual(await response.json(), { mode: 'email', verified: false, factorId: null, email: 'p***@example.test' }, 'direct SDK enrollment + AAL2 cannot replace email admission');
    assert.equal((await run('totp/verify', { factorId, code: '123456' })).status, 403, 'unregistered factor is not admitted by the verification endpoint');
    factors = []; unavailable = true;
    assert.equal((await run('status')).status, 503, 'store outage fails closed');
    assert.equal((await run('session/clear', {})).status, 200, 'revocation does not require reading proof');
    assert.deepEqual(calls.at(-1)!.body, { p_user: userId, p_session: sessionId });
    assert.equal((await run('email/verify', { challengeId, code: '123456' }, { Origin: 'https://evil.example.test' })).status, 403);
    response = await run('status', undefined, { Authorization: 'Basic nope' }); assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control')!, /no-store/);
  } finally { globalThis.fetch = savedFetch; process.env = savedEnv; }
});
test('native API rejects a previous session before fetching', async () => {
  const saved = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('must not fetch'); };
  try {
    const client = createApiClient('https://web.example.test', async () => 'new-token');
    await assert.rejects(client.secondFactor('totp/verify', { factorId, code: '123456' }, 'old-token'), /sign in again/);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = saved; }
});
