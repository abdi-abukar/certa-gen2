import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { environmentFor, root } from '../scripts/environment.mjs';

// A local GoTrue fixture exercises the built Next apps. No live Supabase calls.
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const kid = randomUUID();
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' };
const trader = { id: randomUUID(), email: 'trader@example.test', app_metadata: {}, user_metadata: { role: 'admin' }, aud: 'authenticated', created_at: new Date().toISOString() };
const staff = { ...trader, id: randomUUID(), email: 'staff@example.test', app_metadata: { role: 'certa_admin' }, user_metadata: {} };
const users = new Map([trader, staff].map(user => [user.id, user]));
const tokens = new Map();
let authOrigin;
let refreshes = 0;
const tradingAccounts = [
  { id: randomUUID(), user_id: trader.id, vendor_id: 'vendor-trader', firm_id: 'fixture-firm', lifecycle: 'active', kind: 'evaluation' },
  { id: randomUUID(), user_id: staff.id, vendor_id: 'vendor-staff', firm_id: 'fixture-firm', lifecycle: 'active', kind: 'evaluation' },
];
const contractRequests = [
 { id: randomUUID(), user_id: trader.id, kind: 'sim_funded', requirement: 'agreement', version: 'v1', provider: 'docuseal', provider_id: '10', state: 'pending', email: 'private@example.test', launch_url: 'https://docuseal.com/s/private-fixture', artifacts: [] },
 { id: randomUUID(), user_id: staff.id, kind: 'w9', requirement: 'tax', version: 'v1', provider: 'docuseal', provider_id: '11', state: 'approved', email: 'staff-private@example.test', artifacts: [{ name: 'Tax form', url: 'https://docuseal.com/file/private-tax.pdf' }] },
];
const payoutRequests = [trader, staff].map(user => ({ id: randomUUID(), user_id: user.id, kind: 'trader', state: 'requested', amount_cents: 25000, currency: 'USD', method_snapshot: { kind: 'bank', label: 'Bank', masked: '1234', encrypted: 'PRIVATE_DESTINATION' }, eligibility: { evidence: 'STAFF_EVIDENCE' } }));
const contentRewards=[trader,staff].map(user=>({id:randomUUID(),user_id:user.id,puzzle_id:randomUUID(),reward_ticket_id:'ticket-definition',state:'pending'}));
const awardIssues=[trader,staff].map(u=>({id:randomUUID(),user_id:u.id,award_id:'trophy',source:'fixture',fields:{name:'CERTA TRADER'}}));
const enqueued = [];
const discordLinks=[trader,staff].map((user,index)=>({user_id:user.id,discord_id:index?'234567890123456789':'123456789012345678',username:index?'staff-discord':'trader-discord',state:'linked',generation:randomUUID(),daily_pnl:false,milestones:false,show_amount:false}));
const discordSigning=generateKeyPairSync('ed25519');
const discordPublic=discordSigning.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');

function session(user, expired = false) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: `${authOrigin}/auth/v1`, sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: user.app_metadata, aal: 'aal1', iat: now - (expired ? 7200 : 0), exp: now + (expired ? -3600 : 3600) };
  const encoded = [ { alg: 'ES256', kid, typ: 'JWT' }, payload ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const access_token = `${encoded}.${sign('sha256', Buffer.from(encoded), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  tokens.set(access_token, user.id);
  return { access_token, refresh_token: `fixture-refresh-${user.id}`, expires_in: expired ? -3600 : 3600, expires_at: payload.exp, token_type: 'bearer', user };
}
const auth = createServer(async (request, response) => {
  const url = new URL(request.url, authOrigin ?? 'http://localhost');
  response.setHeader('Content-Type', 'application/json');
  const send = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
  if (url.pathname.startsWith('/auth/v1/admin/users')) {
    if(request.headers.apikey !== 'fixture-server-secret') return send(401,{message:'Invalid key'});
    const id=url.pathname.split('/')[5];
    if(!id) return send(200,{users:[...users.values()],aud:'authenticated'});
    const found=users.get(id); if(!found)return send(404,{message:'Not found'});
    if(request.method==='PUT') {
      let raw='';for await(const chunk of request)raw+=chunk;
      const body=JSON.parse(raw);const updated={...found,app_metadata:body.app_metadata,updated_at:new Date().toISOString()};users.set(id,updated);return send(200,updated);
    }
    return send(200,found);
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    if (request.headers.apikey !== 'fixture-server-secret') return send(401, { message: 'Invalid fixture key' });
    if(url.pathname==='/rest/v1/ca_issues'){let rows=awardIssues;for(const field of ['user_id','id'])if(url.searchParams.has(field))rows=rows.filter(r=>r[field]===url.searchParams.get(field).slice(3));if(request.headers.accept?.includes('vnd.pgrst.object'))return rows.length?send(200,rows[0]):send(406,{message:'not found'});return send(200,rows);}
    if(url.pathname==='/rest/v1/ca_renders'||url.pathname==='/rest/v1/ca_templates'||url.pathname==='/rest/v1/ca_catalog')return send(200,[]);
    if(url.pathname.startsWith('/rest/v1/rpc/ca_'))return send(200,true);
    if(url.pathname==='/rest/v1/cn_puzzle_rewards'){let rows=contentRewards; for(const field of ['user_id','puzzle_id'])if(url.searchParams.has(field))rows=rows.filter(r=>r[field]===url.searchParams.get(field).slice(3));return send(200,rows);}
    if(url.pathname==='/rest/v1/cn_issues'||url.pathname==='/rest/v1/cn_puzzles')return send(200,[]);
    if(url.pathname==='/rest/v1/cd_links') {
      let rows=discordLinks;for(const field of ['user_id','discord_id'])if(url.searchParams.has(field))rows=rows.filter(row=>row[field]===url.searchParams.get(field).slice(3));
      const fields=url.searchParams.get('select');if(fields&&fields!=='*')rows=rows.map(row=>Object.fromEntries(fields.split(',').map(field=>[field,row[field]])));return send(200,rows);
    }
    if(['/rest/v1/cd_jobs','/rest/v1/cd_runtime','/rest/v1/cd_roles','/rest/v1/cd_audit'].includes(url.pathname)) return send(200,[]);
    if(url.pathname.startsWith('/rest/v1/rpc/cd_')) {
      let raw='';for await(const chunk of request)raw+=chunk;const payload=JSON.parse(raw);enqueued.push({rpc:url.pathname,...payload});return send(200,true);
    }
    if (url.pathname === '/rest/v1/cp_payouts') {
      let rows = payoutRequests;
      for (const field of ['id', 'user_id']) if (url.searchParams.has(field)) rows = rows.filter(row => row[field] === url.searchParams.get(field).slice(3));
      return send(200, rows);
    }
    if (url.pathname === '/rest/v1/cp_events') return send(200, []);
    if (url.pathname === '/rest/v1/rpc/cp_command') {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw); enqueued.push(payload); return send(200, { id: randomUUID() });
    }
    if (url.pathname === '/rest/v1/cc_requests') {
      let rows = contractRequests;
      for (const field of ['id', 'user_id']) if (url.searchParams.has(field)) rows = rows.filter(row => row[field] === url.searchParams.get(field).slice(3));
      const fields = url.searchParams.get('select');
      if (fields && fields !== '*') rows = rows.map(row => Object.fromEntries(fields.split(',').map(field => [field, row[field]])));
      return send(200, rows);
    }
    if (['cc_begin','cc_callback','cc_refresh'].some(name => url.pathname === `/rest/v1/rpc/${name}`)) {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw); enqueued.push(payload);
      return send(200, { ...contractRequests[0], user_id: payload.p_user ?? trader.id });
    }
    if (url.pathname === '/rest/v1/ct_accounts') {
      let rows = tradingAccounts;
      for (const field of ['id', 'user_id']) if (url.searchParams.has(field)) rows = rows.filter(row => row[field] === url.searchParams.get(field).slice(3));
      return send(200, rows);
    }
    if (url.pathname === '/rest/v1/ct_memberships' || url.pathname === '/rest/v1/ct_records') return send(200, []);
    if (url.pathname === '/rest/v1/rpc/ct_enqueue') {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw); enqueued.push(payload); return send(200, { id: randomUUID(), action: payload.p_action, state: 'queued' });
    }
    if (['ct_reserve', 'ct_grant_account', 'ct_record_compliance', 'ct_allocation_snapshot'].some(name => url.pathname === `/rest/v1/rpc/${name}`)) {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw); enqueued.push(payload);
      return send(200, { id: randomUUID(), user_id: payload.p_user, occupied: 1, available: 2 });
    }
    if (url.pathname === '/rest/v1/rpc/ct_ingest') return send(200, 'applied');
    return send(404, { message: 'Unknown fixture table' });
  }
  if (url.pathname.endsWith('/.well-known/jwks.json')) return send(200, { keys: [jwk] });
  if (url.pathname.endsWith('/user')) {
    const id = tokens.get(request.headers.authorization?.replace(/^Bearer /i, ''));
    return id ? send(200, users.get(id)) : send(401, { message: 'Invalid token' });
  }
  if (url.pathname.endsWith('/logout')) { response.statusCode = 204; return response.end(); }
  if (url.pathname.endsWith('/token')) {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || '{}');
    const user = body.refresh_token ? users.get(body.refresh_token.replace('fixture-refresh-', '')) : [...users.values()].find(user => user.email === body.email && body.password === 'fixture-password');
    if (body.refresh_token) refreshes++;
    return user ? send(200, session(user)) : send(400, { error_code: 'invalid_credentials', msg: 'Invalid credentials' });
  }
  send(404, { message: 'Fixture route not found' });
});
const children = [];
async function freePort() {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port;
}
async function start(app, port, settings) {
  const directory = join(root, 'apps', app);
  const require = createRequire(join(directory, 'package.json'));
  const environment = environmentFor(app, settings, { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' });
  if (app === 'web') {
    // Vercel starts functions without the local launcher: only canonical settings
    // are supplied, and instrumentation must initialize auth/origins at runtime.
    for (const name of Object.keys(environment)) if (name.startsWith('CERTA_')) delete environment[name];
    Object.assign(environment, settings);
  }
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: directory, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`The ${app} server exited: ${output.slice(-2000)}`);
    try { if ((await fetch(`${origin}/login`)).ok) return origin; } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`The ${app} server did not start: ${output.slice(-2000)}`);
}
function cookie(app, value) { return `certa-${app}-auth=base64-${Buffer.from(JSON.stringify(value)).toString('base64url')}`; }
function hiddenInputs(html) {
  const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
  const decode = value => value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
  const body = new FormData();
  for (const match of form.matchAll(/<input\b[^>]*>/g)) {
    const name = match[0].match(/name="([^"]*)"/)?.[1];
    if (name?.startsWith('$ACTION')) body.set(decode(name), decode(match[0].match(/value="([^"]*)"/)?.[1] ?? ''));
  }
  assert.ok([...body.keys()].length, 'Expected a real Next Server Action form');
  return body;
}

try {
  auth.listen(0, '127.0.0.1'); await once(auth, 'listening');
  authOrigin = `http://127.0.0.1:${auth.address().port}`;
  const webPort = await freePort(); const adminPort = await freePort();
  const settings = { NEWSLETTER_POSTAL_ADDRESS:'100 Synthetic Street',PUZZLE_ANSWER_KEY:'synthetic-fixture-key-32-characters', DISCORD_CLIENT_ID:'345678901234567890',DISCORD_GUILD_ID:'456789012345678901',DISCORD_PUBLIC_KEY:discordPublic, DOCUSEAL_WEBHOOK_SECRET: 'fixture-docuseal-secret', VERIFF_API_KEY: 'fixture-veriff-key', VERIFF_SHARED_SECRET: 'fixture-veriff-secret', SUPABASE_SECRET_KEY: 'fixture-server-secret', TRADARA_FIRM_ID: 'fixture-firm', TRADARA_WEBHOOK_SECRET: 'fixture-webhook-secret', SUPABASE_URL: authOrigin, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_fixture_only', WEB_ORIGIN: `http://127.0.0.1:${webPort}`, ADMIN_ORIGIN: `http://127.0.0.1:${adminPort}`, API_ORIGIN: `http://127.0.0.1:${webPort}` };
  const web = await start('web', webPort, settings); const admin = await start('admin', adminPort, settings);
  for (const origin of [web, admin]) {
    const response = await fetch(`${origin}/account`, { redirect: 'manual' });
    assert.equal(response.status, 307); assert.equal(new URL(response.headers.get('location'), origin).pathname, '/login');
    assert.match(response.headers.get('cache-control'), /no-store/);
    const login = await fetch(`${origin}/login`); const html = await login.text();
    const nonce = login.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1];
    assert.ok(html.includes(`nonce="${nonce}"`));
    assert.equal(login.headers.get('x-frame-options'), 'DENY');
  }
  console.log('PASS: protected routes redirect guests; CSP nonces and no-store headers are present.');

  const value = session(trader);
  for (const token of [null, 'not-a-jwt', `${value.access_token.slice(0, -8)}tampered`]) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    assert.equal((await fetch(`${web}/api/me`, { headers })).status, 401);
  }
  const me = await fetch(`${web}/api/me`, { headers: { Authorization: `Bearer ${value.access_token}` } });
  assert.equal(me.status, 200); assert.deepEqual(await me.json(), { id: trader.id, email: trader.email });
  assert.equal((await fetch(`${web}/api/me`, { headers: { Origin: 'https://evil.example', Authorization: `Bearer ${value.access_token}` } })).status, 403);
  const preflight = await fetch(`${web}/api/me`, { method: 'OPTIONS', headers: { Origin: settings.ADMIN_ORIGIN } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), settings.ADMIN_ORIGIN);
  assert.equal((await fetch(`${web}/api/me`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:3202' } })).status, 403);
  console.log('PASS: API validates signed JWTs, rejects missing/tampered tokens, and restricts browser origins.');

  const denied = await fetch(`${admin}/account`, { headers: { Cookie: cookie('admin', value) }, redirect: 'manual' });
  assert.equal(new URL(denied.headers.get('location'), admin).pathname, '/forbidden');
  const staffSession = session(staff);
  {
    const owner={...staff,id:randomUUID(),email:'owner@example.test',app_metadata:{role:'super_admin'}};
    const editor={...staff,id:randomUUID(),email:'editor@example.test',app_metadata:{role:'admin',provider:'email'}};
    users.set(owner.id,owner);users.set(editor.id,editor);
    const ownerSession=session(owner);
    const ownerHeaders={Cookie:cookie('admin',ownerSession),Origin:admin,'Content-Type':'application/json'};
    for(const [current,status] of [[null,401],[value,403],[staffSession,403]])assert.equal((await fetch(`${admin}/api/staff`,{headers:current?{Cookie:cookie('admin',current)}:{}})).status,status);
    const list=await fetch(`${admin}/api/staff`,{headers:ownerHeaders});assert.equal(list.status,200);
    const directory=await list.json();assert.ok(!directory.items.some(item=>item.id===trader.id));assert.ok(directory.items.every(item=>!('app_metadata' in item)));
    const target=directory.items.find(item=>item.id===editor.id);
    const change={id:editor.id,revision:target.revision,role:'staff',permissions:['content:read','content:write','content:publish']};
    const post=(body,headers=ownerHeaders)=>fetch(`${admin}/api/staff`,{method:'POST',headers,body:JSON.stringify(body)});
    assert.equal((await post(change,{...ownerHeaders,Origin:'https://evil.example'})).status,403);
    assert.equal((await post({...change,permissions:['staff:*']})).status,400);
    assert.equal((await post({...change,revision:'stale'})).status,409);
    assert.equal((await post({...change,id:owner.id})).status,403);
    const saved=await post(change);assert.equal(saved.status,200);assert.equal(users.get(editor.id).app_metadata.provider,'email');
    assert.equal((await post(change)).status,409);
    assert.equal((await fetch(`${admin}/api/content/newsletter/templates`,{headers:ownerHeaders})).status,200);
    users.set(owner.id,{...owner,app_metadata:{role:'admin'}});
    assert.equal((await fetch(`${admin}/api/staff`,{headers:ownerHeaders})).status,403,'stale master token must not preserve access');
    assert.equal((await post(change)).status,403);
    users.delete(owner.id);users.delete(editor.id);
    console.log('PASS: master-only staff directory and edits, protected owners, input validation, stale edits, fresh revocation and master content access.');
  }

  {
  // Discord routes use owner identity and independently granted staff permissions.
  assert.equal((await fetch(`${web}/api/community/status`)).status,401);
  const community=await fetch(`${web}/api/community/status`,{headers:{Authorization:`Bearer ${value.access_token}`}});
  assert.equal(community.status,200);const communityBody=await community.json();assert.equal(communityBody.link.user_id,trader.id);assert.equal(communityBody.link.generation,undefined);
  assert.equal((await fetch(`${web}/api/community/users/${staff.id}/status`,{headers:{Authorization:`Bearer ${value.access_token}`}})).status,404);
  assert.equal((await fetch(`${admin}/api/community/links`,{headers:{Authorization:`Bearer ${value.access_token}`}})).status,403);
  assert.equal((await fetch(`${admin}/api/community/links`,{headers:{Authorization:`Bearer ${staffSession.access_token}`}})).status,403);
  staff.app_metadata.discord_permissions=['discord:read'];
  assert.equal((await fetch(`${admin}/api/community/links`,{headers:{Authorization:`Bearer ${staffSession.access_token}`}})).status,200);
  const discordPost=(origin,path,body,token=staffSession.access_token)=>fetch(`${origin}/api/community/${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await discordPost(admin,`users/${trader.id}/disconnect`,{reason:'Staff unlink test'})).status,403);
  staff.app_metadata.discord_permissions=['discord:manage'];
  assert.equal((await discordPost(admin,`users/${trader.id}/disconnect`,{reason:'Staff unlink test'})).status,202);
  assert.equal(enqueued.at(-1).p_user,trader.id);assert.equal(enqueued.at(-1).p_actor,staff.id);
  assert.equal((await discordPost(admin,'roles/funded',{role_id:'567890123456789012',reason:'Fixture mapping'})).status,403);
  assert.equal((await discordPost(web,'preferences',{daily_pnl:false,milestones:true,show_amount:false,user_id:staff.id},value.access_token)).status,400);
  assert.equal((await discordPost(web,'disconnect',{},value.access_token)).status,202);assert.equal(enqueued.at(-1).p_user,trader.id);
  assert.equal((await fetch(`${web}/api/community/disconnect`,{method:'POST',headers:{Cookie:cookie('web',value),'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'})).status,403);
  assert.equal((await fetch(`${web}/api/community/callback?state=wrong&code=wrong`,{headers:{Cookie:cookie('web',value)}})).status,403);
  const feed=await fetch(`${web}/api/community/live`);assert.equal(feed.status,200);assert.deepEqual((await feed.json()).feed,[]);
  const ping=JSON.stringify({type:1}),stamp=String(Math.floor(Date.now()/1000));const signature=sign(null,Buffer.from(stamp+ping),discordSigning.privateKey).toString('hex');
  const interaction=await fetch(`${web}/api/discord/interactions`,{method:'POST',headers:{'Content-Type':'application/json','x-signature-ed25519':signature,'x-signature-timestamp':stamp},body:ping});assert.equal(interaction.status,200);assert.deepEqual(await interaction.json(),{type:1});
  assert.equal((await fetch(`${web}/api/discord/interactions`,{method:'POST',headers:{'Content-Type':'application/json','x-signature-ed25519':signature,'x-signature-timestamp':stamp},body:'{"type":2}'})).status,401);
  assert.equal((await fetch(`${admin}/discord`,{headers:{Cookie:cookie('admin',staffSession)}})).status,200);
  console.log('PASS: Discord owner isolation, separate staff permissions, disconnect identity, Origin controls, private metadata and signed interactions.');
  }

  {
  assert.equal((await fetch(`${web}/api/awards/issues`)).status,401);
  const list=await fetch(`${web}/api/awards/issues?user_id=${staff.id}`,{headers:{Authorization:`Bearer ${value.access_token}`}});assert.equal(list.status,200);assert.deepEqual((await list.json()).items.map(r=>r.user_id),[trader.id]);
  assert.equal((await fetch(`${web}/api/awards/issues/${awardIssues[1].id}`,{headers:{Authorization:`Bearer ${value.access_token}`}})).status,404);
  const ah={Cookie:cookie('admin',staffSession),Origin:admin,'Content-Type':'application/json'};
  assert.equal((await fetch(`${admin}/api/awards/templates`,{headers:ah})).status,403);
  staff.app_metadata.awards_permissions=['awards:read'];
  assert.equal((await fetch(`${admin}/api/awards/templates`,{headers:ah})).status,200);
  assert.equal((await fetch(`${admin}/api/awards/preview`,{method:'POST',headers:ah,body:'{"template":"passed","copy":{}}'})).status,403);
  staff.app_metadata.awards_permissions.push('awards:write');
  const art=await fetch(`${admin}/api/awards/preview`,{method:'POST',headers:ah,body:'{"template":"passed","copy":{}}'});assert.equal(art.status,200);assert.ok((await art.json()).image.startsWith('data:image/png;base64,'));
  assert.equal((await fetch(`${admin}/api/awards/preview`,{method:'POST',headers:{...ah,Origin:'https://evil.example'},body:'{"template":"passed","copy":{}}'})).status,403);
  assert.equal((await fetch(`${admin}/api/awards/publish/passed`,{method:'POST',headers:ah,body:'{"revision":1,"data":{},"reason":"Reviewed"}'})).status,403);
  const scene=await fetch(`${admin}/game/index.html`);assert.equal(scene.status,200);assert.equal(scene.headers.get('x-frame-options'),'SAMEORIGIN');assert.ok(scene.headers.get('content-security-policy').includes("frame-ancestors 'self'"));
  assert.equal((await fetch(`${admin}/awards`,{headers:ah})).status,200);
  delete staff.app_metadata.awards_permissions;
  console.log('PASS: awards ownership, live staff permissions, protected publishing, server PNG rendering and same-origin scenes.');
  }
  assert.equal((await fetch(`${web}/api/payouts/requests`)).status, 401);
  assert.equal((await fetch(`${admin}/api/payouts/requests`, { headers: { Cookie: cookie('admin', value) } })).status, 403);
  assert.equal((await fetch(`${admin}/api/payouts/requests`, { headers: { Cookie: cookie('admin', staffSession) } })).status, 403);
  const payoutHeaders = { Authorization: `Bearer ${value.access_token}` };
  const ownPayouts = await fetch(`${web}/api/payouts/requests?user_id=${staff.id}`, { headers: payoutHeaders });
  assert.equal(ownPayouts.status, 200);
  const ownPayoutBody = await ownPayouts.json();
  assert.equal(ownPayoutBody.items.length, 1); assert.equal(ownPayoutBody.items[0].id, payoutRequests[0].id);
  assert.ok(!JSON.stringify(ownPayoutBody).includes('PRIVATE_DESTINATION')); assert.ok(!JSON.stringify(ownPayoutBody).includes('STAFF_EVIDENCE'));
  assert.equal((await fetch(`${web}/api/payouts/requests/${payoutRequests[1].id}`, { headers: payoutHeaders })).status, 404);
  assert.equal((await fetch(`${web}/api/payouts/requests/${payoutRequests[0].id}`, { headers: payoutHeaders })).status, 200);
  assert.equal((await fetch(`${web}/api/payouts/requests/${payoutRequests[0].id}/destination`, { headers: payoutHeaders })).status, 404);
  assert.equal((await fetch(`${web}/api/payouts/affiliates/enroll`, { method: 'POST', headers: { Cookie: cookie('web', value), 'Content-Type': 'application/json', 'Idempotency-Key': 'payout-enroll-001' }, body: '{}' })).status, 403);
  const enrollment = await fetch(`${web}/api/payouts/affiliates/enroll`, { method: 'POST', headers: { ...payoutHeaders, 'Content-Type': 'application/json', 'Idempotency-Key': 'payout-enroll-001' }, body: '{}' });
  assert.equal(enrollment.status, 202); assert.equal(enqueued.at(-1).p_user, trader.id);
  staff.app_metadata.payout_permissions = ['payouts:read'];
  assert.equal((await fetch(`${admin}/api/payouts/requests`, { headers: { Cookie: cookie('admin', staffSession) } })).status, 200);
  assert.equal((await fetch(`${admin}/api/payouts/requests/${payoutRequests[0].id}/approve`, { method: 'POST', headers: { Cookie: cookie('admin', staffSession), Origin: admin, 'Content-Type': 'application/json', 'Idempotency-Key': 'payout-approve-001' }, body: JSON.stringify({ cap_offset: '0', reason: 'Review' }) })).status, 403);
  delete staff.app_metadata.payout_permissions;
  console.log('PASS: payout ownership, staff permissions, destination secrecy, Origin enforcement and authenticated enrollment.');
  assert.equal((await fetch(`${admin}/api/content/newsletter/templates`)).status,401);
  assert.equal((await fetch(`${admin}/api/content/newsletter/templates`,{headers:{Authorization:`Bearer ${value.access_token}`}})).status,403);
  assert.equal((await fetch(`${admin}/api/content/newsletter/templates`,{headers:{Cookie:cookie('admin',staffSession)}})).status,403);
  staff.app_metadata.content_permissions=['content:read'];
  assert.equal((await fetch(`${admin}/puzzles`,{redirect:'manual'})).status,307);
  assert.equal((await fetch(`${admin}/api/content/puzzles`,{headers:{Authorization:`Bearer ${value.access_token}`}})).status,403);

  const contentHeaders={Cookie:cookie('admin',staffSession),Origin:admin,'Content-Type':'application/json'};
  const catalogue=await fetch(`${admin}/api/content/newsletter/templates`,{headers:contentHeaders});assert.equal(catalogue.status,200);
  const fixture=(await catalogue.json()).fixture;
  assert.equal((await fetch(`${admin}/api/content/newsletter/render`,{method:'POST',headers:contentHeaders,body:JSON.stringify(fixture)})).status,403);
  assert.equal((await fetch(`${admin}/api/content/puzzles`,{headers:contentHeaders})).status,200);
  assert.equal((await fetch(`${admin}/api/content/puzzles`,{method:'POST',headers:contentHeaders,body:'{}'})).status,403);
  assert.equal((await fetch(`${admin}/api/content/assets`,{method:'POST',headers:contentHeaders,body:'not-an-image'})).status,403);
  staff.app_metadata.content_permissions.push('content:write');
  assert.equal((await fetch(`${admin}/api/content/puzzles/${randomUUID()}/schedule`,{method:'POST',headers:contentHeaders,body:'{"revision":1}'})).status,403);
  assert.equal((await fetch(`${admin}/api/content/assets`,{method:'POST',headers:contentHeaders,body:'not-an-image'})).status,400);

  const preview=await fetch(`${admin}/api/content/newsletter/render`,{method:'POST',headers:contentHeaders,body:JSON.stringify(fixture)});
  assert.equal(preview.status,200);const rendered=await preview.json();assert.match(rendered.html,/<!doctype html>/);assert.match(rendered.html,/100 Synthetic Street/);
  assert.equal((await fetch(`${admin}/api/content/newsletter/render`,{method:'POST',headers:{...contentHeaders,Origin:'https://evil.example'},body:JSON.stringify(fixture)})).status,403);
  assert.equal((await fetch(`${admin}/api/content/newsletter/generate`,{method:'POST',headers:contentHeaders,body:'{}'})).status,403);
  assert.equal((await fetch(`${admin}/api/content/newsletter/issues/${randomUUID()}/live`,{method:'POST',headers:contentHeaders,body:'{"revision":1}'})).status,403);
  const rewardList=await fetch(`${web}/api/content/puzzles/rewards`,{headers:{Authorization:`Bearer ${value.access_token}`}});assert.equal(rewardList.status,200);
  const rewards=(await rewardList.json()).items;assert.equal(rewards.length,1);assert.equal(rewards[0].id,contentRewards[0].id);
  assert.equal((await fetch(`${web}/api/content/puzzles/rewards`)).status,401);
  const puzzleHeaders={Authorization:`Bearer ${value.access_token}`};
  const ownPuzzleRewards=await fetch(`${web}/api/content/puzzles/rewards?puzzle_id=${contentRewards[0].puzzle_id}`,{headers:puzzleHeaders});
  assert.equal(ownPuzzleRewards.status,200);assert.equal((await ownPuzzleRewards.json()).items.length,1);
  const otherPuzzleRewards=await fetch(`${web}/api/content/puzzles/rewards?puzzle_id=${contentRewards[1].puzzle_id}`,{headers:puzzleHeaders});
  assert.equal(otherPuzzleRewards.status,200);assert.deepEqual((await otherPuzzleRewards.json()).items,[]);
  assert.equal((await fetch(`${web}/api/content/puzzles/rewards?puzzle_id=invalid`,{headers:puzzleHeaders})).status,400);

  assert.equal((await fetch(`${web}/api/content/newsletter/issues`)).status,200);
  assert.equal((await fetch(`${web}/api/content/newsletter/unsubscribe?token=bad`)).status,400);
  assert.equal((await fetch(`${web}/api/webhooks/newsletter`,{method:'POST',body:'{}'})).status,503);
  delete staff.app_metadata.content_permissions;
  console.log('PASS: React newsletter preview, content permissions, private reward ownership, origin checks and inactive webhook boundary.');

  assert.equal((await fetch(`${web}/api/trading/accounts`)).status, 401);
  assert.equal((await fetch(`${admin}/api/trading/accounts`, { headers: { Cookie: cookie('admin', value) } })).status, 403);
  const unconfiguredTrading = await fetch(`${web}/api/trading/access`, { headers: { Authorization: `Bearer ${value.access_token}` } });
  assert.equal(unconfiguredTrading.status, 200);
  assert.equal((await unconfiguredTrading.json()).status, 'UNLINKED');
  assert.match(unconfiguredTrading.headers.get('cache-control'), /no-store/);
  assert.equal((await fetch(`${web}/api/trading/invitations/resend`, { method: 'POST', headers: { Cookie: cookie('web', value), Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const ownAccounts = await fetch(`${web}/api/trading/accounts`, { headers: { Authorization: `Bearer ${value.access_token}` } });
  assert.equal(ownAccounts.status, 200); assert.deepEqual(await ownAccounts.json(), [tradingAccounts[0]]);
  assert.equal((await fetch(`${web}/api/trading/accounts/${tradingAccounts[1].id}/summary`, { headers: { Authorization: `Bearer ${value.access_token}` } })).status, 404);
  const staffHeaders = { Cookie: cookie('admin', staffSession), Origin: admin, 'Content-Type': 'application/json', 'Idempotency-Key': 'fixture-lock-1234' };
  const lockBody = JSON.stringify({ reason: 'Fixture lock', expires_at: '2099-01-01T00:00:00Z' });
  assert.equal((await fetch(`${admin}/api/trading/accounts/${tradingAccounts[0].id}/lock`, { method: 'POST', headers: staffHeaders, body: lockBody })).status, 403);
  users.set(staff.id, { ...staff, app_metadata: { ...staff.app_metadata, trading_permissions: ['trading:control'] } });
  const lock = await fetch(`${admin}/api/trading/accounts/${tradingAccounts[0].id}/lock`, { method: 'POST', headers: staffHeaders, body: lockBody });
  assert.equal(lock.status, 202); assert.equal(enqueued.at(-1).p_action, 'lock'); assert.equal(enqueued.at(-1).p_actor, staff.id);
  assert.equal((await fetch(`${admin}/api/trading/accounts/${tradingAccounts[0].id}/force-pass`, { method: 'POST', headers: staffHeaders, body: '{}' })).status, 404);
  const customerHeaders = { Authorization: `Bearer ${value.access_token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'fixture-reservation' };
  const allocation = await fetch(`${web}/api/trading/allocation`, { headers: customerHeaders });
  assert.equal(allocation.status, 200); assert.equal((await allocation.json()).user_id, trader.id);
  assert.match(allocation.headers.get('cache-control'), /no-store/);
  const reserved = await fetch(`${web}/api/trading/reservations`, { method: 'POST', headers: customerHeaders, body: JSON.stringify({ plan_id: '50k', quantity: 1 }) });
  assert.equal(reserved.status, 201); assert.equal(enqueued.at(-1).p_user, trader.id);
  assert.equal((await fetch(`${web}/api/trading/reservations`, { method: 'POST', headers: customerHeaders, body: JSON.stringify({ plan_id: '50k', quantity: 1, user_id: staff.id }) })).status, 400);
  const grantBody = JSON.stringify({ kind: 'funded', plan_reference: 'funded-50k', reason: 'Audited remediation' });
  assert.equal((await fetch(`${web}/api/trading/users/${trader.id}/account-grants`, { method: 'POST', headers: customerHeaders, body: grantBody })).status, 404);
  assert.equal((await fetch(`${admin}/api/trading/users/${trader.id}/account-grants`, { method: 'POST', headers: staffHeaders, body: grantBody })).status, 403);
  users.set(staff.id, { ...staff, app_metadata: { ...staff.app_metadata, trading_permissions: ['trading:provision'] } });
  assert.equal((await fetch(`${admin}/api/trading/users/${trader.id}/account-grants`, { method: 'POST', headers: staffHeaders, body: grantBody })).status, 202);
  assert.equal(enqueued.at(-1).p_actor, staff.id); assert.equal(enqueued.at(-1).p_user, trader.id);
  const replacement = JSON.stringify({ kind: 'funded', plan_reference: 'funded-50k', replace_account_id: tradingAccounts[0].id, reason: 'Replacement' });
  assert.equal((await fetch(`${admin}/api/trading/users/${trader.id}/account-grants`, { method: 'POST', headers: staffHeaders, body: replacement })).status, 403);
  assert.equal((await fetch(`${admin}/api/trading/users/${trader.id}/compliance-evidence`, { method: 'POST', headers: staffHeaders, body: '{}' })).status, 403);
  console.log('PASS: allocation identity isolation, reservation validation and distinct grant/control/compliance permissions.');
  assert.equal((await fetch(`${web}/api/compliance/requests`)).status, 401);
  const ownContracts = await fetch(`${web}/api/compliance/requests`, { headers: customerHeaders });
  assert.equal(ownContracts.status, 200);
  const listedContracts = await ownContracts.json(); assert.equal(listedContracts.length, 1);
  assert.equal(listedContracts[0].email, undefined); assert.equal(listedContracts[0].launch_url, undefined);
  assert.equal((await fetch(`${web}/api/compliance/requests/${contractRequests[1].id}`, { headers: customerHeaders })).status, 404);
  const launch = await fetch(`${web}/api/compliance/requests/${contractRequests[0].id}/launch`, { method: 'POST', headers: customerHeaders, body: '{}' });
  assert.equal(launch.status, 200); assert.match(launch.headers.get('cache-control'), /no-store/);
  assert.equal((await fetch(`${web}/api/compliance/requests`, { method: 'POST', headers: customerHeaders, body: '{"kind":"kyc"}' })).status, 409);
  users.set(trader.id, { ...trader, email_confirmed_at: new Date().toISOString() });
  assert.equal((await fetch(`${web}/api/compliance/requests`, { method: 'POST', headers: customerHeaders, body: '{"kind":"kyc"}' })).status, 202);
  assert.equal(enqueued.at(-1).p_email, trader.email); assert.equal(enqueued.at(-1).p_user, trader.id);
  assert.equal((await fetch(`${web}/api/compliance/requests`, { method: 'POST', headers: customerHeaders, body: '{"kind":"kyc","user_id":"other"}' })).status, 400);
  assert.equal((await fetch(`${admin}/api/compliance/requests/${contractRequests[1].id}`, { headers: staffHeaders })).status, 403);
  users.set(staff.id, { ...staff, app_metadata: { ...staff.app_metadata, compliance_permissions: ['compliance:read'] } });
  assert.equal((await fetch(`${admin}/api/compliance/requests/${contractRequests[1].id}`, { headers: staffHeaders })).status, 200);
  assert.equal((await fetch(`${admin}/api/compliance/requests/${contractRequests[1].id}/documents`, { headers: staffHeaders })).status, 403);
  assert.equal((await fetch(`${admin}/api/compliance/templates/w9`, { method: 'POST', headers: staffHeaders, body: '{}' })).status, 403);
  const docEvent = JSON.stringify({ event_type: 'form.completed', data: { submission_id: 10, external_id: `certa:${contractRequests[0].id}`, values: [{ value: 'PRIVATE-TAX-DATA' }] } });
  const docTimestamp = Math.floor(Date.now()/1000);
  const docSignature = createHmac('sha256','fixture-docuseal-secret').update(`${docTimestamp}.`).update(docEvent).digest('hex');
  const docHeaders = { 'Content-Type': 'application/json', 'X-Docuseal-Signature': `${docTimestamp}.${docSignature}` };
  assert.equal((await fetch(`${web}/api/webhooks/docuseal`, { method: 'POST', headers: docHeaders, body: docEvent })).status, 200);
  assert.ok(!JSON.stringify(enqueued.at(-1)).includes('PRIVATE-TAX-DATA'));
  assert.equal((await fetch(`${web}/api/webhooks/docuseal`, { method: 'POST', headers: docHeaders, body: docEvent+' ' })).status, 401);
  const veriffEvent = JSON.stringify({ verification: { id: contractRequests[0].id, vendorData: `certa:${contractRequests[0].id}`, status: 'approved' } });
  const veriffHeaders = { 'Content-Type': 'application/json', 'X-AUTH-CLIENT': 'fixture-veriff-key', 'X-HMAC-SIGNATURE': createHmac('sha256','fixture-veriff-secret').update(veriffEvent).digest('hex') };
  assert.equal((await fetch(`${web}/api/webhooks/veriff`, { method: 'POST', headers: veriffHeaders, body: veriffEvent })).status, 200);
  assert.equal((await fetch(`${web}/api/webhooks/veriff`, { method: 'POST', headers: { ...veriffHeaders, 'X-AUTH-CLIENT': 'wrong' }, body: veriffEvent })).status, 401);
  console.log('PASS: compliance owner isolation, verified email, private links, granular staff permissions and authenticated webhook inboxes.');
  const event = JSON.stringify({ event_id: 'evt-fixture', type: 'accounts.passed', firm_id: 'fixture-firm', account_id: 'vendor-trader', created_at: Date.now(), data: { status: 'PASSED' } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', 'fixture-webhook-secret').update(`${timestamp}.`).update(event).digest('hex');
  const eventHeaders = { 'Content-Type': 'application/json', 'Tradara-Event-Id': 'evt-fixture', 'Tradara-Signature': `t=${timestamp},v1=${signature}` };
  assert.equal((await fetch(`${web}/api/webhooks/tradara`, { method: 'POST', headers: eventHeaders, body: event })).status, 200);
  assert.equal((await fetch(`${web}/api/webhooks/tradara`, { method: 'POST', headers: eventHeaders, body: event + ' ' })).status, 401);
  console.log('PASS: trading ownership, granular staff controls, no force-pass route, and signed webhooks work through real Next HTTP routes.');

  const allowed = await fetch(`${admin}/account`, { headers: { Cookie: cookie('admin', staffSession) }, redirect: 'manual' });
  assert.equal(allowed.status, 200); assert.match(await allowed.text(), /staff@example.test/);
  for (const [current, expected] of [[null, 401], [value, 403], [staffSession, 503]]) {
    const response = await fetch(`${admin}/api/vendors/tradara/health`, { headers: current ? { Cookie: cookie('admin', current) } : {} });
    assert.equal(response.status, expected); assert.match(response.headers.get('cache-control'), /no-store/);
    if (expected === 503) assert.equal((await response.json()).status, 'not_configured');
  }
  assert.equal((await fetch(`${admin}/api/vendors/unknown/health`, { headers: { Cookie: cookie('admin', staffSession) } })).status, 404);
  const vendorPage = await fetch(`${admin}/vendors`, { headers: { Cookie: cookie('admin', staffSession) } });
  assert.equal(vendorPage.status, 200); assert.match(await vendorPage.text(), /Tradara/);
  console.log('PASS: vendor page and health endpoints enforce staff access and report inactive integration honestly.');
  users.set(staff.id, { ...staff, app_metadata: {} });
  const revoked = await fetch(`${admin}/account`, { headers: { Cookie: cookie('admin', staffSession) }, redirect: 'manual' });
  assert.equal(new URL(revoked.headers.get('location'), admin).pathname, '/forbidden');
  console.log('PASS: editable metadata cannot grant staff access; staff can sign in without app MFA; revoked roles are denied.');

  const parallelAccounts = await Promise.all([value, staffSession].map(async current => {
    const response = await fetch(`${web}/account`, { headers: { Cookie: cookie('web', current) } });
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    return response.text();
  }));
  assert.ok(parallelAccounts[0].includes(trader.email)); assert.equal(parallelAccounts[0].includes(staff.email), false);
  assert.ok(parallelAccounts[1].includes(staff.email)); assert.equal(parallelAccounts[1].includes(trader.email), false);
  const wrongAppCookie = await fetch(`${admin}/account`, { headers: { Cookie: cookie('web', staffSession) }, redirect: 'manual' });
  assert.equal(new URL(wrongAppCookie.headers.get('location'), admin).pathname, '/login');
  const guestAfterAccounts = await fetch(`${web}/account`, { redirect: 'manual' }); assert.equal(guestAfterAccounts.status, 307);
  console.log('PASS: concurrent users receive only their own account; guests and other apps cannot reuse cached sessions.');

  const loginPage = await fetch(`${web}/login`); const body = hiddenInputs(await loginPage.text());
  body.set('email', trader.email); body.set('password', 'fixture-password');
  const loggedIn = await fetch(`${web}/login`, { method: 'POST', body, headers: { Origin: web }, redirect: 'manual' });
  assert.equal(loggedIn.status, 303, (await loggedIn.text()).replace(/<[^>]+>/g, ' ').slice(0, 600));
  const setCookies = loggedIn.headers.getSetCookie();
  assert.ok(setCookies.some(value => /certa-web-auth/.test(value) && /HttpOnly/i.test(value) && /SameSite=lax/i.test(value)));
  assert.ok(setCookies.every(value => !/Domain=/i.test(value)));
  const validCookie = setCookies.map(value => value.split(';')[0]).join('; ');
  const account = await fetch(`${web}/account`, { headers: { Cookie: validCookie } }); assert.equal(account.status, 200);
  const logoutBody = hiddenInputs(await account.text());
  const logout = await fetch(`${web}/account`, { method: 'POST', body: logoutBody, headers: { Origin: web, Cookie: validCookie }, redirect: 'manual' });
  assert.equal(logout.status, 303); assert.ok(logout.headers.getSetCookie().some(value => /Max-Age=0/i.test(value)));
  const clearedCookie = logout.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const afterLogout = await fetch(`${web}/account`, { headers: { Cookie: clearedCookie }, redirect: 'manual' });
  assert.equal(afterLogout.status, 307); assert.match(afterLogout.headers.get('cache-control'), /no-store/);
  const failedLoginPage = await fetch(`${web}/login`); const failedBody = hiddenInputs(await failedLoginPage.text());
  failedBody.set('email', trader.email); failedBody.set('password', 'incorrect-password');
  const failedLogin = await fetch(`${web}/login`, { method: 'POST', body: failedBody, headers: { Origin: web }, redirect: 'manual' });
  assert.equal(failedLogin.status, 200); assert.match(await failedLogin.text(), /Unable to sign in/);
  assert.equal(failedLogin.headers.getSetCookie().some(value => /certa-web-auth=base64-/.test(value)), false);
  const rejectedOrigin = await fetch(`${web}/login`, { method: 'POST', body, headers: { Origin: 'https://evil.example' }, redirect: 'manual' });
  assert.ok(rejectedOrigin.status >= 400);
  console.log('PASS: real Next login/logout forms set and clear HttpOnly cookies; cross-origin action submission is blocked.');

  const refreshed = await fetch(`${web}/account`, { headers: { Cookie: cookie('web', session(trader, true)) }, redirect: 'manual' });
  assert.equal(refreshed.status, 200); assert.ok(refreshes > 0); assert.ok(refreshed.headers.getSetCookie().some(value => value.startsWith('certa-web-auth')));
  assert.match(refreshed.headers.get('cache-control'), /no-store/);
  console.log('PASS: expired sessions refresh and new cookies reach the response without shared caching.');
} finally {
  await Promise.all(children.map(async child => { if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } }));
  auth.closeAllConnections(); await new Promise(resolve => auth.close(resolve));
}
