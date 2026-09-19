import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isStaff } from '@certa/supabase/policy';
import { isMaster, staffPermissions } from '@certa/supabase/staff-policy';
import { serverConfig, serverSupabase } from './supabase';
import { TradingError, type Row } from './tradara/contracts';
import { customerSession, assertSecondFactor } from './second-factor';
export type Principal = { id: string; staff: boolean; permissions: string[]; metadata: Row; email: string | null; emailVerified: boolean };
export function authorized(principal: Principal, permission: string) {
  if (!principal.staff || (!isMaster(principal.metadata) && !principal.permissions.some(value=>value===`${permission.split(':')[0]}:*`||value===permission))) throw new TradingError('permission_denied',403);
}
export async function principal(request: Request, staff: boolean): Promise<Principal> {
  if (!staff) {
    const session = await customerSession(request);
    await assertSecondFactor(session);
    const user = session.user;
    return { email:user.email??null,emailVerified:!!user.email_confirmed_at,id:user.id,staff:false,metadata:user.app_metadata,permissions:[] };
  }
  const bearer=request.headers.get('authorization');
  let result;
  if(bearer) {
    const token=bearer.match(/^Bearer ([^\s]{1,16384})$/i)?.[1]; if(!token) throw new TradingError('unauthorized',401);
    const config=serverConfig();
    result=await createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,cache:'no-store'})}}).auth.getUser(token);
  } else result=await (await serverSupabase()).auth.getUser();
  if(result.error || !result.data.user) throw new TradingError('unauthorized',401);
  const user=result.data.user; const role=isStaff(user.app_metadata);
  if(staff&&!role) throw new TradingError('staff_required',403);
  return {email:user.email??null,emailVerified:!!user.email_confirmed_at,id:user.id,staff:staff&&role,metadata:user.app_metadata,permissions:staffPermissions(user.app_metadata)};
}
export function cors(request: Request) {
  const headers=new Headers({'Cache-Control':'private, no-store','Vary':'Origin, Cookie','Content-Type':'application/json'});
  const origin=request.headers.get('origin');
  if(origin) {
    if(!(process.env.CERTA_ALLOWED_ORIGINS??'').split(',').includes(origin)) throw new TradingError('origin_denied',403);
    headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers','Authorization, Content-Type, Idempotency-Key');
  }
  if(request.method==='POST' && !request.headers.has('authorization') && origin!==process.env.CERTA_APP_ORIGIN) throw new TradingError('origin_required',403);
  return headers;
}
