import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TradingError } from '../tradara/contracts';
export function emailStore() {
 if(!process.env.CERTA_SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new TradingError('email_not_configured',503);
 return createClient(process.env.CERTA_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(15000)})}});
}
export function checked<T>({data,error}:{data:T;error:unknown}):NonNullable<T>{if(error)throw new TradingError('email_store_unavailable',503);if(data==null)throw new TradingError('not_found',404);return data;}
export async function emailRpc(db:SupabaseClient,name:string,args:Record<string,unknown>={}) {
 const {data,error}=await db.rpc(`ce_${name}`,args);
 if(error){const conflict=error.message.includes('conflict');throw new TradingError(conflict?'conflict':'email_store_unavailable',conflict?409:503);}return data;
}
