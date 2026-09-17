import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createSecureStorage } from '@certa/supabase/secure-storage';
import { createNativeClient } from '@certa/supabase/native';
import { createApiClient } from '@certa/api-client';
const secureStorage = createSecureStorage({
  getItemAsync: key => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  deleteItemAsync: key => SecureStore.deleteItemAsync(key),
});
const browserStorage = {
  getItem: (key: string) => typeof window === 'undefined' ? null : window.localStorage.getItem(key),
  setItem: (key: string, value: string) => { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); },
  removeItem: (key: string) => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
};
export const supabase = createNativeClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, Platform.OS === 'web' ? browserStorage : secureStorage);
export const api = createApiClient(process.env.EXPO_PUBLIC_API_ORIGIN!, async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
