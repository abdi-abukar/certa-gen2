export type PublicSupabaseConfig = { url: string; key: string };

export function publicConfig(url: string | undefined, key: string | undefined): PublicSupabaseConfig {
  if (!url || !key) throw new Error('Supabase is not configured. Start the app through its workspace script.');
  if (key.startsWith('sb_secret_')) throw new Error('A privileged Supabase key cannot be used in a client.');
  if (!key.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw new Error();
    } catch { throw new Error('Expected a Supabase publishable or legacy anon key.'); }
  }
  return { url, key };
}
