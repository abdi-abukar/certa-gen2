import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { principal, cors } from './request';
import { TradingError } from './tradara/contracts';

/** Display the latest owned account snapshot, never sum unrelated accounts or substitute zero. */
async function tradingSummary(db: SupabaseClient, user: string) {
  const empty = { state: 'unavailable', amount: null, account: null, asOf: null };
  const account = await db.from('ct_accounts').select('id,vendor_id,kind').eq('user_id',user).order('vendor_updated_at',{ascending:false,nullsFirst:false}).limit(1).maybeSingle();
  if(account.error) return empty;
  if(!account.data) return {...empty,state:'empty'};
  const record = await db.from('ct_records').select('data,vendor_updated_at,ct_accounts!inner(user_id)').eq('account_id',account.data.id).eq('ct_accounts.user_id',user).eq('kind','stats').order('vendor_updated_at',{ascending:false}).limit(1).maybeSingle();
  const label = `${account.data.kind === 'funded' ? 'Funded' : account.data.kind === 'practice' ? 'Practice' : 'Evaluation'} ${String(account.data.vendor_id).slice(-4).toUpperCase()}`;
  if(record.error) return {...empty,account:label};
  const raw=record.data?.data?.total_net_pnl??record.data?.data?.net_pnl;
  const amount=(typeof raw==='number'||typeof raw==='string'&&/^-?\d+(\.\d+)?$/.test(raw))&&Number.isFinite(Number(raw))?Number(raw):null;
  const asOf=typeof record.data?.vendor_updated_at==='string'&&Number.isFinite(Date.parse(record.data.vendor_updated_at))?record.data.vendor_updated_at:null;
  return {state:amount===null?'pending':'available',amount,account:label,asOf};
}

/** Personal profile operations always use the actor, including in the staff app. */
export async function accountProfileResponse(request: Request) {
  let headers = new Headers({ 'Cache-Control': 'private, no-store' });
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const who = await principal(request, process.env.CERTA_APP === 'admin');
    if (!process.env.CERTA_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new TradingError('profile_unavailable',503);
    const db = createClient(process.env.CERTA_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache:'no-store', signal:AbortSignal.timeout(10000) }) } });
    if (request.method === 'GET') {
      const [handle, compliance, trading] = await Promise.all([
        db.from('trader_usernames').select('username').eq('user_id',who.id).maybeSingle(),
        db.from('compliance_profiles').select('kyc_status,sanctions_status').eq('user_id',who.id).maybeSingle(),
        tradingSummary(db,who.id),
      ]);
      if (handle.error || compliance.error) throw new TradingError('profile_unavailable',503);
      return Response.json({ session:{workspace:process.env.CERTA_APP==='admin'?'staff':'customer',checkedAt:new Date().toISOString()}, trading, username:handle.data?.username??null, compliance:compliance.data ? {kyc:compliance.data.kyc_status,sanctions:compliance.data.sanctions_status} : null },{headers});
    }
    if (request.method !== 'POST') throw new TradingError('method_not_allowed',405);
    const raw=await request.text(); if(raw.length>1024) throw new TradingError('invalid_input',400);
    let body; try {body=JSON.parse(raw);} catch {throw new TradingError('invalid_input',400);}
    if(!body || typeof body!=='object' || Object.keys(body).some(key=>key!=='avatar') || !body.avatar || typeof body.avatar!=='object' || Array.isArray(body.avatar) || Object.entries(body.avatar).some(([key,value])=>!['skinTone','hairColor','outfitColor'].includes(key) || typeof value!=='string' || !/^#[0-9a-f]{6}$/i.test(value))) throw new TradingError('invalid_input',400);
    const current=await db.auth.admin.getUserById(who.id);
    if(current.error || !current.data.user) throw new TradingError('profile_unavailable',503);
    const metadata=current.data.user.user_metadata??{};
    const avatar={...(metadata.certa_avatar&&typeof metadata.certa_avatar==='object'?metadata.certa_avatar:{}),...body.avatar};
    const saved=await db.auth.admin.updateUserById(who.id,{user_metadata:{...metadata,certa_avatar:avatar}});
    if(saved.error) throw new TradingError('profile_update_unknown',503);
    return Response.json({avatar},{headers});
  } catch(error) {
    return Response.json({error:error instanceof TradingError?error.code:'profile_unavailable'},{status:error instanceof TradingError?error.status:503,headers});
  }
}
