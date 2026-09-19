import type { Metadata } from 'next';
import { headers } from 'next/headers';
import localFont from 'next/font/local';
import '@certa/ui-web/styles.css';
import './globals.css';
import { SiteFrame } from './site-frame';
const dmSans = localFont({ src: './_components/fonts/dm-sans-latin.woff2', weight: '400 700', style: 'normal', display: 'swap' });
const siteName = 'Certa Futures';
const tagline = 'One evaluation. One funded account.';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_ORIGIN ?? process.env.CERTA_APP_ORIGIN ?? 'https://www.certafutures.com'),
  title: { default: `${siteName}: ${tagline}`, template: `%s | ${siteName}` },
  description: 'Certa Futures is a futures prop firm with one simple evaluation and one Certified Funded account.',
  applicationName: siteName,
  robots: { index: false, follow: false },
  openGraph: { type: 'website', siteName, locale: 'en_US', title: `${siteName}: ${tagline}` },
  twitter: { card: 'summary_large_image', site: '@certafunding' },
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  // Dynamic rendering lets Next attach the per-request CSP nonce to its scripts.
  await headers();
  return <html lang="en"><body className={dmSans.className}><SiteFrame>{children}</SiteFrame></body></html>;
}
