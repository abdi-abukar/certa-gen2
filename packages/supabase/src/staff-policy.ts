import { isStaff } from './policy';

/** Only apply to app_metadata returned by a fresh server-side Auth lookup. */
export function isMaster(metadata: Record<string, unknown> | null | undefined) {
  return typeof metadata?.role === 'string' && metadata.role.trim().toLowerCase() === 'super_admin';
}
export const staffPermissionGroups = [
  { key: 'content_permissions', label: 'Puzzles & newsletters', scope: 'content', actions: ['read', 'write', 'publish', 'generate'] },
  { key: 'awards_permissions', label: 'Awards', scope: 'awards', actions: ['read', 'write', 'publish', 'issue'] },
  { key: 'discord_permissions', label: 'Community', scope: 'discord', actions: ['read', 'manage', 'config'] },
  { key: 'trading_permissions', label: 'Trading & accounts', scope: 'trading', actions: ['read', 'access', 'control', 'config', 'provision', 'finance', 'compliance', 'recovery', 'emergency'] },
  { key: 'compliance_permissions', label: 'Compliance', scope: 'compliance', actions: ['read', 'manage', 'config', 'documents'] },
  { key: 'payout_permissions', label: 'Payouts', scope: 'payouts', actions: ['read', 'approve', 'send', 'recovery'] },
  { key: 'payout_permissions', label: 'Affiliates', scope: 'affiliates', actions: ['review', 'manage'] },
] as const;
export const staffPermissionKeys = [...new Set(staffPermissionGroups.map(group => group.key))];
export function staffPermissions(metadata: Record<string, unknown>): string[] {
  if (!isStaff(metadata)) return [];
  return [...new Set(staffPermissionKeys.flatMap(key => Array.isArray(metadata[key]) ? metadata[key].filter((value: unknown): value is string => typeof value === 'string') : []))];
}
export const staffPermissionOptions = staffPermissionGroups.flatMap(group => [`${group.scope}:*`, ...group.actions.map(action => `${group.scope}:${action}`)]);
export type StaffRecord = { id: string; email: string | null; role: 'master' | 'staff'; permissions: string[]; revision: string };
