import 'server-only';
import { checked, contentStore, rpc } from './store';
export type GrantPuzzleTicket = (input:{userId:string;ticketId:string;idempotencyKey:string})=>Promise<{grantId:string}>;
/** Bounded recovery for pre-integration rewards. New rewards issue atomically in PostgreSQL. */
export async function dispatchPuzzleRewards(grant:GrantPuzzleTicket,db=contentStore()) {
 const rewards=checked(await db.from('cn_puzzle_rewards').select('id,user_id,reward_ticket_id').eq('state','pending').lte('retry_after',new Date().toISOString()).order('retry_after').limit(50));
 let completed=0;let firstError:unknown;
 for(const reward of rewards){
  try {
   const result=await grant({userId:reward.user_id,ticketId:reward.reward_ticket_id,idempotencyKey:`puzzle-reward/${reward.id}`});
   if(typeof result?.grantId!=='string' || !result.grantId.trim() || result.grantId.length>128)throw new Error('invalid_ticket_grant');
   await rpc(db,'complete_reward',{p_id:reward.id,p_grant_id:result.grantId});completed++;
  }catch(error){
   firstError??=error;
   // Persist a delay so bad/exhausted historical pools cannot monopolize the next batch.
   checked(await db.from('cn_puzzle_rewards').update({retry_after:new Date(Date.now()+60000).toISOString(),last_error:'ticket_grant_unavailable'}).eq('id',reward.id).eq('state','pending').select('id'));
  }
 }
 if(firstError)throw firstError;
 return completed;
}
