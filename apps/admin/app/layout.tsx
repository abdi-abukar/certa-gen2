import type { Metadata } from 'next';
import { headers } from 'next/headers';
import '@certa/ui-web/styles.css';
import { AdminShell } from './admin-shell';
export const metadata: Metadata = { title: 'Certa staff', description: 'Your Certa account.', robots: { index: false, follow: false } };
export default async function Layout({ children }: { children: React.ReactNode }) {
  // Dynamic rendering lets Next attach the per-request CSP nonce to its scripts.
  await headers();
  return <html lang="en"><body><AdminShell>{children}</AdminShell></body></html>;
}
