export type Identity = { id: string; email: string | null };

// Input must be verified server-side before using this policy for authorization.
// user_metadata is deliberately not accepted: users can edit it themselves.
export function isStaff(metadata: Record<string, unknown> | null | undefined): boolean {
  const role = typeof metadata?.role === 'string' ? metadata.role.trim().toLowerCase() : '';
  return metadata?.certa_admin === true || ['admin', 'certa_admin', 'super_admin'].includes(role);
}

export function validCredentials(email: unknown, password: unknown): email is string {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && typeof password === 'string' && password.length > 0 && password.length <= 1024;
}

export function safeNext(value: string | null, fallback = '/account'): string {
  // Only known internal destinations; reject protocol-relative and encoded redirects.
  return value === '/account' || value === '/reset-password' ? value : fallback;
}
