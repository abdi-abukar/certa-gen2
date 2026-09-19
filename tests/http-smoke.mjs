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
const staff = { ...trader, id: randomUUID(), email: 'staff@example.test', app_metadata: { role: 'certa_admin', certa_pages: [] }, user_metadata: {} };
const users = new Map([trader, staff].map(user => [user.id, user]));
const newsletterSubscriptions = [];
let newsletterSuppressed = false;
const tokens = new Map();
const supportLinks = new Map();
let supportVerifications = 0;
const unverifiedCustomers = new Set();
const createdCustomers = [];
let signupClaims = 0;
const grantedSessions = [];
let authOrigin;
let refreshes = 0;
let profileStatsMode = 'available';
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

function session(user, expired = false, sessionId = user.id) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { session_id: sessionId, iss: `${authOrigin}/auth/v1`, sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: user.app_metadata, aal: 'aal1', iat: now - (expired ? 7200 : 0), exp: now + (expired ? -3600 : 3600) };
  const encoded = [ { alg: 'ES256', kid, typ: 'JWT' }, payload ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const access_token = `${encoded}.${sign('sha256', Buffer.from(encoded), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  tokens.set(access_token, user.id);
  return { access_token, refresh_token: `fixture-refresh-${user.id}`, expires_in: expired ? -3600 : 3600, expires_at: payload.exp, token_type: 'bearer', user };
}
let authRequests = 0;
const auth = createServer(async (request, response) => {
  const url = new URL(request.url, authOrigin ?? 'http://localhost');
  if (url.pathname.startsWith('/auth/v1/')) authRequests++;
  response.setHeader('Content-Type', 'application/json');
  const send = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
  if (url.pathname === '/auth/v1/admin/generate_link') {
    if(request.headers.apikey !== 'fixture-server-secret') return send(401,{message:'Invalid key'});
    let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw);
    const user=[...users.values()].find(user=>user.email===body.email);
    if(!user)return send(404,{message:'Not found'});
    const hash=randomUUID().replaceAll('-','').repeat(2);supportLinks.set(hash,user.id);
    return send(200,{...user,hashed_token:hash,action_link:'https://unused.example.test',verification_type:'magiclink',email_otp:'123456',redirect_to:''});
  }
  if (url.pathname === '/auth/v1/verify') {
    let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw);
    const id=supportLinks.get(body.token_hash);if(!id)return send(403,{error_code:'otp_expired',msg:'Invalid or used link'});
    supportLinks.delete(body.token_hash);supportVerifications++;
    return send(200,session(users.get(id),false,randomUUID()));
  }
  if (url.pathname.startsWith('/auth/v1/admin/users')) {
    if(request.headers.apikey !== 'fixture-server-secret') return send(401,{message:'Invalid key'});
    const id=url.pathname.split('/')[5];
    if(!id && request.method==='POST') {
      let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw);
      if([...users.values()].some(user=>user.email===body.email)) return send(422,{code:422,msg:'A user with this email address has already been registered'});
      const created={id:randomUUID(),email:body.email,app_metadata:{provider:'email'},user_metadata:body.user_metadata??{},aud:'authenticated',email_confirmed_at:body.email_confirm?new Date().toISOString():null,created_at:new Date().toISOString()};
      users.set(created.id,created);createdCustomers.push(created);return send(200,created);
    }
    if(!id) { const filter=(url.searchParams.get('filter')??'').toLowerCase();const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('per_page')||50);return send(200,{users:[...users.values()].filter(user=>user.email.toLowerCase().includes(filter)).slice((page-1)*size,page*size),aud:'authenticated'}); }
    if(request.method==='DELETE'){users.delete(id);return send(200,{});}
    const found=users.get(id); if(!found)return send(404,{message:'Not found'});
    if(request.method==='PUT') {
      let raw='';for await(const chunk of request)raw+=chunk;
      const body=JSON.parse(raw);const updated={...found,...(body.app_metadata?{app_metadata:body.app_metadata}:{}),...(body.user_metadata?{user_metadata:body.user_metadata}:{}),updated_at:new Date().toISOString()};users.set(id,updated);return send(200,updated);
    }
    return send(200,found);
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    if (request.headers.apikey !== 'fixture-server-secret') return send(401, { message: 'Invalid fixture key' });
    if(url.pathname==='/rest/v1/rpc/work_staff_lookup') return send(200,[...users.values()].filter(user=>['admin','certa_admin','super_admin'].includes(user.app_metadata?.role)||user.app_metadata?.certa_admin===true).map(user=>({id:user.id,email:user.email,app_metadata:Object.fromEntries(Object.entries(user.app_metadata).reverse())})));
    if(['/rest/v1/trader_usernames','/rest/v1/compliance_profiles'].includes(url.pathname)) {
      const id=url.searchParams.get('user_id')?.replace(/^eq\./,'');
      if(!users.has(id))return send(406,{message:'Unknown owner'});
      const result=url.pathname.endsWith('trader_usernames')?{username:id===trader.id?'realtrader':'realstaff'}:{kyc_status:id===trader.id?'approved':'review',sanctions_status:'approved',private_document:'NEVER_EXPOSE'};
      return send(200,result);
    }
    if(url.pathname==='/rest/v1/rpc/cf_verified') { let raw='';for await(const chunk of request)raw+=chunk;const input=JSON.parse(raw);return send(200,!unverifiedCustomers.has(input.p_user)); }
    if(url.pathname==='/rest/v1/rpc/cf_clear') return send(200,null);
    if(url.pathname==='/rest/v1/rpc/cu_username_available') return send(200,true);
    if(url.pathname==='/rest/v1/rpc/cu_signup_claim') { signupClaims++; return send(200,true); }
    if(url.pathname==='/rest/v1/rpc/cu_register') return send(200,{state:'registered'});
    if(url.pathname==='/rest/v1/rpc/cu_grant_session') { let raw='';for await(const chunk of request)raw+=chunk;const input=JSON.parse(raw);grantedSessions.push(input);return send(200,null); }
    if(url.pathname.startsWith('/rest/v1/rpc/cu_')) return send(500,{message:'unexpected signup fixture call'});
    if(url.pathname==='/rest/v1/ca_issues'){let rows=awardIssues;for(const field of ['user_id','id'])if(url.searchParams.has(field))rows=rows.filter(r=>r[field]===url.searchParams.get(field).slice(3));if(request.headers.accept?.includes('vnd.pgrst.object'))return rows.length?send(200,rows[0]):send(406,{message:'not found'});return send(200,rows);}
    if(url.pathname==='/rest/v1/ca_renders'||url.pathname==='/rest/v1/ca_templates'||url.pathname==='/rest/v1/ca_catalog')return send(200,[]);
    if(url.pathname.startsWith('/rest/v1/rpc/ca_'))return send(200,true);
    if(url.pathname==='/rest/v1/cn_puzzle_rewards'){let rows=contentRewards; for(const field of ['user_id','puzzle_id'])if(url.searchParams.has(field))rows=rows.filter(r=>r[field]===url.searchParams.get(field).slice(3));return send(200,rows);}
    if(url.pathname==='/rest/v1/cn_issues'||url.pathname==='/rest/v1/cn_puzzles')return send(200,[]);
    if(url.pathname==='/rest/v1/rpc/cn_subscribe') {
      let raw='';for await(const chunk of request)raw+=chunk;
      if(newsletterSuppressed)return send(409,{message:'suppressed'});
      newsletterSubscriptions.push(JSON.parse(raw).p_email);return send(200,null);
    }
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
    if(url.pathname==='/rest/v1/ct_records' && url.searchParams.has('ct_accounts.user_id')) {
      if(profileStatsMode==='error')return send(503,{message:'Snapshot unavailable'});
      const owner=url.searchParams.get('ct_accounts.user_id').slice(3);const account=url.searchParams.get('account_id')?.slice(3);
      if(!tradingAccounts.some(row=>row.id===account&&row.user_id===owner))return send(200,[]);
      if(profileStatsMode==='missing')return send(200,[]);
      return send(200,[{data:{total_net_pnl:profileStatsMode==='invalid'?'':profileStatsMode==='zero'?'0':owner===trader.id?'1240.50':'-85.25',private_metadata:'NEVER_EXPOSE'},vendor_updated_at:'2026-09-19T12:00:00Z'}]);
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
    const user = body.refresh_token ? users.get(body.refresh_token.replace('fixture-refresh-', '')) : [...users.values()].find(user => user.email === body.email && (body.password === 'fixture-password' || createdCustomers.some(created => created.id === user.id && body.password === 'a-brand-new-password')));
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
  const settings = { CERTA_AUTH_CHALLENGE_SECRET:'synthetic-challenge-secret-for-smoke-tests', NEWSLETTER_POSTAL_ADDRESS:'100 Synthetic Street',PUZZLE_ANSWER_KEY:'synthetic-fixture-key-32-characters', DISCORD_CLIENT_ID:'345678901234567890',DISCORD_GUILD_ID:'456789012345678901',DISCORD_PUBLIC_KEY:discordPublic, DOCUSEAL_WEBHOOK_SECRET: 'fixture-docuseal-secret', VERIFF_API_KEY: 'fixture-veriff-key', VERIFF_SHARED_SECRET: 'fixture-veriff-secret', SUPABASE_SECRET_KEY: 'fixture-server-secret', TRADARA_FIRM_ID: 'fixture-firm', TRADARA_WEBHOOK_SECRET: 'fixture-webhook-secret', SUPABASE_URL: authOrigin, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_fixture_only', WEB_ORIGIN: `http://127.0.0.1:${webPort}`, ADMIN_ORIGIN: `http://127.0.0.1:${adminPort}`, API_ORIGIN: `http://127.0.0.1:${webPort}` };
  const web = await start('web', webPort, settings); const admin = await start('admin', adminPort, settings);
  for (const origin of [web, admin]) {
    const response = await fetch(`${origin}/account`, { redirect: 'manual' });
    assert.equal(response.status, 307); assert.equal(new URL(response.headers.get('location'), origin).pathname, '/login');
    assert.match(response.headers.get('cache-control'), /no-store/);
    const login = await fetch(`${origin}/login`); const html = await login.text();
    const nonce = login.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1];
    assert.match(login.headers.get('content-security-policy'), origin === web ? /media-src 'self' blob:/ : /media-src 'self';/, 'local clip playback is allowed only in the customer web app');
    assert.ok(html.includes(`nonce="${nonce}"`));
    assert.equal(login.headers.get('x-frame-options'), 'DENY');
  }
  console.log('PASS: protected routes redirect guests; CSP nonces and no-store headers are present.');
  {
    const html = await (await fetch(`${web}/login`)).text();
    assert.match(html, /<link rel="icon" href="\/favicon\.ico[^"]*" sizes="256x256"/, 'web favicon missing');
    assert.match(html, /rel="apple-touch-icon"/, 'web apple icon missing');
    assert.match(html, new RegExp(`property="og:image" content="${web}/opengraph-image`), 'absolute Open Graph image missing');
    assert.match(html, /name="twitter:card" content="summary_large_image"/, 'twitter card missing');
    assert.match(html, /<title>Sign in \| Certa Futures<\/title>/, 'title template missing');
    assert.ok(html.includes('certa-crest.png') && html.includes('Certa Futures</span>'), 'header brand missing');
    const staff = await (await fetch(`${admin}/login`)).text();
    assert.match(staff, /<link rel="icon" href="\/favicon\.ico[^"]*"/, 'admin favicon missing');
    assert.ok(staff.includes('certa-crest.png'), 'admin header brand missing');
    for (const path of ['/favicon.ico', '/apple-icon.png', '/opengraph-image.png']) assert.equal((await fetch(`${web}${path}`)).status, 200, `${path} not served`);
    console.log('PASS: favicon, Apple icon, Open Graph/Twitter card and crest header render on web and admin.');
  }

  const value = session(trader);
  {
    const header = async (sessionCookie) => {
      const response = await fetch(web, { headers: sessionCookie ? { Cookie: sessionCookie } : {} });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const html = await response.text();
      return html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    };
    const beforeGuest = authRequests;
    const guest = await header(null);
    assert.equal(authRequests, beforeGuest, 'public visitors should not trigger an auth lookup');
    assert.match(guest, /Log In/); assert.match(guest, /Get Started/); assert.doesNotMatch(guest, />Dashboard</);
    const signedIn = await header(cookie('web', value));
    assert.match(signedIn, /href="\/account"[^>]*>Dashboard<\/a>/);
    assert.doesNotMatch(signedIn, /Log In|Get Started/);
    const fullHome=await (await fetch(web+'/',{headers:{Cookie:cookie('web',value)}})).text();
    assert.doesNotMatch(fullHome,/Get started \(Free\)/);
    assert.equal((fullHome.match(/>Dashboard</g)??[]).length,2);
    unverifiedCustomers.add(trader.id);
    assert.match(await header(cookie('web',value)), /Log In/);
    assert.doesNotMatch(await header(cookie('web',value)), />Dashboard</);
    unverifiedCustomers.delete(trader.id);
    const invalid = await header('certa-web-auth=not-a-session');
    assert.match(invalid, /Log In/); assert.doesNotMatch(invalid, />Dashboard</);
    assert.match(await header(null), /Log In/, 'a signed-in render must not leak into the next guest request');
    console.log('PASS: homepage header shows Dashboard only for server-validated sessions; guest and invalid sessions keep login/signup.');
  }
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
  unverifiedCustomers.add(trader.id);
  for (const path of ['/api/me','/api/trading/accounts','/api/payouts/summary','/api/awards/issues','/api/content/puzzles/rewards','/api/commerce/current','/api/tickets/mine']) {
    const denied = await fetch(`${web}${path}`, { headers: { Authorization: `Bearer ${value.access_token}` } });
    assert.equal(denied.status,403,`Unverified customer reached ${path}`);
    assert.equal((await denied.json()).error,'second_factor_required');
  }
  const verificationStatus=await fetch(`${web}/api/auth/second-factor/status`, {headers:{Authorization:`Bearer ${value.access_token}`}});
  assert.equal(verificationStatus.status,200);assert.equal((await verificationStatus.json()).verified,false);
  const pendingAccount=await fetch(`${web}/account`, {headers:{Cookie:cookie('web',value)},redirect:'manual'});
  assert.equal(new URL(pendingAccount.headers.get('location'),web).pathname,'/login');
  const legacyVerify=await fetch(`${web}/verify`, {headers:{Cookie:cookie('web',value)},redirect:'manual'});
  assert.equal(new URL(legacyVerify.headers.get('location'),web).pathname,'/login');
  const inactiveSend=await fetch(`${web}/api/auth/second-factor/email/send`, {method:'POST',headers:{Authorization:`Bearer ${value.access_token}`,'Content-Type':'application/json'},body:'{}'});
  assert.equal(inactiveSend.status,503);assert.equal((await inactiveSend.json()).error,'email_delivery_disabled');
  unverifiedCustomers.delete(trader.id);
  for(const path of ['/verify','/login']) {const completed=await fetch(web+path,{headers:{Cookie:cookie('web',value)},redirect:'manual'});assert.equal(new URL(completed.headers.get('location'),web).pathname,'/account');}
  console.log('PASS: password-only sessions cannot access customer data; verification screen remains reachable and disabled email delivery fails closed.');
  {
    const origin = { Origin: web, 'Content-Type': 'application/json' };
    const post = (path, body, headers = origin) => fetch(`${web}/api/auth/signup/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    let response = await fetch(`${web}/api/auth/signup/username?username=certa`); assert.equal(response.status, 200); assert.equal((await response.json()).available, false);
    response = await fetch(`${web}/api/auth/signup/username?username=newtrader`); assert.deepEqual(await response.json(), { available: true, username: 'newtrader' });
    response = await post('email/send', { email: 'newtrader@example.test' }); assert.equal(response.status, 503); assert.equal((await response.json()).error, 'email_delivery_disabled');
    const account = { firstName: 'New', lastName: 'Trader', username: 'newtrader', country: 'CA', email: 'newtrader@example.test', password: 'a-brand-new-password', acceptedTerms: true, challengeId: randomUUID(), proof: 'p'.repeat(64) };
    assert.equal((await post('create', account, { 'Content-Type': 'application/json' })).status, 403, 'cross-site account creation must be refused');
    assert.equal((await fetch(`${admin}/api/auth/signup/username?username=newtrader`)).status, 404, 'admin app does not register customers');
    response = await post('create', account); const createdBody = await response.text(); assert.equal(response.status, 200, createdBody);
    assert.deepEqual(JSON.parse(createdBody), { created: true, signedIn: true, next: '/account' });
    const created = createdCustomers.find(user => user.email === 'newtrader@example.test');
    assert.ok(created?.email_confirmed_at, 'proven mailbox creates a confirmed account'); assert.equal(created.user_metadata.username, 'newtrader'); assert.equal(signupClaims, 1);
    assert.deepEqual(grantedSessions.map(input => [input.p_user, input.p_email]), [[created.id, 'newtrader@example.test']]);
    const jar = response.headers.getSetCookie().map(value => value.split(';')[0]); assert.ok(jar.some(value => value.startsWith('certa-web-auth')), 'signup sets the HttpOnly web session');
    const landed = await fetch(`${web}/account`, { headers: { Cookie: jar.join('; ') }, redirect: 'manual' });
    assert.equal(landed.status, 200, 'the new trader reaches the account without a second challenge'); assert.ok((await landed.text()).includes('newtrader@example.test'));
    response = await post('create', account); assert.equal(response.status, 409); assert.equal((await response.json()).error, 'account_exists');
    console.log('PASS: same-origin signup proves the mailbox, creates a confirmed account with a profile, signs the browser in and reaches the account.');
  }


  const denied = await fetch(`${admin}/account`, { headers: { Cookie: cookie('admin', value) }, redirect: 'manual' });
  assert.equal(new URL(denied.headers.get('location'), admin).pathname, '/forbidden');
  const staffSession = session(staff);
  {
    const operator={...staff,id:randomUUID(),email:'support@example.test',app_metadata:{role:'certa_admin',support_permissions:['support:read','support:login']},email_confirmed_at:new Date().toISOString()};
    const customer={...trader,id:randomUUID(),email:'support-customer@example.test',email_confirmed_at:new Date().toISOString()};
    users.set(operator.id,operator);users.set(customer.id,customer);unverifiedCustomers.add(customer.id);
    const operatorCookie=cookie('admin',session(operator));
    const create=(userId,headers={Cookie:operatorCookie,Origin:admin,'Content-Type':'application/json'})=>fetch(admin+'/api/traders',{method:'POST',headers,body:JSON.stringify({userId})});
    assert.equal((await fetch(admin+'/api/traders')).status,401);
    assert.equal((await fetch(admin+'/api/traders',{headers:{Cookie:cookie('admin',value)}})).status,403);
    assert.equal((await create(customer.id,{Cookie:cookie('admin',staffSession),Origin:admin,'Content-Type':'application/json'})).status,403);
    assert.equal((await create(customer.id,{Cookie:operatorCookie,Origin:'https://evil.example','Content-Type':'application/json'})).status,403);
    assert.equal((await create(operator.id)).status,403);
    assert.equal((await create(trader.id)).status,403,'unconfirmed accounts are not magic-link confirmed');
    const directory=await fetch(admin+'/api/traders?q=support-customer',{headers:{Cookie:operatorCookie}});assert.equal(directory.status,200);const listed=await directory.json();assert.deepEqual(listed.items.map(user=>user.id),[customer.id]);assert.equal(JSON.stringify(listed).includes('app_metadata'),false);
    const made=await create(customer.id);assert.equal(made.status,200);const link=await made.json();const address=new URL(link.url);assert.equal(address.origin,web);assert.equal(address.search,'');assert.ok(address.hash.length>80);
    const redeem=(token,sessionCookie)=>fetch(web+'/api/auth/support',{method:'POST',headers:{Origin:web,'Content-Type':'application/json',...(sessionCookie?{Cookie:sessionCookie}:{})},body:JSON.stringify({token})});
    const grant=address.hash.slice(1);
    assert.equal((await redeem(grant,cookie('web',value))).status,409,'normal customer sessions must not be replaced');assert.equal(supportVerifications,0);
    assert.equal((await redeem(grant.slice(0,20)+'x'+grant.slice(21))).status,403);
    const loggedIn=await redeem(grant);assert.equal(loggedIn.status,200);assert.deepEqual(await loggedIn.json(),{next:'/account'});
    const supportCookies=loggedIn.headers.getSetCookie();assert.ok(supportCookies.some(value=>value.startsWith('certa-web-support=')&&value.includes('HttpOnly')));assert.ok(supportCookies.every(value=>!value.startsWith('certa-admin-auth')));
    const supportJar=supportCookies.map(value=>value.split(';')[0]).join('; ');
    assert.equal((await fetch(web+'/account',{headers:{Cookie:supportJar},redirect:'manual'})).status,200,'support session reaches protected account without changing MFA evidence');
    assert.equal((await fetch(web+'/api/auth/second-factor/totp/enroll',{method:'POST',headers:{Cookie:supportJar,Origin:web,'Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await redeem(grant)).status,403,'link is single use');
    const otherJar=supportCookies.filter(value=>value.startsWith('certa-web-support=')).map(value=>value.split(';')[0]).join('; ')+'; '+cookie('web',value);
    assert.equal((await fetch(web+'/account',{headers:{Cookie:otherJar},redirect:'manual'})).status,307,'proof cannot authorize a different user/session');
    const pending=await (await create(customer.id)).json();users.set(operator.id,{...operator,app_metadata:{role:'certa_admin',support_permissions:['support:read']}});
    assert.equal((await redeem(new URL(pending.url).hash.slice(1))).status,403,'permission revocation blocks outstanding links');
    assert.equal((await fetch(web+'/account',{headers:{Cookie:supportJar},redirect:'manual'})).status,307,'permission revocation ends existing support access');
    assert.equal((await create(customer.id)).status,403,'read-only support cannot create links');
    users.delete(operator.id);users.delete(customer.id);unverifiedCustomers.delete(customer.id);
    console.log('PASS: trader search, support permissions, private-window isolation, single-use link, session binding, MFA protection and fresh revocation.');
  }

  {
    const personalHeaders={Cookie:cookie('web',value),Origin:web,'Content-Type':'application/json'};
    const staffPersonalHeaders={Cookie:cookie('admin',staffSession),Origin:admin,'Content-Type':'application/json'};
    const profile=await fetch(web+'/api/account/profile?user_id='+staff.id,{headers:personalHeaders});assert.equal(profile.status,200);
    const own=await profile.json();assert.equal(own.username,'realtrader');assert.equal(own.compliance.kyc,'approved');assert.equal(own.trading.amount,1240.5);assert.equal(own.trading.asOf,'2026-09-19T12:00:00Z');assert.equal(own.session.workspace,'customer');assert.equal(JSON.stringify(own).includes('NEVER_EXPOSE'),false);
    const staffProfile=await fetch(admin+'/api/account/profile?user_id='+trader.id,{headers:staffPersonalHeaders});assert.equal(staffProfile.status,200);const staffOwn=await staffProfile.json();assert.equal(staffOwn.username,'realstaff');assert.equal(staffOwn.trading.amount,-85.25);assert.equal(staffOwn.session.workspace,'staff');
    for(const mode of ['missing','error','invalid','zero']) {profileStatsMode=mode;const result=await (await fetch(web+'/api/account/profile',{headers:personalHeaders})).json();assert.equal(result.trading.amount,mode==='zero'?0:null);assert.equal(result.trading.state,mode==='error'?'unavailable':mode==='zero'?'available':'pending');}profileStatsMode='available';
    assert.equal((await fetch(admin+'/api/account/profile',{headers:{Cookie:cookie('admin',value)}})).status,403);
    assert.equal((await fetch(web+'/api/account/profile')).status,401);
    const update=(origin,headers,body)=>fetch(origin+'/api/account/profile',{method:'POST',headers,body:JSON.stringify(body)});
    assert.equal((await update(web,personalHeaders,{avatar:{hairColor:'#452819'},id:staff.id})).status,400);
    assert.equal((await update(web,personalHeaders,{avatar:{role:'super_admin'}})).status,400);
    assert.equal((await update(web,{...personalHeaders,Origin:'https://evil.example'},{avatar:{hairColor:'#452819'}})).status,403);
    assert.equal((await update(web,personalHeaders,{avatar:{hairColor:'#452819'}})).status,200);
    assert.equal(users.get(trader.id).user_metadata.certa_avatar.hairColor,'#452819');assert.equal(users.get(trader.id).app_metadata.role,undefined);
    assert.equal((await update(admin,staffPersonalHeaders,{avatar:{outfitColor:'#123456'}})).status,200);
    assert.equal(users.get(staff.id).user_metadata.certa_avatar.outfitColor,'#123456');assert.equal(users.get(staff.id).app_metadata.role,'certa_admin');
    unverifiedCustomers.add(trader.id);assert.equal((await fetch(web+'/api/account/profile',{headers:personalHeaders})).status,403);unverifiedCustomers.delete(trader.id);
    console.log('PASS: personal profile and compliance ownership, private-field filtering, customer verification, staff self-service, colour-only writes and cross-origin rejection.');
  }

  for(const path of ['/api/emails/templates','/api/tickets/pools','/api/commerce/history']) {
    assert.equal((await fetch(`${admin}${path}`)).status,401,`guest access ${path}`);
    assert.equal((await fetch(`${admin}${path}`,{headers:{Authorization:`Bearer ${value.access_token}`}})).status,403,`customer staff access ${path}`);
    assert.equal((await fetch(`${admin}${path}`,{headers:{Authorization:`Bearer ${staffSession.access_token}`}})).status,403,`restricted staff access ${path}`);
  }
  for(const path of ['/api/commerce/current','/api/commerce/creator','/api/commerce/context','/api/tickets/mine','/api/auth/second-factor/status']) assert.equal((await fetch(`${web}${path}`)).status,401,`guest customer access ${path}`);
  console.log('PASS: commerce, tickets and email administration deny guests, customers and staff without feature permissions.');

  {
    const owner={...staff,id:randomUUID(),email:'owner@example.test',app_metadata:{role:'super_admin'}};
    const editor={...staff,id:randomUUID(),email:'editor@example.test',app_metadata:{role:'admin',provider:'email',content_permissions:[]}};
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
    users.set(owner.id,{...owner,app_metadata:{role:'admin',certa_pages:[]}});
    assert.equal((await fetch(`${admin}/api/staff`,{headers:ownerHeaders})).status,403,'stale master token must not preserve access');
    assert.equal((await post(change)).status,403);
    const legacy={...staff,id:randomUUID(),email:'production-admin@example.test',app_metadata:{role:'certa_admin',certa_admin:true,provider:'email'}};
    const colleague={...legacy,id:randomUUID(),email:'colleague@example.test'};
    users.set(legacy.id,legacy);users.set(colleague.id,colleague);
    const legacyHeaders={Cookie:cookie('admin',session(legacy)),Origin:admin,'Content-Type':'application/json'};
    const productionList=await fetch(`${admin}/api/staff`,{headers:legacyHeaders});assert.equal(productionList.status,200);
    const productionDirectory=await productionList.json();assert.equal(productionDirectory.canEdit,true);assert.equal(productionDirectory.canPromote,false);
    const productionTarget=productionDirectory.items.find(item=>item.id===colleague.id);assert.equal(productionTarget.productionPages,null);
    const productionChange={id:colleague.id,revision:productionTarget.revision,role:'staff',productionPages:['admins','tickets']};
    assert.equal((await post({...productionChange,role:'master'},legacyHeaders)).status,403);
    assert.equal((await post({...productionChange,productionPages:['invented']},legacyHeaders)).status,400);
    assert.equal((await post(productionChange,legacyHeaders)).status,200);
    assert.deepEqual(users.get(colleague.id).app_metadata.certa_pages,['admins','tickets']);
    assert.equal(users.get(colleague.id).app_metadata.provider,'email');
    assert.equal(users.get(colleague.id).app_metadata.content_permissions,undefined);
    assert.equal((await post(productionChange,legacyHeaders)).status,409);
    assert.equal((await post({...productionChange,id:legacy.id},legacyHeaders)).status,403);
    assert.equal((await fetch(`${admin}/api/content/newsletter/templates`,{headers:legacyHeaders})).status,200);
    legacy.app_metadata={role:'certa_admin',certa_pages:[]};
    assert.equal((await fetch(`${admin}/api/staff`,{headers:legacyHeaders})).status,403);
    users.delete(legacy.id);users.delete(colleague.id);
    users.delete(owner.id);users.delete(editor.id);
    console.log('PASS: production and master staff access, metadata-preserving edits, protected owners, input validation, stale edits, fresh revocation and master content access.');
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
  {
    const originalUser=users.get(trader.id);
    const headers={Cookie:cookie('web',value),Origin:web,'Content-Type':'application/json'};
    const subscribe=(body,extraHeaders=headers)=>fetch(`${web}/api/content/newsletter/subscribe`,{method:'POST',headers:extraHeaders,body:JSON.stringify(body)});
    assert.equal((await subscribe({email:trader.email,consent:true},{Origin:web,'Content-Type':'application/json'})).status,401);
    assert.equal((await subscribe({email:trader.email,consent:true},{...headers,Origin:'https://evil.example'})).status,403);
    users.set(trader.id,{...originalUser,email_confirmed_at:null});
    assert.equal((await subscribe({email:trader.email,consent:true})).status,403);
    users.set(trader.id,{...originalUser,email_confirmed_at:new Date().toISOString()});
    assert.equal((await subscribe({email:trader.email,consent:false})).status,400);
    assert.equal((await subscribe({email:'someone-else@example.test',consent:true})).status,400);
    assert.equal((await subscribe({email:null,consent:true})).status,400);
    assert.equal(newsletterSubscriptions.length,0,'No subscription before consent and verified email match');
    const subscribed=await subscribe({email:` ${trader.email.toUpperCase()} `,consent:true});
    assert.equal(subscribed.status,200);assert.deepEqual(await subscribed.json(),{subscribed:true});
    assert.deepEqual(newsletterSubscriptions,[trader.email]);
    assert.equal((await subscribe({consent:true})).status,200,'Existing clients can omit the email field');
    newsletterSuppressed=true;
    const suppressed=await subscribe({email:trader.email,consent:true});
    assert.equal(suppressed.status,409);assert.equal((await suppressed.json()).error,'suppressed');
    assert.equal(newsletterSubscriptions.length,2,'Suppressed addresses are not resubscribed');
    newsletterSuppressed=false;users.set(trader.id,originalUser);
    console.log('PASS: footer newsletter consent, verified email matching, signed-out/origin denial, legacy payload and suppression.');
  }
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
  {
    // A customer whose second factor is outstanding finishes in place: the sign-in action
    // must hand back the code step, not bounce the browser to another page.
    unverifiedCustomers.add(trader.id);
    const page = await fetch(`${web}/login`); const pending = hiddenInputs(await page.text());
    pending.set('email', trader.email); pending.set('password', 'fixture-password');
    const response = await fetch(`${web}/login`, { method: 'POST', body: pending, headers: { Origin: web }, redirect: 'manual' });
    assert.equal(response.status, 200, 'an outstanding factor must not redirect');
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    assert.match(html, /Six-digit code/, 'the code step should render in place');
    assert.ok(response.headers.getSetCookie().some(value => /certa-web-auth/.test(value)), 'the password session is still established');
    // The page guard stays as the backstop for anyone who arrives at /account directly.
    const cookies = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const guarded = await fetch(`${web}/account`, { headers: { Cookie: cookies }, redirect: 'manual' });
    assert.equal(new URL(guarded.headers.get('location'), web).pathname, '/login');
    unverifiedCustomers.delete(trader.id);
    console.log('PASS: an outstanding second factor is completed in the sign-in form, and /account still guards direct arrivals.');
  }

  const refreshed = await fetch(`${web}/account`, { headers: { Cookie: cookie('web', session(trader, true)) }, redirect: 'manual' });
  assert.equal(refreshed.status, 200); assert.ok(refreshes > 0); assert.ok(refreshed.headers.getSetCookie().some(value => value.startsWith('certa-web-auth')));
  assert.match(refreshed.headers.get('cache-control'), /no-store/);
  console.log('PASS: expired sessions refresh and new cookies reach the response without shared caching.');
} finally {
  await Promise.all(children.map(async child => { if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } }));
  auth.closeAllConnections(); await new Promise(resolve => auth.close(resolve));
}
