'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { AuthDialogProvider } from './_components/auth-dialog';
import { CustomerSiteFooter } from './_components/site-footer';

/** The introduction and protected account area own their respective frames. */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/account' || pathname.startsWith('/account/')) return <AuthDialogProvider>{children}</AuthDialogProvider>;
  if (pathname === '/' || pathname === '/login' || pathname === '/checkout') return <AuthDialogProvider>{children}<CustomerSiteFooter /></AuthDialogProvider>;

  return <AuthDialogProvider>
    <header><a href="/" className="brand" aria-label="Certa Futures home"><Image src="/brand/certa-crest.png" alt="" width={36} height={36} priority /><span>Certa Futures</span></a><a href="/community">Community</a><a href="/awards">Awards</a><a href="/account">Account</a></header>
    <main>{children}</main>
    <CustomerSiteFooter />
  </AuthDialogProvider>;
}
