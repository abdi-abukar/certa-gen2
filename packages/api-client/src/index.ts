import type { Identity } from '@certa/supabase/policy';

export function createApiClient(origin: string, accessToken: () => Promise<string | null>) {
  return {
    async secondFactor(path: 'status' | 'email/send' | 'email/verify' | 'totp/verify' | 'session/clear', body?: Record<string, string>, expectedToken?: string) {
      const token = await accessToken();
      if (!token || (expectedToken && token !== expectedToken)) throw new Error('Please sign in again.');
      const response = await fetch(new URL(`/api/auth/second-factor/${path}`, origin), {
        method: body ? 'POST' : 'GET', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === 'email_delivery_disabled' ? 'Email verification is not configured yet. Please contact support.' : result.error === 'rate_limited' ? 'Wait a minute before requesting another code.' : 'Unable to verify. Check the code or try again.');
      return result as { mode: 'email' | 'totp'; verified: boolean; factorId: string | null; challengeId?: string; session?: { access_token: string; refresh_token: string } };
    },
    async me(): Promise<Identity> {
      const token = await accessToken();
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch(new URL('/api/me', origin), {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unable to load your account.');
      return response.json();
    },
  };
}
