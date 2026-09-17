import {awardsResponse} from '@certa/server/awards';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{path:string[]}>}){return awardsResponse(request,(await context.params).path,false);}
export {handle as GET,handle as POST,handle as OPTIONS};
