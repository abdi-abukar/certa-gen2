import type { Metadata } from 'next';
import { headers } from 'next/headers';
import localFont from 'next/font/local';
import '@certa/ui-web/styles.css';
import './globals.css';
import { SiteFrame } from './site-frame';
const dmSans = localFont({ src: './_components/fonts/dm-sans-latin.woff2', weight: '400 700', style: 'normal', display: 'swap' });
export const metadata: Metadata = { title: 'Certa', description: 'Your Certa account.', robots: { index: false, follow: false } };
export default async function Layout({ children }: { children: React.ReactNode }) {
  // Dynamic rendering lets Next attach the per-request CSP nonce to its scripts.
  await headers();
  return <html lang="en"><body className={dmSans.className}><SiteFrame>{children}</SiteFrame></body></html>;
}
