import type { Metadata } from 'next';
import { currentStaffAccount } from '@certa/server/auth';
import { headers } from 'next/headers';
import localFont from 'next/font/local';
import '@certa/ui-web/styles.css';
import { AdminShell } from './admin-shell';
const dmSans = localFont({ src: './fonts/dm-sans-latin.woff2', weight: '400 700', style: 'normal', display: 'swap', variable: '--staff-font' });
export const metadata: Metadata = { title: { default: 'Certa Futures staff', template: '%s | Certa Futures staff' }, description: 'Certa Futures staff workspace.', applicationName: 'Certa Futures staff', robots: { index: false, follow: false } };
export default async function Layout({ children }: { children: React.ReactNode }) {
  // Dynamic rendering lets Next attach the per-request CSP nonce to its scripts.
  await headers();
  return <html lang="en"><body className={`${dmSans.variable} ${dmSans.className}`}><AdminShell person={await currentStaffAccount()} customerOrigin={process.env.CERTA_WEB_ORIGIN ?? ''}>{children}</AdminShell></body></html>;
}
