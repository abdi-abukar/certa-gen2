import 'server-only';
export type Vendor = {
  id: string; name: string; purpose: string;
  lifecycle: 'integrated' | 'foundation' | 'planned';
  healthEndpoint: `/api/vendors/${string}/health`;
  probe: string; scope: string; intervalSeconds: number;
};
export const vendors = [
  { id: 'authnet', name: 'Authorize.net', purpose: 'Authenticated card checkout', lifecycle: 'foundation', healthEndpoint: '/api/vendors/authnet/health', probe: 'Deployment diagnostic only; no financial provider calls', scope: 'Adapter implemented. Web-only credentials and merchant sandbox behavior require verification; this endpoint never reports processing readiness.', intervalSeconds: 60 },
  { id: 'nmi', name: 'NMI', purpose: 'Authenticated card checkout', lifecycle: 'foundation', healthEndpoint: '/api/vendors/nmi/health', probe: 'Deployment diagnostic only; no financial provider calls', scope: 'Adapter implemented. Web-only credentials and merchant sandbox behavior require verification; this endpoint never reports processing readiness.', intervalSeconds: 60 },
  { id: 'nowpayments', name: 'NOWPayments', purpose: 'Authenticated crypto checkout', lifecycle: 'foundation', healthEndpoint: '/api/vendors/nowpayments/health', probe: 'Deployment diagnostic only; no financial provider calls', scope: 'Adapter implemented. Invoice callbacks and merchant configuration require verification; this endpoint never reports processing readiness.', intervalSeconds: 60 },
  { id: 'anthropic', name: 'Anthropic', purpose: 'Staff-requested structured newsletter and transactional email drafts', lifecycle: 'foundation', healthEndpoint: '/api/vendors/anthropic/health', probe: 'GET public status API', scope: 'Provider-reported status only; does not verify model access or generation.', intervalSeconds: 60 },
  { id: 'discord', name: 'Discord', purpose: 'Community identity, roles, milestones and live presence', lifecycle: 'foundation', healthEndpoint: '/api/vendors/discord/health', probe: 'GET public status API', scope: 'Provider-reported service health; worker state is available in the Discord console. Does not prove bot permissions or delivery.', intervalSeconds: 60 },
  { id: 'supabase', name: 'Supabase', purpose: 'Shared identity and database', lifecycle: 'integrated', healthEndpoint: '/api/vendors/supabase/health', probe: 'GET /auth/v1/settings', scope: 'Project Auth API; does not verify database queries or sign-in end to end.', intervalSeconds: 60 },
  { id: 'resend', name: 'Resend', purpose: 'Certa-owned transactional email delivery', lifecycle: 'foundation', healthEndpoint: '/api/vendors/resend/health', probe: 'GET /domains', scope: 'API authentication/read access; does not verify delivery. Email triggers remain inactive.', intervalSeconds: 60 },
  { id: 'tradara', name: 'Tradara', purpose: 'Trading accounts, risk, statistics and provisioning', lifecycle: 'foundation', healthEndpoint: '/api/vendors/tradara/health', probe: 'GET /v1/firm-control/firm', scope: 'Firm API read access. Backend routes, event projections and worker implemented; deployment and credentials require activation.', intervalSeconds: 60 },
  { id: 'docuseal', name: 'DocuSeal', purpose: 'Versioned funded agreements and tax signatures', lifecycle: 'foundation', healthEndpoint: '/api/vendors/docuseal/health', probe: 'GET /templates?limit=1', scope: 'API template-read access; does not verify signing, callbacks or document retention.', intervalSeconds: 60 },
  { id: 'veriff', name: 'Veriff', purpose: 'Identity verification', lifecycle: 'foundation', healthEndpoint: '/api/vendors/veriff/health', probe: 'GET public status API', scope: 'Provider-reported service status only; does not test integration credentials, decisions or webhooks.', intervalSeconds: 60 },
] as const satisfies readonly Vendor[];
export type VendorId = typeof vendors[number]['id'];
export function findVendor(id: string) { return vendors.find(vendor => vendor.id === id); }
