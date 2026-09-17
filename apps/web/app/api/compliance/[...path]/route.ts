import { complianceResponse } from '@certa/server/contracts';
export const runtime = 'nodejs';
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return complianceResponse(request, (await context.params).path, false);
}
export { handle as GET, handle as POST, handle as OPTIONS };
