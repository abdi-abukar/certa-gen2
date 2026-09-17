import type {Row} from '../tradara/contracts';
/** Presentation only. Reaching a target never grants a pass or funded account. */
export function journeyProgress(account:Row,stats:Row|null){
 const criteria=account.data&&typeof account.data==='object'?(account.data as Row).passing_criteria:null;
 const target=criteria&&typeof criteria==='object'?Number((criteria as Row).profit_target_dollars):NaN;
 const pnl=stats?Number(stats.net_pnl??stats.total_net_pnl):NaN;
 const passed=account.kind==='evaluation'&&['passed','upgraded'].includes(String(account.lifecycle));
 return {step:passed?5:Number.isFinite(target)&&target>0&&Number.isFinite(pnl)?Math.max(0,Math.min(4,Math.floor(pnl/target*5))):0,target:Number.isFinite(target)&&target>0?String(target):null,net_pnl:Number.isFinite(pnl)?String(pnl):null,awaiting_vendor_pass:!passed&&Number.isFinite(target)&&target>0&&Number.isFinite(pnl)&&pnl>=target};
}
