import { ticketsResponse } from '@certa/server/tickets';
export const runtime='nodejs';
async function handle(request:Request,context:{params:Promise<{path:string[]}>}){return ticketsResponse(request,(await context.params).path);}
export {handle as GET,handle as POST,handle as OPTIONS};
