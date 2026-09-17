import type { Identity } from '@certa/supabase/policy';

export function createApiClient(origin: string, accessToken: () => Promise<string | null>) {
  return {
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
