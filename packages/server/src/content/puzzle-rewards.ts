import 'server-only';
import { checked, contentStore, rpc } from './store';
/** Implement this one adapter using the ticket backend. It MUST durably deduplicate idempotencyKey. */
export type GrantPuzzleTicket = (input:{userId:string;ticketId:string;idempotencyKey:string})=>Promise<{grantId:string}>;
/** No fake success or fallback prizes. Concurrent consumers are safe only with the required ticket-side deduplication. */
export async function dispatchPuzzleRewards(grant:GrantPuzzleTicket,db=contentStore()) {
 const rewards=checked(await db.from('cn_puzzle_rewards').select('id,user_id,reward_ticket_id').eq('state','pending').order('created_at').limit(50));
 let completed=0;
 for(const reward of rewards){
  const result=await grant({userId:reward.user_id,ticketId:reward.reward_ticket_id,idempotencyKey:`puzzle-reward/${reward.id}`});
  if(typeof result?.grantId!=='string' || !result.grantId.trim() || result.grantId.length>128)throw new Error('invalid_ticket_grant');
  await rpc(db,'complete_reward',{p_id:reward.id,p_grant_id:result.grantId});completed++;
 }
 return completed;
}
