import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { api, supabase } from '../lib/supabase';
import { styles } from '../lib/styles';
export default function Account() {
  const { session, ready } = useAuth();
  if (!ready) return <ActivityIndicator accessibilityLabel="Loading session" />;
  if (!session) return <Redirect href="/" />;
  // A refreshed or replaced session owns fresh private UI and pending operations.
  return <VerifiedAccount key={session.access_token} userId={session.user.id} token={session.access_token} />;
}
function VerifiedAccount({ userId, token }: { userId: string; token: string }) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function stillCurrent() {
    const current = (await supabase.auth.getSession()).data.session;
    return active.current && current?.access_token === token;
  }
  const [account, setAccount] = useState<{ userId: string; status: string } | null>(null);
  const [factor, setFactor] = useState<{ mode: 'email' | 'totp'; verified: boolean; factorId: string | null } | null>(null);
  const [challenge, setChallenge] = useState(''); const [code, setCode] = useState('');
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    setFactor(null); setChallenge(''); setCode(''); setError('');
    api.secondFactor('status', undefined, token).then(async result => {
      if (!active) return; setFactor(result);
      if (result.verified) { const identity = await api.me(); if (active && identity.id === userId) setAccount({ userId, status: `Signed in as ${identity.email ?? 'your profile'}` }); }
    }).catch(() => { if (active) setError('Unable to verify this session. Please try signing in again.'); });
    return () => { active = false; };
  }, [userId, token]);
  const status = account?.userId === userId ? account.status : 'Loading your account…';
  async function verify(send = false) {
    setPending(true); setError('');
    try {
      if (send) { const result = await api.secondFactor('email/send', {}, token); if (!await stillCurrent()) return; setChallenge(result.challengeId ?? ''); }
      else {
        const result = factor?.mode === 'totp' ? await api.secondFactor('totp/verify', { factorId: factor.factorId!, code }, token) : await api.secondFactor('email/verify', { challengeId: challenge, code }, token);
        if (!await stillCurrent()) return;
        if (result.session) {
          const saved = await supabase.auth.setSession(result.session);
          if (saved.error) throw saved.error;
          return; // The new token remounts this screen and checks its verified identity.
        }
        const nextFactor = await api.secondFactor('status', undefined, token);
        if (!await stillCurrent()) return;
        setFactor(nextFactor); setCode('');
        const identity = await api.me(); if (await stillCurrent() && identity.id === userId) setAccount({ userId: identity.id, status: `Signed in as ${identity.email ?? 'your profile'}` });
      }
    } catch(reason) { if (active.current) setError(reason instanceof Error ? reason.message : 'Verification failed.'); }
    finally { if (active.current) setPending(false); }
  }
  async function logout() {
    setPending(true); setError('');
    try {
      try { await api.secondFactor('session/clear', {}, token); } catch { /* Local sign-out remains available if the API is unavailable. */ }
      if (!await stillCurrent()) return;
      const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) setError('Unable to sign out. Please try again.'); }
    catch { setError('Unable to sign out. Please try again.'); }
    finally { if (active.current) setPending(false); }
  }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><View style={styles.card}><Text style={styles.eyebrow}>CERTA</Text><Text style={styles.title}>Your account</Text><Text style={styles.copy}>{factor?.verified ? status : 'Verify your sign-in to continue.'}</Text>
    {factor && !factor.verified && <>
      <Text style={styles.copy}>{factor.mode === 'totp' ? 'Enter a code from your authenticator app.' : 'We will send a code to your account email.'}</Text>
      {factor.mode === 'email' && <Pressable accessibilityRole="button" disabled={pending} onPress={() => verify(true)} style={styles.button}><Text style={styles.buttonText}>{challenge ? 'Send a new code' : 'Send code'}</Text></Pressable>}
      {(challenge || factor.mode === 'totp') && <><TextInput accessibilityLabel="Six-digit verification code" style={styles.input} value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} /><Pressable accessibilityRole="button" disabled={pending || code.length !== 6} onPress={() => verify()} style={styles.button}><Text style={styles.buttonText}>Verify code</Text></Pressable></>}
    </>}<Pressable accessibilityRole="button" disabled={pending} onPress={logout} style={styles.button}><Text style={styles.buttonText}>Sign out</Text></Pressable>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View></ScrollView>;
}
