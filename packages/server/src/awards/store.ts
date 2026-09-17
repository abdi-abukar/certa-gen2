import 'server-only';
import { tradingStore } from '../tradara/store';
import { TradingError, type Row } from '../tradara/contracts';
export const awardsStore=()=>tradingStore().db;
export function checked<T>(r:{data:T,error:unknown}):NonNullable<T>{if(r.error)throw new TradingError('awards_store_unavailable',503);if(r.data==null)throw new TradingError('not_found',404);return r.data;}
export async function rpc(db:ReturnType<typeof awardsStore>,name:string,args:Row={}):Promise<any>{const r=await db.rpc(`ca_${name}`,args);if(r.error?.message.includes('rate_limited'))throw new TradingError('rate_limited',429);if(r.error)throw new TradingError(r.error.message.includes('conflict')?'conflict':'awards_store_unavailable',r.error.message.includes('conflict')?409:503);return r.data;}
