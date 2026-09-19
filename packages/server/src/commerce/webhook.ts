import 'server-only';
import { readBody, TradingError } from '../tradara/contracts';
import { CommerceStore } from './store';
import { callbackIdentity, verifyCallback, type Processor } from './providers';
export async function commerceWebhook(request:Request,processor:Processor){
 try{
  const raw=new TextDecoder().decode(await readBody(request,65536));
  if(!verifyCallback(processor,raw,request.headers))return new Response(null,{status:401});
  const identity=callbackIdentity(processor,JSON.parse(raw));
  if(!identity.event||!identity.reference||identity.event.length>250||identity.reference.length>200)return new Response(null,{status:400});
  // Store only identifiers, never a raw processor payload or card/billing data.
  const {error}=await new CommerceStore().db.from('cm_callbacks').upsert({processor,event_key:identity.event,provider_reference:identity.reference,invoice:identity.invoice||null},{onConflict:'processor,event_key',ignoreDuplicates:true});
  if(error)return new Response(null,{status:503});return Response.json({received:true});
 }catch(error){return new Response(null,{status:error instanceof TradingError?error.status:503});}
}
