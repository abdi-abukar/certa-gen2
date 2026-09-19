import assert from 'node:assert/strict';
import { test } from 'node:test';
import { poolInput,prepareInventory,customerTicket,claimCode } from '../packages/server/src/tickets/schema';
const prize={name:'Evaluation discount',description:'A fixed reward',kind:'percentage_off',value:20};
const input={title:'Ten summits',mode:'shared',per_user:1,prizes:Array.from({length:10},(_,i)=>({...prize,value:(i+1)*10}))};
test('staff inventory is exact, bounded and rejects ambiguous financial values',()=>{
 assert.equal(poolInput(input).prizes.length,10);
 for(const bad of [{...input,prizes:[]},{...input,prizes:[{...prize,value:101}]},{...input,per_user:11},{...input,prizes:[{...prize,value:20.1}]},{...input,prizes:[{...prize,kind:'manual',value:20}]},{...input,unknown:true}])assert.throws(()=>poolInput(bad));
 assert.equal(poolInput({...input,prizes:[{...prize,value:100}]}).prizes[0].value,100);
});
test('one cryptographic shuffle preserves every staff-chosen prize and code cardinality',()=>{
 for(const mode of ['shared','individual','reward']){
  const config=poolInput({...input,mode}),inventory=prepareInventory(config);
  assert.deepEqual(inventory.prizes.map(p=>p.value).sort((a,b)=>a-b),config.prizes.map(p=>p.value));
  assert.equal(inventory.codes.length,mode==='shared'?1:mode==='individual'?10:0);
  assert.equal(new Set(inventory.codes).size,inventory.codes.length);
  for(const code of inventory.codes)assert.equal(claimCode(code.toLowerCase()),code);
 }
 assert.throws(()=>claimCode('CT-AAAAAA'));assert.throws(()=>claimCode('select *'));
});
test('customer projection cannot leak sealed outcomes, source keys or fulfillment evidence',()=>{
 const row={id:'ticket',pool_id:'pool',title:'Collection',prize,claimed_at:'now',revealed_at:null,used_at:null,checkout_id:'checkout',manual_state:null,source_key:'private',manual_reference:'private',position:1};
 const sealed=customerTicket(row);assert.equal(sealed.prize,null);assert.equal(sealed.held,true);assert.equal('source_key' in sealed,false);assert.equal('position' in sealed,false);assert.equal('manual_reference' in sealed,false);
 assert.deepEqual(customerTicket({...row,revealed_at:'now'}).prize,prize);
});
test('one failed puzzle reward does not block the following valid reward',async()=>{
 const {dispatchPuzzleRewards}=await import('../packages/server/src/content/puzzle-rewards');
 const rewards=[{id:'bad',user_id:'user',reward_ticket_id:'missing'},{id:'good',user_id:'user',reward_ticket_id:'active'}];
 const retried:string[]=[],completed:string[]=[];
 const query:any={select:()=>query,eq:()=>query,lte:()=>query,order:()=>query,limit:async()=>({data:rewards,error:null})};
 const update:any={eq:(_:string,value:string)=>{if(value==='bad')retried.push(value);return update;},select:async()=>({data:[],error:null})};
 const db:any={from:()=>({...query,update:()=>update}),rpc:async(_:string,args:any)=>{completed.push(args.p_id);return {data:true,error:null};}};
 await assert.rejects(dispatchPuzzleRewards(async input=>{if(input.ticketId==='missing')throw Error('not_found');return {grantId:'real-ticket'};},db));
 assert.deepEqual(completed,['good']);assert.deepEqual(retried,['bad']);
});
