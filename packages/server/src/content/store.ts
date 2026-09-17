import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { TradingError, type Row } from '../tradara/contracts';
export function contentStore() {
  if (!process.env.CERTA_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new TradingError('content_not_configured',503);
  return createClient(process.env.CERTA_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(15000)})}});
}
export async function rpc(db: ReturnType<typeof contentStore>, name: string, args: Row = {}): Promise<any> {
  const {data,error}=await db.rpc(`cn_${name}`,args);
  if(error) {
    const code=['not_found','conflict','not_live','sold_out','rate_limited','suppressed','invalid_input'].find(c=>error.message.includes(c));
    throw new TradingError(code??'content_store_unavailable',code==='not_found'?404:code==='rate_limited'?429:code?409:503);
  }
  return data;
}
export function checked<T>({data,error}: {data:T;error:unknown}): NonNullable<T> {
  if(error) throw new TradingError('content_store_unavailable',503);
  if(data===null || data===undefined) throw new TradingError('not_found',404);
  return data;
}
