import { tradingResponse } from '@certa/server/tradara';
export const runtime = 'nodejs';
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return tradingResponse(request, (await context.params).path, true);
}
export { handle as GET, handle as POST, handle as OPTIONS };
