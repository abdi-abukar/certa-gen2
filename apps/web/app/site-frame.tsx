'use client';

import { usePathname } from 'next/navigation';
import { AuthDialogProvider } from './_components/auth-dialog';

/** The home introduction owns its full-width frame; account routes keep their shell. */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/') return <AuthDialogProvider>{children}</AuthDialogProvider>;

  return <AuthDialogProvider>
    <header><a href="/">Certa</a><a href="/community">Community</a><a href="/awards">Awards</a><a href="/account">Account</a></header>
    <main>{children}</main>
  </AuthDialogProvider>;
}
