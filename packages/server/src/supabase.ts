import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { publicConfig } from '@certa/supabase/config';

export function serverConfig() {
  return publicConfig(process.env.CERTA_SUPABASE_URL, process.env.CERTA_SUPABASE_PUBLISHABLE_KEY);
}

export function cookieOptions() {
  const app = process.env.CERTA_APP;
  if (app !== 'web' && app !== 'admin') throw new Error('Missing server app configuration.');
  return {
    name: `certa-${app}-auth`, httpOnly: true, sameSite: 'lax' as const, path: '/',
    secure: process.env.CERTA_APP_ORIGIN?.startsWith('https://') ?? false,
  };
}

// React cache only deduplicates within one server render, never across users.
export const serverSupabase = cache(async () => {
  const config = serverConfig();
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: cookieOptions(),
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); }
        catch { /* Read-only Server Component. Proxy persists refreshed cookies. */ }
      },
    },
  });
});
