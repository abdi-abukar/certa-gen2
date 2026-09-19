import { isStaff } from './policy';

/** Only apply to app_metadata returned by a fresh server-side Auth lookup. */
export function isMaster(metadata: Record<string, unknown> | null | undefined) {
  return typeof metadata?.role === 'string' && metadata.role.trim().toLowerCase() === 'super_admin';
}
export const staffPermissionGroups = [
  { key: 'support_permissions', label: 'Trader support', scope: 'support', actions: ['read', 'login'] },
  { key: 'commerce_permissions', label: 'Checkout & payments', scope: 'commerce', actions: ['read', 'config', 'recovery'] },
  { key: 'tickets_permissions', label: 'Scratch tickets', scope: 'tickets', actions: ['read', 'write'] },
  { key: 'emails_permissions', label: 'Transactional emails', scope: 'emails', actions: ['read', 'write', 'generate', 'publish'] },
  { key: 'content_permissions', label: 'Puzzles & newsletters', scope: 'content', actions: ['read', 'write', 'publish', 'generate'] },
  { key: 'awards_permissions', label: 'Awards', scope: 'awards', actions: ['read', 'write', 'publish', 'issue'] },
  { key: 'discord_permissions', label: 'Community', scope: 'discord', actions: ['read', 'manage', 'config'] },
  { key: 'trading_permissions', label: 'Trading & accounts', scope: 'trading', actions: ['read', 'access', 'control', 'config', 'provision', 'finance', 'compliance', 'recovery', 'emergency'] },
  { key: 'compliance_permissions', label: 'Compliance', scope: 'compliance', actions: ['read', 'manage', 'config', 'documents'] },
  { key: 'payout_permissions', label: 'Payouts', scope: 'payouts', actions: ['read', 'approve', 'send', 'recovery'] },
  { key: 'payout_permissions', label: 'Affiliates', scope: 'affiliates', actions: ['review', 'manage'] },
] as const;
export const staffPermissionKeys = [...new Set(staffPermissionGroups.map(group => group.key))];
/** Page IDs shared with the deployed Certa staff console. Keep persisted IDs stable. */
export const productionStaffPages = ['users','accounts','compliance','risk','payouts','payment-processors','tickets','coupons','daily-puzzle','newsletter','checkout-sessions','email-abandoncart','social','checkout-flow','affiliate-payouts','affiliates','logs','uptime','automated-emails','settings','admins','work','work-publish'] as const;
/** Production uses certa_pages; newer feature grants take precedence when present. */
export function usesProductionStaffPages(metadata: Record<string, unknown>) {
  return isStaff(metadata) && !staffPermissionKeys.some(key => Object.hasOwn(metadata, key));
}
export function hasLegacyFullAccess(metadata: Record<string, unknown>) {
  return usesProductionStaffPages(metadata) && (metadata.certa_pages == null || metadata.certa_pages === '*' || Array.isArray(metadata.certa_pages) && metadata.certa_pages.includes('*'));
}
export function canViewStaff(metadata: Record<string, unknown>) {
  return isMaster(metadata) || hasLegacyFullAccess(metadata) ||
    usesProductionStaffPages(metadata) && Array.isArray(metadata.certa_pages) && metadata.certa_pages.includes('admins');
}
export function staffPermissions(metadata: Record<string, unknown>): string[] {
  if (!isStaff(metadata)) return [];
  if (hasLegacyFullAccess(metadata)) return [...new Set(staffPermissionGroups.map(group => `${group.scope}:*`))];
  if (usesProductionStaffPages(metadata)) {
    // A rebuilt domain can combine old pages. Require every page in that domain
    // rather than broaden a single production page grant to unrelated operations.
    const pages = Array.isArray(metadata.certa_pages) ? metadata.certa_pages : [];
    const domains: Record<string, string[]> = {
      support: ['users'], tickets: ['tickets'], compliance: ['compliance'], emails: ['automated-emails'],
      content: ['daily-puzzle', 'newsletter'], payouts: ['payouts', 'affiliate-payouts'],
      affiliates: ['affiliates'], trading: ['users', 'accounts', 'risk', 'settings'],
      commerce: ['payment-processors', 'coupons', 'checkout-sessions', 'email-abandoncart', 'checkout-flow'],
    };
    return Object.entries(domains).filter(([, required]) => required.every(page => pages.includes(page))).map(([scope]) => `${scope}:*`);
  }
  return [...new Set(staffPermissionKeys.flatMap(key => Array.isArray(metadata[key]) ? metadata[key].filter((value: unknown): value is string => typeof value === 'string') : []))];
}
export const staffPermissionOptions = staffPermissionGroups.flatMap(group => [`${group.scope}:*`, ...group.actions.map(action => `${group.scope}:${action}`)]);
export type StaffRecord = { id: string; email: string | null; role: 'master' | 'staff'; permissions: string[]; revision: string; productionPages?: string[] | null };
