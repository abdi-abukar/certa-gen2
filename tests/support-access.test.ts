import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { canSupport, openSupport, sealSupport, supportTargetAllowed, validateSupportSession, type SupportGrant, type SupportProof } from '../packages/server/src/support-access';

test('support access requires fresh staff grants and distinguishes list from login permission', () => {
  assert.equal(canSupport({ user_metadata: { role: 'super_admin' } }, 'login'), false);
  assert.equal(canSupport({ role: 'user', support_permissions: ['support:*'] }, 'login'), false);
  assert.equal(canSupport({ role: 'certa_admin', certa_pages: ['tickets'] }, 'login'), false);
  assert.equal(canSupport({ role: 'certa_admin', support_permissions: ['support:read'] }, 'read'), true);
  assert.equal(canSupport({ role: 'certa_admin', support_permissions: ['support:read'] }, 'login'), false);
  assert.equal(canSupport({ role: 'certa_admin', support_permissions: ['support:login'] }, 'login'), true);
  assert.equal(canSupport({ role: 'certa_admin', certa_pages: ['users'] }, 'login'), true);
  assert.equal(canSupport({ role: 'super_admin' }, 'login'), true);
});

test('support links conceal OTPs, reject tampering, expire, and cannot substitute for session proofs', async () => {
  const oldKey = process.env.SUPABASE_SECRET_KEY, oldUrl = process.env.CERTA_SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = 'fixture-support-secret'; process.env.CERTA_SUPABASE_URL = 'https://fixture.example.test';
  try {
    const grant: SupportGrant = { actor: randomUUID(), target: randomUUID(), expires: Date.now() + 300000, id: randomUUID(), tokenHash: 'a'.repeat(64) };
    const token = sealSupport(grant, 'link');
    assert.deepEqual(openSupport(token, 'link'), grant);
    assert.equal(Buffer.from(token, 'base64url').includes(Buffer.from(grant.tokenHash)), false);
    assert.throws(() => openSupport(token, 'session'));
    assert.throws(() => openSupport(token, 'link', grant.expires));
    assert.throws(() => openSupport(token, 'link', grant.expires - 301000));
    const bytes = Buffer.from(token, 'base64url'); bytes[45] ^= 1;
    assert.throws(() => openSupport(bytes.toString('base64url'), 'link'));
    const proof: SupportProof = { actor: grant.actor, target: grant.target, id: grant.id, session: randomUUID(), expires: Date.now() + 1800000 };
    const session = sealSupport(proof, 'session');
    assert.throws(() => openSupport(session, 'link'));
    const user = { id: proof.target, email: 'fixture@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: {} } as any;
    await assert.rejects(() => validateSupportSession(session, { ...user, id: randomUUID() }, proof.session), /support_session_invalid/);
    await assert.rejects(() => validateSupportSession(session, user, randomUUID()), /support_session_invalid/);
    process.env.SUPABASE_SECRET_KEY = 'rotated-key';
    assert.throws(() => openSupport(token, 'link'));
  } finally {
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
    if (oldUrl === undefined) delete process.env.CERTA_SUPABASE_URL; else process.env.CERTA_SUPABASE_URL = oldUrl;
  }
});

test('staff, unconfirmed, email-less and banned accounts cannot be support targets', () => {
  const user = { email: 'fixture@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: {} } as any;
  assert.equal(supportTargetAllowed(user), true);
  assert.equal(supportTargetAllowed({ ...user, app_metadata: { role: 'certa_admin' } }), false);
  assert.equal(supportTargetAllowed({ ...user, email_confirmed_at: null }), false);
  assert.equal(supportTargetAllowed({ ...user, email: null }), false);
  assert.equal(supportTargetAllowed({ ...user, banned_until: new Date(Date.now() + 60000).toISOString() }), false);
});
