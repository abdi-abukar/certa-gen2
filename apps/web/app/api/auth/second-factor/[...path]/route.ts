import { secondFactorResponse } from '@certa/server/second-factor';
export const runtime = 'nodejs';
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) { return secondFactorResponse(request, (await context.params).path); }
export { handle as GET, handle as POST, handle as OPTIONS };
