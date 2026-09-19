import 'server-only';
import { createHash } from 'node:crypto';
import { isRestrictedBillingRegion } from './restricted-countries';
import { string, TradingError, type Row } from '../tradara/contracts';
export function canonicalBuyerEmail(value:string){const [local,domain]=value.trim().toLowerCase().split('@');const name=local.split('+')[0];return ['gmail.com','googlemail.com'].includes(domain)?`${name.replaceAll('.','')}@gmail.com`:`${name}@${domain}`;}
export function assertPurchaseEmail(email:string){if(['info@certafutures.com','khazayma588@gmail.com'].includes(canonicalBuyerEmail(email)))throw new TradingError('purchase_declined',403);}
export function purchaseTerms(){const version=process.env.CERTA_CHECKOUT_TERMS_VERSION;const address=process.env.CERTA_CHECKOUT_TERMS_URL;if(!version||!address)return null;try{const url=new URL(address);if(url.protocol!=='https:')return null;return {version,url:url.href};}catch{return null;}}
export function purchaseEvidence(input:Row,email:string){
 const terms=purchaseTerms();if(!terms)throw new TradingError('terms_unavailable',503);
 if(input.accepted!==true||input.terms_version!==terms.version)throw new TradingError('accept_current_terms',409);
 const country=string(input.country,'country',2).toUpperCase();const state=input.state?string(input.state,'state',100):'';
 if(!/^[A-Z]{2}$/.test(country)||isRestrictedBillingRegion(country,state))throw new TradingError('billing_region_unavailable',403);
 const name=string(input.name,'name',100);if(name.length<2)throw new TradingError('invalid_name');
 const address=input.address?string(input.address,'address',100):'';const city=input.city?string(input.city,'city',40):'';const postal_code=input.postal_code?string(input.postal_code,'postal_code',20):'';
 const evidence={name,country,state,address,city,postal_code,email:canonicalBuyerEmail(email),terms_version:terms.version,terms_url:terms.url,accepted:true};
 return {...evidence,sha256:createHash('sha256').update(JSON.stringify(evidence)).digest('hex')};
}
