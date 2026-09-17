import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
const Context = createContext<{ session: Session | null; ready: boolean }>({ session: null, ready: false });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, value) => { setSession(value); setReady(true); });
    const refresh = (state: string) => { if (state === 'active') void supabase.auth.startAutoRefresh(); else void supabase.auth.stopAutoRefresh(); };
    refresh(AppState.currentState);
    const listener = AppState.addEventListener('change', refresh);
    return () => { subscription.unsubscribe(); listener.remove(); void supabase.auth.stopAutoRefresh(); };
  }, []);
  return <Context.Provider value={{ session, ready }}>{children}</Context.Provider>;
}
export function useAuth() { return useContext(Context); }
