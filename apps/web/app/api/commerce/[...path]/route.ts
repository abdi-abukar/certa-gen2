import { commerceResponse } from '@certa/server/commerce';
export const runtime='nodejs';
async function handle(request:Request,context:{params:Promise<{path:string[]}>}){return commerceResponse(request,(await context.params).path,false);}
export {handle as GET,handle as POST,handle as OPTIONS};
