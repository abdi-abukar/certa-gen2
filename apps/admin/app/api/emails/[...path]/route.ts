import { emailAdminResponse } from '@certa/server/email/admin';
export const runtime='nodejs';
export const maxDuration=90;
async function handle(request:Request,context:{params:Promise<{path:string[]}>}){return emailAdminResponse(request,(await context.params).path);}
export {handle as GET,handle as POST,handle as OPTIONS};
