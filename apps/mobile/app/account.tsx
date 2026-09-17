import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { api, supabase } from '../lib/supabase';
import { styles } from '../lib/styles';
export default function Account() {
  const { session, ready } = useAuth();
  const [account, setAccount] = useState<{ userId: string; status: string } | null>(null);
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!session?.user.id) return;
    const userId = session.user.id;
    let active = true;
    api.me().then(identity => { if (active && identity.id === userId) setAccount({ userId, status: `Signed in as ${identity.email ?? 'your profile'}` }); }).catch(() => { if (active) setAccount({ userId, status: 'Unable to load your account. Check your connection and try again.' }); });
    return () => { active = false; };
  }, [session?.user.id]);
  if (!ready) return <ActivityIndicator accessibilityLabel="Loading session" />;
  if (!session) return <Redirect href="/" />;
  const status = account?.userId === session.user.id ? account.status : 'Loading your account…';
  async function logout() {
    setPending(true); setError('');
    try { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) setError('Unable to sign out. Please try again.'); }
    catch { setError('Unable to sign out. Please try again.'); }
    finally { setPending(false); }
  }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><View style={styles.card}><Text style={styles.eyebrow}>CERTA</Text><Text style={styles.title}>Your account</Text><Text style={styles.copy}>{status}</Text><Pressable accessibilityRole="button" disabled={pending} onPress={logout} style={styles.button}><Text style={styles.buttonText}>{pending ? 'Signing out…' : 'Sign out'}</Text></Pressable>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View></ScrollView>;
}
