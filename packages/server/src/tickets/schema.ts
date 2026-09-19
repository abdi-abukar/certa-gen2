import { randomBytes, randomInt } from 'node:crypto';
import { TradingError, exact, object, string } from '../tradara/contracts';
export type Prize = { name:string; description:string; kind:'percentage_off'|'amount_off'|'manual'|'none'; value:number };
export type Pool = { title:string; mode:'shared'|'individual'|'reward'; per_user:number; prizes:Prize[] };
export function poolInput(value:unknown):Pool {
 const b=object(value); exact(b,['title','mode','per_user','prizes']);
 if(!['shared','individual','reward'].includes(String(b.mode))||!Array.isArray(b.prizes)||b.prizes.length<1||b.prizes.length>2000)throw new TradingError('invalid_pool');
 if(!Number.isInteger(b.per_user)||Number(b.per_user)<1||Number(b.per_user)>b.prizes.length)throw new TradingError('invalid_limit');
 const prizes=b.prizes.map(value=>{
  const p=object(value);exact(p,['name','description','kind','value']);
  if(!['percentage_off','amount_off','manual','none'].includes(String(p.kind))||!Number.isInteger(p.value))throw new TradingError('invalid_prize');
  const n=Number(p.value);
  if(p.kind==='percentage_off'&&(n<1||n>100)||p.kind==='amount_off'&&(n<1||n>10000000)||(p.kind==='manual'||p.kind==='none')&&n!==0)throw new TradingError('invalid_prize');
  if(typeof p.description!=='string'||p.description.length>400)throw new TradingError('invalid_description');
  return {name:string(p.name,'name',80),description:p.description.trim(),kind:p.kind as Prize['kind'],value:n};
 });
 return {title:string(b.title,'title',100),mode:b.mode as Pool['mode'],per_user:Number(b.per_user),prizes};
}
/** Outcomes are shuffled once before the atomic insert; never rolled by reveal. */
export function prepareInventory(pool:Pool) {
 const prizes=pool.prizes.map(p=>({...p}));
 for(let i=prizes.length-1;i>0;i--){const j=randomInt(i+1);[prizes[i],prizes[j]]=[prizes[j],prizes[i]];}
 const code=()=>`CT-${randomBytes(12).toString('hex').toUpperCase()}`;
 return {prizes,codes:pool.mode==='reward'?[]:Array.from({length:pool.mode==='shared'?1:prizes.length},code)};
}
export function claimCode(value:unknown) {
 const code=string(value,'code',32).trim().toUpperCase();
 if(!/^CT-[A-F0-9]{24}$/.test(code))throw new TradingError('invalid_code');return code;
}
/** The HTTP projection never exposes an unrevealed winning outcome. */
export function customerTicket(row:Record<string,any>) {
 return {id:row.id,pool_id:row.pool_id,title:row.title,claimed_at:row.claimed_at,revealed_at:row.revealed_at,used_at:row.used_at,held:!!row.checkout_id,manual_state:row.manual_state,prize:row.revealed_at?row.prize:null};
}
