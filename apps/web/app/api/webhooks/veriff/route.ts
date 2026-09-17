import { complianceWebhook } from '@certa/server/contracts';
export const runtime = 'nodejs';
export const POST = (request: Request) => complianceWebhook(request, 'veriff');
