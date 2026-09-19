import { commerceWebhook } from '@certa/server/commerce-webhook';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{processor:string}>}){const {processor}=await context.params;if(processor!=='authnet'&&processor!=='nmi'&&processor!=='crypto')return new Response(null,{status:404});return commerceWebhook(request,processor);}
