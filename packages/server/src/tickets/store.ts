import 'server-only';
import { contentStore } from '../content/store';
import { TradingError } from '../tradara/contracts';
export const ticketStore=contentStore;
export function checked<T>({data,error}:{data:T;error:unknown}):NonNullable<T>{if(error)throw new TradingError('tickets_unavailable',503);if(data==null)throw new TradingError('not_found',404);return data;}
export async function ticketRpc(name:string,args:Record<string,unknown>,db=ticketStore()):Promise<any>{
 const {data,error}=await db.rpc(`tk_${name}`,args);
 if(error){const code=['not_found','invalid_input','conflict','not_active','sold_out','claim_limit','ticket_held','already_used','not_revealed','not_discount','invalid_code'].find(code=>error.message.includes(code));throw new TradingError(code??'tickets_unavailable',code==='not_found'?404:code?409:503);}return data;
}
