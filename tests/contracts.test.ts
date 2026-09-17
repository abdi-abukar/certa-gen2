import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { ContractProviders, ProviderFailure, verifyCallback, callbackHint, safeProviderUrl } from '../packages/server/src/contracts/providers';
import { environmentFor } from '../scripts/environment.mjs';
import { createHealthChecker } from '../packages/server/src/vendors/health';
const id = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const request = { id, user_id: id, email: 'trader@example.test', provider: 'docuseal', provider_template_id: '5607795', signer_role: 'First Party' };
const env = { DOCUSEAL_API_KEY: 'doc-key', DOCUSEAL_WEBHOOK_SECRET: 'doc-secret', VERIFF_API_KEY: 'veriff-key', VERIFF_SHARED_SECRET: 'veriff-secret' };
const submission = { id: 10, template: { id: 5607795 }, status: 'completed', completed_at: '2026-09-15T00:00:00Z', submitters: [{ id: 20, external_id: `certa:${id}`, email: 'trader@example.test', role: 'First Party', status: 'completed' }], documents: [{ name: 'Agreement', url: 'https://docuseal.com/file/fixture.pdf' }], audit_log_url: 'https://docuseal.com/file/audit.pdf' };

test('DocuSeal signatures verify exact bytes, timestamp and HMAC without a legacy header bypass', () => {
  const bytes = Buffer.from('{"event_type":"form.completed"}'); const time = 1770000000;
  const signature = createHmac('sha256', env.DOCUSEAL_WEBHOOK_SECRET).update(`${time}.`).update(bytes).digest('hex');
  const headers = new Headers({ 'X-Docuseal-Signature': `${time}.${signature}` });
  verifyCallback('docuseal', bytes, headers, env, time * 1000);
  assert.throws(() => verifyCallback('docuseal', Buffer.concat([bytes, Buffer.from(' ')]), headers, env, time * 1000));
  assert.throws(() => verifyCallback('docuseal', bytes, headers, env, (time + 301) * 1000));
  assert.throws(() => verifyCallback('docuseal', bytes, new Headers({ 'X-Docuseal-Secret': 'doc-secret' }), env, time * 1000));
});
test('Veriff callbacks require both the correct integration key and body signature', () => {
  const bytes = Buffer.from('{"verification":{"id":"fixture"}}');
  const signature = createHmac('sha256', env.VERIFF_SHARED_SECRET).update(bytes).digest('hex');
  verifyCallback('veriff', bytes, new Headers({ 'X-AUTH-CLIENT': 'veriff-key', 'X-HMAC-SIGNATURE': signature }), env);
  assert.throws(() => verifyCallback('veriff', bytes, new Headers({ 'X-AUTH-CLIENT': 'other-key', 'X-HMAC-SIGNATURE': signature }), env));
  assert.throws(() => verifyCallback('veriff', Buffer.from('{}'), new Headers({ 'X-AUTH-CLIENT': 'veriff-key', 'X-HMAC-SIGNATURE': signature }), env));
});
test('callback normalization keeps only provider IDs/correlation and deduplication digest', () => {
  const body = { event_type: 'form.completed', data: { id: 20, submission_id: 10, external_id: `certa:${id}`, values: [{ field: 'SSN', value: 'SENSITIVE' }], email: 'private@example.test' } };
  const bytes = Buffer.from(JSON.stringify(body));
  const hint = callbackHint('docuseal', body, bytes)!;
  assert.equal(hint.providerId, '10'); assert.equal(hint.requestId, id);
  assert.ok(!JSON.stringify(hint).includes('SENSITIVE')); assert.ok(!JSON.stringify(hint).includes('private@example'));
  assert.deepEqual(callbackHint('docuseal', body, bytes), hint);
  assert.equal(callbackHint('docuseal', { ...body, event_type: 'form.viewed' }, bytes), null);
});
test('document verification requires submission completion, pinned template, signer and correlation', async () => {
  let current: unknown = submission;
  const client = new ContractProviders(async () => {}, env, async () => Response.json(current));
  assert.equal((await client.verify(request, '10')).state, 'approved');
  assert.equal((await client.verify(request, '10')).artifacts.length, 2);
  current = { ...submission, submitters: [...submission.submitters, { id: 21, status: 'awaiting' }] };
  assert.equal((await client.verify(request, '10')).state, 'pending');
  for (const change of [{ template: { id: 999 } }, { submitters: [{ ...submission.submitters[0], external_id: `certa:${session}` }] }, { submitters: [{ ...submission.submitters[0], email: 'other@example.test' }] }]) {
    current = { ...submission, ...change }; await assert.rejects(client.verify(request, '10'));
  }
});
test('creation persists provider submission/signer IDs and suppresses vendor email', async () => {
  const client = new ContractProviders(async () => {}, env, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.send_email, false); assert.equal(body.send_sms, false);
    assert.equal(body.submitters[0].external_id, `certa:${id}`);
    assert.equal(body.submitters[0].completed, undefined);
    return Response.json([{ id: 20, submission_id: 10, email: request.email, external_id: `certa:${id}`, embed_src: 'https://docuseal.com/s/fixture' }]);
  });
  assert.deepEqual(await client.create(request), { providerId: '10', signerId: '20', launchUrl: 'https://docuseal.com/s/fixture' });
  assert.equal(client.writeAccepted, true);
});
test('provider writes are attempted once and failed result parsing remains ambiguous', async () => {
  let calls = 0;
  const client = new ContractProviders(async () => {}, env, async () => { calls++; throw new Error('secret'); });
  await assert.rejects(client.create(request), (error: unknown) => error instanceof ProviderFailure && error.ambiguous && !error.message.includes('secret'));
  assert.equal(calls, 1);
  const invalid = new ContractProviders(async () => {}, env, async () => Response.json({ wrong: true }));
  await assert.rejects(invalid.create(request)); assert.equal(invalid.writeAccepted, true);
  for (const url of ['http://docuseal.com/s/test','https://evil.example/s/test','https://docuseal.com@evil.example/','https://docuseal.com.evil.example/']) assert.throws(() => safeProviderUrl('docuseal', url));
});
test('Veriff decision reads use session HMAC and never approve a mismatched session owner', async () => {
  let match = true;
  const client = new ContractProviders(async () => {}, env, async (_url, init) => {
    assert.equal((init?.headers as Record<string,string>)['X-HMAC-SIGNATURE'], createHmac('sha256', env.VERIFF_SHARED_SECRET).update(session).digest('hex'));
    return Response.json({ verification: { id: session, vendorData: `certa:${match ? id : session}`, endUserId: id, status: 'approved', decisionTime: '2026-09-15T00:00:00Z', person: { idNumber: 'PRIVATE' } } });
  });
  const result = await client.verify({ ...request, provider: 'veriff' }, session);
  assert.equal(result.state, 'approved'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  match = false; await assert.rejects(client.verify({ ...request, provider: 'veriff' }, session));
});
test('contracts secrets only reach their worker/webhook owner, never clients or Tradara', () => {
  const settings = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_for_tests', WEB_ORIGIN: 'http://localhost:3200', ADMIN_ORIGIN: 'http://localhost:3201', API_ORIGIN: 'http://localhost:3200', ...env, DOCUSEAL_HEALTH_API_KEY: 'health-secret' };
  for (const app of ['web','admin','contracts','tradara','mobile']) {
    const result = environmentFor(app, settings, {});
    assert.equal(result.DOCUSEAL_API_KEY === 'doc-key', app === 'contracts');
    assert.equal(result.VERIFF_SHARED_SECRET === 'veriff-secret', ['contracts','web'].includes(app));
    assert.equal(result.DOCUSEAL_WEBHOOK_SECRET === 'doc-secret', app === 'web');
    assert.equal(result.DOCUSEAL_HEALTH_API_KEY === 'health-secret', app === 'admin');
  }
});
test('Veriff public status is explicitly scoped; DocuSeal probe uses separate read credentials', async () => {
  const check = createHealthChecker(async (url, init) => {
    if (String(url).includes('status.veriff.com')) { assert.deepEqual(init?.headers, {}); return Response.json({ status: { indicator: 'minor' } }); }
    assert.equal((init?.headers as Record<string,string>)['X-Auth-Token'], 'health-key');
    return Response.json({ data: [] });
  }, { VERIFF_HEALTH_ENABLED: 'true', DOCUSEAL_HEALTH_API_KEY: 'health-key' });
  assert.equal((await check('veriff')).status, 'degraded');
  assert.equal((await check('docuseal')).status, 'healthy');
});

test('a null Veriff decision cannot be used to bind an unknown provider session', async () => {
  const client = new ContractProviders(async () => {}, env, async () => Response.json({ verification: null }));
  await assert.rejects(client.verify({ ...request, provider: 'veriff', provider_id: null }, session));
  assert.equal((await client.verify({ ...request, provider: 'veriff', provider_id: session }, session)).state, 'pending');
});
