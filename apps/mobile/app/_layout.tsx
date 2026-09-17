import { Stack } from 'expo-router';
import { AuthProvider } from '../lib/auth';
export default function Layout() { return <AuthProvider><Stack screenOptions={{ headerTitle: 'Certa' }} /></AuthProvider>; }
