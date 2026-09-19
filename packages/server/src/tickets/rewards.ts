import 'server-only';
import { uuid } from '../tradara/contracts';
import { ticketRpc } from './store';
/** The reward source key survives worker retries and is bound to its owner/pool in PostgreSQL. */
export async function grantPuzzleTicket(input:{userId:string;ticketId:string;idempotencyKey:string}):Promise<{grantId:string}>{
 const result=await ticketRpc('claim',{p_user:uuid(input.userId),p_code:null,p_key:input.idempotencyKey,p_pool:uuid(input.ticketId)});
 return {grantId:result.id};
}
