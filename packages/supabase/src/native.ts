import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { publicConfig } from './config';

export function createNativeClient(url: string, key: string, storage: SupportedStorage) {
  const config = publicConfig(url, key);
  return createClient(config.url, config.key, {
    auth: { storage, storageKey: 'certa-mobile-auth', autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
  });
}
