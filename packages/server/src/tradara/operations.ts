import 'server-only';
import { payoutOperation } from '../payouts/worker';
import { TradaraClient, VendorFailure } from './client';
import { TradingStore } from './store';
import { object, pick, vendorCashAmount, TradingError, type Row, type Action } from './contracts';
import { parseEvent, project } from './events';
const encode = encodeURIComponent;
const item = (body: Row): Row => object(body.item ?? body.balance ?? body);
export class TradingOperations {
  constructor(readonly store: TradingStore, readonly vendor: TradaraClient, readonly firm: string) {}
  async run(op: Row): Promise<Row> {
    if (['payout-evidence','payout-settle','payout-reconcile'].includes(String(op.action))) return payoutOperation(this, op);
    const action=op.action as Action; const input=object(op.payload);
    const account=op.account_id ? await this.store.one('accounts','id',String(op.account_id)) : null;
    const member=op.user_id ? await this.store.one('memberships','user_id',String(op.user_id)) : null;
    const accountId=String(account?.vendor_id ?? ''); const vendorUser=String(member?.vendor_user_id ?? '');
    if (op.account_id && (!account || account.firm_id!==this.firm)) throw new TradingError('account_not_found',404);
    const path=`/v1/accounts/${encode(accountId)}`;
    const reason=String(input.reason ?? 'Certa operation');
    switch(action) {
      case 'access-check': {
        if(!member) throw new TradingError('relationship_not_linked',409);
        // Search is a hint only; exact vendor user + relationship type checks are mandatory.
        let cursor: string|null=null;
        for(let page=0;page<5;page++) {
          const query=new URLSearchParams({relationship_type:'TRADER',query:vendorUser,limit:'50'});
          if(cursor) query.set('cursor',cursor);
          const result=await this.vendor.page(`/v1/firm-control/relationships?${query}`);
          const match=result.items.find(row=>row.user_id===vendorUser && row.relationship_type==='TRADER');
          if(match) {
            await this.apply('relationships.updated',match,undefined,vendorUser,String(match.updated_at ?? new Date().toISOString()),String(op.id));
            return {status:match.status, verified:true};
          }
          cursor=result.next; if(!cursor) break;
        }
        // A missing or truncated search is not evidence that the invitation was accepted/revoked.
        throw new TradingError('relationship_lookup_unresolved',409);
      }
      case 'invite': {
        const {data,error}=await this.store.db.auth.admin.getUserById(String(op.user_id));
        if(error || !data.user?.email || !data.user.email_confirmed_at) throw new TradingError('verified_email_required',409);
        const response=await this.vendor.request('POST','/v1/firm-control/users/invitations',{email:data.user.email,relationship_type:'TRADER'});
        const relationship=object(response.relationship); const userId=String(response.user_id ?? relationship.user_id ?? '');
        if(!userId) throw new VendorFailure('invitation_result_unresolved',true);
        const {error:writeError}=await this.store.db.from('ct_memberships').upsert({user_id:op.user_id,vendor_user_id:userId,firm_id:this.firm,status:response.relationship_status ?? relationship.status ?? 'INVITED',checked_at:new Date().toISOString(),data:pick(relationship,['relationship_type','invitation_expires_at'])},{onConflict:'user_id'});
        if(writeError) throw new VendorFailure('invitation_persistence_unresolved',true);
        return {status:response.relationship_status ?? relationship.status};
      }
      case 'suspend': case 'restore':
        if(!vendorUser) throw new TradingError('relationship_not_linked',409);
        return this.safe(await this.vendor.request('POST',`/v1/firm-control/traders/${action}`,{user_id:vendorUser,reason}));
      case 'lock': return this.safe(await this.vendor.request('POST',`${path}/lockout`,{reason:'ADMIN_TRADING_DISABLED',expires_at:input.expires_at}));
      case 'unlock': return this.safe(await this.vendor.request('DELETE',`${path}/lockout`));
      case 'cancel-orders': return this.safe(await this.vendor.request('POST',`/v1/orders/cancel-all?account_id=${encode(accountId)}`));
      case 'flatten': return this.safe(await this.vendor.request('POST','/v1/orders/flatten',{account_id:accountId}));
      case 'max-loss-limit': return this.safe(await this.vendor.request('PATCH',`/v1/firm-control/accounts/${encode(accountId)}/max-loss-limit`,{max_drawdown_limit:input.max_drawdown_limit,reason_code:'CERTA_ADMIN',note:reason}));
      case 'cash-adjustment': {
        // This is an administrative cash action, not automatic payout eligibility/settlement.
        if(input.direction==='withdrawal') {
          const live=item(await this.vendor.request('GET',`/v1/balances/${encode(accountId)}`));
          const cents=(value: unknown) => { const raw=String(value); if(!/^\d+(\.\d{1,8})?$/.test(raw)) throw new TradingError('invalid_live_balance',409); const [whole,part='']=raw.split('.'); return BigInt(whole)*100000000n+BigInt(part.padEnd(8,'0')); };
          if(cents(live.balance)<cents(input.amount)) throw new TradingError('insufficient_cash',409);
          await this.requireFlat(accountId);
        }
        const response=await this.vendor.request('POST',`/v1/balances/${encode(accountId)}/adjust`,{direction:input.direction,amount:vendorCashAmount(input.amount),reason_code:'CERTA_ADMIN',note:`${reason} [${op.id}]`});
        if(response.balance) await this.apply('balances.updated',item(response.balance as Row),accountId,vendorUser,new Date().toISOString(),String(op.id));
        return this.safe(response);
      }
      case 'provision': {
        const entitlement=await this.store.rpc('assert_provision',{p_entitlement:input.entitlement_id,p_operation:op.id});
        if(!vendorUser) throw new TradingError('invitation_required',409);
        if(member?.status!=='ACTIVE') throw new TradingError('invitation_not_accepted',409);
        const response=await this.vendor.request('POST','/v1/firm-control/accounts',{user_id:vendorUser,relationship_type:'TRADER',plan_reference:entitlement.plan_reference,stage:entitlement.kind==='funded'?'funded':'evaluation',count:1});
        const envelope=object(response.accounts); const generated=object(Array.isArray(envelope.items)?envelope.items[0]:envelope.item);
        const id=String(generated.account_id ?? generated.id ?? '');
        if(!id) throw new VendorFailure('provision_result_unresolved',true);
        return this.store.rpc('bind_provision',{p_operation:op.id,p_vendor:id,p_firm:this.firm,p_data:pick(generated,['stage','status','plan_reference','initial_balance'])});
      }
      case 'refresh': return this.refresh(op,account,member);
      case 'halt': return this.safe(await this.vendor.request('POST','/v1/firm-control/emergency-halt',{reason,liquidate_sim_accounts:input.liquidate_sim_accounts}));
      case 'halt-release': return this.safe(await this.vendor.request('POST','/v1/firm-control/emergency-halt/release'));
      case 'correction-preview': case 'correction': return this.safe(await this.vendor.request('POST',`/v1/firm-control/reconciliations${action==='correction-preview'?'/preview':''}`,{start_at:input.start_at,end_at:input.end_at}));
      case 'catalog-refresh': {
        const [plans,templates]=await Promise.all([this.vendor.page('/v1/firm-control/catalog/evaluation-plans?limit=50'),this.vendor.page('/v1/firm-control/catalog/eval-templates?limit=50')]);
        await this.record(null,null,'catalog','catalog',{plans:plans.items,templates:templates.items,next:{plans:plans.next,templates:templates.next}});
        return {stored:true,partial:!!(plans.next||templates.next)};
      }
      case 'usage-refresh': {
        const month=encode(String(input.month));
        const data=await this.vendor.request('GET',`/v1/firm-control/billing/usage?month=${month}`);
        await this.record(null,null,'usage',month,data); return {stored:true};
      }
      default: throw new TradingError('unsupported_operation');
    }
  }
  safe(body: Row): Row { return pick(body,['status','id','item','job','cancelled_count','closed_count','errors','cancel_errors','close_errors','balance']); }
  async requireFlat(accountId: string) {
    const positions=await this.vendor.page(`/v1/accounts/${encode(accountId)}/positions`);
    const orders=await this.vendor.page(`/v1/orders?account_id=${encode(accountId)}&status=SUBMITTED&status=PARTIALLY_FILLED&status=PENDING&status=VALIDATED&status=ROUTED&limit=50`);
    if(positions.next || orders.next || orders.items.length || positions.items.some(row=>!['0','0.0','0.00'].includes(String(row.net_quantity)))) throw new TradingError('account_not_confirmed_flat',409);
  }
  async apply(type: string,data: Row,account?: string,user?: string,at=new Date().toISOString(),suffix: string=crypto.randomUUID()) {
    const event=parseEvent({event_id:`read:${suffix}:${type}`,type,firm_id:this.firm,account_id:account,user_id:user,ts:at,data},'read',this.firm);
    await this.store.rpc('ingest',{p_event:project(event)});
  }
  async record(account: string|null,user: string|null,kind: string,id: string,data: Row) {
    const {error}=await this.store.db.from('ct_records').upsert({account_id:account,user_id:user,kind,vendor_id:id,data,vendor_updated_at:new Date().toISOString()},{onConflict:'kind,vendor_id'});
    if(error) throw new TradingError('trading_store_unavailable',503);
  }
  async refresh(op: Row,account: Row|null,member: Row|null): Promise<Row> {
    const input=object(op.payload); const resource=String(input.resource); const id=String(account?.vendor_id ?? '');
    if(resource==='accounts') {
      if(!member) throw new TradingError('relationship_not_linked',409);
      const query=new URLSearchParams({user_id:String(member.vendor_user_id),limit:'100'}); if(input.cursor) query.set('cursor',String(input.cursor));
      const page=await this.vendor.page(`/v1/firm-control/accounts?${query}`);
      // Adoption is explicit: unknown accounts are an inventory result, never assigned by guessed email.
      return {items:page.items.filter(row=>row.is_shadow!==true).map(row=>pick(row,['id','account_id','stage','status','account_type','plan_reference','predecessor_account_id','successor_account_id'])),next_cursor:page.next};
    }
    if(resource==='entitlements') {
      if(!member) throw new TradingError('relationship_not_linked',409);
      const data=await this.vendor.request('GET',`/v1/firm-control/users/entitlements?user_id=${encode(String(member.vendor_user_id))}`);
      await this.record(null,String(op.user_id),'entitlements',String(op.user_id),data); return {stored:true};
    }
    if(!account) throw new TradingError('account_required');
    if(resource==='summary') {
      for(const [type,path] of [['balances.updated',`/v1/balances/${encode(id)}`],['stats.updated',`/v1/stats/${encode(id)}`]]) {
        const data=item(await this.vendor.request('GET',path));
        await this.apply(type,data,id,String(member?.vendor_user_id ?? ''),String(data.updated_at ?? new Date().toISOString()),String(op.id));
      } return {stored:true};
    }
    if(resource==='exposure') {
      const [orders,positions]=await Promise.all([this.vendor.page(`/v1/orders?account_id=${encode(id)}&status=SUBMITTED&status=PARTIALLY_FILLED&limit=50`),this.vendor.page(`/v1/accounts/${encode(id)}/positions`)]);
      return {orders,positions,checked_at:new Date().toISOString()};
    }
    if(resource==='cash-adjustments') {
      const data=await this.vendor.request('GET',`/v1/balances/${encode(id)}/adjustments?limit=50&offset=${Number(input.cursor)||0}`);
      await this.record(String(account.id),String(op.user_id),'cash-adjustments',id,data); return {stored:true};
    }
    if(resource==='daily-stats') {
      const data=await this.vendor.request('GET',`/v1/stats/${encode(id)}/daily?limit=90`);
      await this.record(String(account.id),String(op.user_id),'daily-stats',id,data); return {stored:true};
    }
    const query=new URLSearchParams({account_id:id,limit:'50'});
    if(input.cursor) query.set('cursor',String(input.cursor));
    if(input.from) query.set('from_ts',String(Date.parse(String(input.from))));
    if(input.to) query.set('to_ts',String(Date.parse(String(input.to))));
    const page=await this.vendor.page(`/v1/trades?${query}`);
    for(const row of page.items) await this.apply('trades.rebuilt',row,id,String(member?.vendor_user_id ?? ''),String(row.updated_at ?? new Date().toISOString()),`${op.id}:${row.id ?? row.trade_id}`);
    return {stored:true,next_cursor:page.next};
  }
}
