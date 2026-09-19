'use client';

import { useEffect, useState } from 'react';
import { ResponsiveDialog } from './responsive-dialog';
import { useRouter } from 'next/navigation';
import { AuthContent, AuthPanel } from './auth-dialog';

/** Route fallback for the auth dialog (direct links, new tabs). Same forms, same rules. */
export function AuthPage({ mode, dialog = false }: { mode: 'signup' | 'login' | 'recover'; dialog?: boolean }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selection, setSelection] = useState(mode);
  useEffect(() => setMounted(true), []);
  if (dialog && mounted) return <ResponsiveDialog title={selection === 'login' ? 'Welcome back.' : selection === 'signup' ? 'Create your account.' : 'Reset your password.'}
    onClose={() => router.replace('/')} mobileArtwork="strip" contentSized artwork={<AuthPanel mode={selection} />}>
    <AuthContent key={selection} mode={selection} onSwitch={setSelection} />
  </ResponsiveDialog>;
  // Keep a server-rendered form for direct/no-JavaScript sign-in.
  return <AuthContent mode={mode} onSwitch={next => router.push(next === 'recover' ? '/forgot-password' : `/${next}`)} />;
}
