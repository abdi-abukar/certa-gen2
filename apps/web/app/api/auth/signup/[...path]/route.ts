import { signupResponse } from '@certa/server/signup';
export const runtime = 'nodejs';
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) { return signupResponse(request, (await context.params).path); }
export { handle as GET, handle as POST, handle as OPTIONS };
