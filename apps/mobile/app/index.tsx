import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { styles } from '../lib/styles';
import { validCredentials } from '@certa/supabase/policy';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
export default function Login() {
  const { session, ready } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  if (!ready) return <ActivityIndicator accessibilityLabel="Loading session" />;
  if (session) return <Redirect href="/account" />;
  async function login() {
    if (!validCredentials(email.trim(), password)) { setError('Enter a valid email and password.'); return; }
    setPending(true); setError('');
    try { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) setError('Unable to sign in. Check your details and try again.'); else setPassword(''); }
    catch { setError('Unable to connect. Please try again.'); }
    finally { setPending(false); }
  }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.card}>
    <Text style={styles.eyebrow}>CERTA</Text><Text style={styles.title}>Welcome back.</Text><Text style={styles.copy}>Sign in to your Certa account.</Text>
    <Text style={styles.label}>Email</Text><TextInput accessibilityLabel="Email" style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} />
    <Text style={styles.label}>Password</Text><TextInput accessibilityLabel="Password" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" maxLength={1024} onSubmitEditing={() => { if (!pending) void login(); }} />
    <Pressable accessibilityRole="button" disabled={pending} onPress={login} style={[styles.button, pending && { opacity: .5 }]}><Text style={styles.buttonText}>{pending ? 'Signing in…' : 'Sign in'}</Text></Pressable>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View></ScrollView></KeyboardAvoidingView>;
}
