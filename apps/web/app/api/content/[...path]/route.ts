import { contentResponse } from '@certa/server/content';
import { renderNewsletter } from '@certa/server/content-render';
export const runtime='nodejs';
export const maxDuration=90;
async function handle(request:Request,context:{params:Promise<{path:string[]}>}){return contentResponse(request,(await context.params).path,false,renderNewsletter);}
export {handle as GET,handle as POST,handle as OPTIONS};
