import { AUTOMATED_EMAILS, type AutomatedEmailCopy } from './transactional-catalog';
import { contextFromUser, safeEmailUrl, type EmailContext, type RenderedEmail } from './schema';
import { escapeHtml, renderCertaEmail } from './render';

export type TransactionalEmailId = 'login_pin'|'signup_pin'|'password_reset'|'account_invite'|'checkout_receipt'|'checkout_crypto_started'|'checkout_crypto_partial'|'checkout_crypto_processing'|'checkout_crypto_failed'|'ticket_claim_account'|'ticket_claim_guest'|'friend_invite_received'|'friend_invite_rewarded'|'evaluation_failed'|'sim_funded_onboarding_ready'|'sim_funded_onboarding_required'|'sim_funded_issued'|'waitlist_joined'|'ops_payout_request'|'payout_approved'|'payout_rejected'|'ops_stripe_dispute'|'ops_fraud_warning'|'ops_refund_review'|'ops_tradara_activation';
export type EmailCopy = AutomatedEmailCopy;
export const COPY_LIMITS = {subject:180,eyebrow:100,title:240,greeting:120,body:12000,ctaLabel:120,ctaUrl:2000,cta2Label:120,cta2Url:2000,footer:500,unsubscribeUrl:2000} as const;
export const COPY_SCHEMA = {type:'object',additionalProperties:false,required:Object.keys(COPY_LIMITS),properties:Object.fromEntries(Object.entries(COPY_LIMITS).map(([key,maxLength])=>[key,{type:'string',maxLength}]))};
export const SENSITIVE_EMAILS = new Set(['login_pin','signup_pin','password_reset','account_invite','ticket_claim_guest']);
export const MARKETING_EMAILS = new Set(['waitlist_joined','friend_invite_received','friend_invite_rewarded']);
export function emailDefinition(id:string) {
 const definition=AUTOMATED_EMAILS.find(item=>item.id===id);
 if(!definition)throw new Error('Unknown email template.');
 return definition;
}
const tokens=(value:string)=>[...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(match=>match[1]);
export function validateCopy(id:string,value:unknown):EmailCopy {
 const definition=emailDefinition(id);
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid email copy.');
 const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!Object.hasOwn(COPY_LIMITS,key)))throw new Error('Unknown email copy field.');
 for(const [key,max] of Object.entries(COPY_LIMITS))if(typeof row[key]!=='string'||(row[key] as string).length>max)throw new Error(`Invalid ${key}.`);
 const copy=row as EmailCopy;
 if(!copy.subject.trim()||!copy.title.trim()||!copy.body.trim()||/[\r\n]/.test(copy.subject))throw new Error('Subject, title and body are required.');
 const allowed=new Set(definition.fields.map(field=>field.key));
 const present=new Set(Object.values(copy).flatMap(tokens));
 if([...present].some(token=>!allowed.has(token)))throw new Error('Unknown email variable.');
 if(definition.required.some(token=>!present.has(token)))throw new Error('Required email variables must be preserved.');
 // Codes and bearer links must never enter mailbox metadata or be moved out of the body.
 const secrets=definition.fields.filter(field=>field.key==='pin'||['resetUrl','setupUrl'].includes(field.key)).map(field=>field.key);
 if(tokens(copy.subject+' '+copy.title).some(token=>secrets.includes(token)))throw new Error('Sensitive variables are not allowed in subject or title.');
 for(const token of secrets.filter(token=>definition.required.includes(token)))if(!tokens(copy.body+' '+copy.ctaUrl+' '+copy.cta2Url).includes(token))throw new Error('Keep the authentication credential in the message.');
 for(const field of ['ctaUrl','cta2Url','unsubscribeUrl'] as const)if(copy[field]){
  const expanded=copy[field].replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,token)=>definition.fields.find(f=>f.key===token)?.sample??'');
  safeEmailUrl(expanded);
 }
 if(Boolean(copy.ctaLabel)!==Boolean(copy.ctaUrl)||Boolean(copy.cta2Label)!==Boolean(copy.cta2Url))throw new Error('Buttons require both label and URL.');
 return {...copy};
}
export function emailDataSchema(id:string) {
 const definition=emailDefinition(id);
 const fields=definition.fields.filter(field=>!field.key.startsWith('account.')&&!field.key.startsWith('firm.'));
 return {type:'object',additionalProperties:false,required:definition.required,properties:Object.fromEntries(fields.map(field=>[field.key,{type:'string',maxLength:12000,...(field.kind==='url'?{format:'uri'}:{}),...(field.key==='pin'?{pattern:'^[0-9]{6,10}$',sensitive:true}:{})}]))};
}
export function validateEmailData(id:string,value:unknown):Record<string,string> {
 const definition=emailDefinition(id);const schema=emailDataSchema(id);
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid email event data.');
 const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!Object.hasOwn(schema.properties,key)))throw new Error('Unknown email event field.');
 for(const field of definition.fields.filter(f=>Object.hasOwn(row,f.key))){const data=row[field.key];if(typeof data!=='string'||data.length>12000)throw new Error('Invalid email event field.');if(field.kind==='url')safeEmailUrl(data);if(field.key==='pin'&&!/^[0-9]{6,10}$/.test(data))throw new Error('Invalid email code.');}
 if(definition.required.some(key=>typeof row[key]!=='string'||!(row[key] as string).trim()))throw new Error('Missing email event field.');
 return row as Record<string,string>;
}
export const EMAIL_PREVIEW_CONTEXT=contextFromUser({id:'00000000-0000-4000-8000-000000000001',email:'alex@example.test',user_metadata:{full_name:'Alex Rivera',username:'ariver'},email_confirmed_at:'2026-01-01T00:00:00Z'});
export function renderTransactionalEmail(id:string,context:EmailContext,data:unknown,override?:unknown):RenderedEmail {
 const definition=emailDefinition(id), copy=validateCopy(id,override??definition.defaults), parsed=validateEmailData(id,data);
 const values:Record<string,string>={...parsed,...Object.fromEntries(Object.entries(context.brand).map(([key,value])=>[`firm.${key}`,value])),...Object.fromEntries(Object.entries(context.user).filter(([,value])=>typeof value==='string').map(([key,value])=>[`account.${key}`,String(value)]))};
 const interpolate=(value:string)=>value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,key)=>{if(!Object.hasOwn(values,key))throw new Error('Missing rendered email variable.');return values[key];});
 const rendered=Object.fromEntries(Object.entries(copy).map(([key,value])=>[key,interpolate(value)])) as EmailCopy;
 if(rendered.subject.length>200||/[\r\n]/.test(rendered.subject))throw new Error('Invalid email subject.');
 return {subject:rendered.subject,html:renderCertaEmail({...rendered,bodyHtml:rendered.body.split(/\n\n/).map(paragraph=>`<p>${escapeHtml(paragraph).replace(/\n/g,'<br>')}</p>`).join('')}),text:[rendered.title,rendered.greeting?`Hi ${rendered.greeting},`:'',rendered.body,rendered.ctaUrl?`${rendered.ctaLabel}: ${rendered.ctaUrl}`:'',rendered.cta2Url?`${rendered.cta2Label}: ${rendered.cta2Url}`:'',rendered.footer,rendered.unsubscribeUrl].filter(Boolean).join('\n\n')};
}
