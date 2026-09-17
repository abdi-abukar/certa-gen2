import { communityResponse } from '@certa/server/discord';
export const runtime = 'nodejs';
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
 return communityResponse(request, (await context.params).path, true);
}
export { handle as GET, handle as POST, handle as OPTIONS };
