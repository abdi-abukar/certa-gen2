import 'server-only';
import { createPublicKey, verify } from 'node:crypto';
import { object, readBody, TradingError } from '../tradara/contracts';
import { DiscordStore } from './store';
import { appOrigin } from './provider';
export function verifyInteraction(bytes:Uint8Array,headers:Headers,key=process.env.DISCORD_PUBLIC_KEY,now=Date.now()){
 const signature=headers.get('x-signature-ed25519')??'',timestamp=headers.get('x-signature-timestamp')??'';
 if(!key||!/^[a-f0-9]{64}$/i.test(key))throw new TradingError('discord_not_configured',503);
 if(!/^[a-f0-9]{128}$/i.test(signature)||!/^\d{10,13}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)throw new TradingError('invalid_signature',401);
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key,'hex')]),format:'der',type:'spki'});
 if(!verify(null,Buffer.concat([Buffer.from(timestamp),Buffer.from(bytes)]),publicKey,Buffer.from(signature,'hex')))throw new TradingError('invalid_signature',401);
}
export async function discordInteraction(request:Request){
 const headers={'Cache-Control':'no-store'};
 try{
  const bytes=await readBody(request,65536);verifyInteraction(bytes,request.headers);
  const event=object(JSON.parse(Buffer.from(bytes).toString()));
  if(event.type===1)return Response.json({type:1},{headers});
  if(event.application_id!==process.env.DISCORD_CLIENT_ID||event.guild_id!==process.env.DISCORD_GUILD_ID||event.type!==2)throw new TradingError('invalid_interaction',400);
  const command=object(event.data).name;if(!['next','certa'].includes(String(command)))throw new TradingError('unknown_command',400);
  const discord=object(object(event.member).user).id;
  const store=new DiscordStore(1000);const link=await store.one('links','discord_id',String(discord));
  let content=`Connect your Discord account at ${appOrigin()}/community.`;
  if(link?.state==='linked'){
   const {data,error}=await store.db.rpc('ct_compliance',{p_user:link.user_id});
   content=error?'Open your dashboard to review your next steps.':data?.kyc&&data?.tax&&data?.agreement?'Your compliance requirements are complete. Check your dashboard for account status.':'Your dashboard shows the requirements for your next account step.';
   content+=` ${appOrigin()}/account`;
  }
  return Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}},{headers});
 }catch(error){return Response.json({error:error instanceof TradingError?error.code:'discord_interaction_unavailable'},{status:error instanceof TradingError?error.status:503,headers});}
}
