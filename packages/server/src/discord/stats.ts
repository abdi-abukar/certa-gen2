import 'server-only';
import { TradingError, object, type Row } from '../tradara/contracts';
import { DiscordStore } from './store';
export function sessionDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function pnlRows(data:Row){
 const rows=Array.isArray(data.items)?data.items:[];
 const found=new Map<string,string>();
 for(const raw of rows){const r=object(raw);const date=String(r.session_date??''),amount=String(r.net_pnl??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!/^[-]?\d{1,12}(\.\d{1,8})?$/.test(amount))continue;
 if(found.has(date)&&found.get(date)!==amount)throw new TradingError('conflicting_pnl',409);found.set(date,amount);
 }return found;
}
export function moneyUnits(value:string){if(!/^-?\d{1,12}(\.\d{1,8})?$/.test(value))throw new TradingError('invalid_pnl',409);const [whole,part='']=value.replace('-','').split('.');return (value.startsWith('-')?-1n:1n)*(BigInt(whole!)*100000000n+BigInt(part.padEnd(8,'0')));}
export function moneyLabel(units:bigint){const cents=((units<0n?-units:units)+500000n)/1000000n;return `${units<0n&&cents>0n?'-':''}$${(cents/100n).toLocaleString('en-US')}.${(cents%100n).toString().padStart(2,'0')}`;}
export async function verifiedPnl(store:DiscordStore,user:string,account:string,period:string){
 const {data:a,error:ae}=await store.db.from('ct_accounts').select('id').eq('id',account).eq('user_id',user).maybeSingle();
 if(ae)throw new TradingError('discord_store_unavailable',503);if(!a)throw new TradingError('not_found',404);
 if(period.startsWith('trade:')){
  const reference=period.slice(6);if(!/^[A-Za-z0-9_-]{1,100}$/.test(reference))throw new TradingError('invalid_trade');
  const {data:record,error}=await store.db.from('ct_records').select('data,vendor_updated_at').eq('account_id',account).eq('user_id',user).eq('kind','trades').eq('vendor_id',reference).maybeSingle();
  if(error||!record)throw new TradingError('trade_unavailable',409);const trade=object(record.data);
  const closed=Date.parse(String(trade.closed_at));if(!Number.isFinite(closed)||closed>Date.now())throw new TradingError('closed_trade_required',409);
  const amount=moneyUnits(String(trade.net_pnl));const symbol=typeof trade.symbol==='string'&&/^[A-Za-z0-9./_-]{1,30}$/.test(trade.symbol)?trade.symbol:'Trade';
  return {embeds:[{title:'Closed trade',description:`${symbol}: ${moneyLabel(amount)}`,color:amount>=0n?0x3ba55d:0xed4245,footer:{text:`Certa · closed ${new Date(closed).toISOString()} · as of ${record.vendor_updated_at}`}}]};
 }
 const {data,error}=await store.db.from('ct_records').select('data,vendor_updated_at').eq('account_id',account).eq('kind','daily-stats').order('vendor_updated_at',{ascending:false}).limit(1).maybeSingle();
 if(error||!data)throw new TradingError('pnl_unavailable',409);
 const rows=pnlRows(object(data.data));const today=sessionDay();
 const week=period.startsWith('week:')?period.slice(5):null;
 const weekEnd=week&&Number.isFinite(Date.parse(week))?new Date(Date.parse(week)+7*86400000).toISOString().slice(0,10):null;
 if(week&&(!/^\d{4}-\d{2}-\d{2}$/.test(week)||!weekEnd||new Date(week).toISOString().slice(0,10)!==week||new Date(week).getUTCDay()!==1||weekEnd>today))throw new TradingError('closed_period_required',409);
 if(!week&&(!/^\d{4}-\d{2}(-\d{2})?$/.test(period)||period>=today||period.length===7&&period>=today.slice(0,7)))throw new TradingError('closed_period_required',409);
 const selected=[...rows].filter(([day])=>week?day>=week&&day<weekEnd!:period.length===7?day.startsWith(`${period}-`):day===period);
 if(!selected.length)throw new TradingError('pnl_unavailable',409);
 // Decimal fixed point; no binary float accumulation of money.
 const units=selected.reduce((sum,[,v])=>sum+moneyUnits(v),0n);
 const formatted=moneyLabel(units);
 return {embeds:[{title:week?'Weekly account recap':period.length===7?'Monthly account PnL':'Daily account PnL',description:`${period}: ${formatted}`,color:units>=0n?0x3ba55d:0xed4245,footer:{text:`Certa · ${selected.length} reported session(s) · as of ${data.vendor_updated_at}`}}]};
}
