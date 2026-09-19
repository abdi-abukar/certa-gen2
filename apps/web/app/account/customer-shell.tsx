'use client';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { AccountMenu, type AccountPerson } from '@certa/ui-web/account-menu';
import { type ReactNode } from 'react';
import { AccountShell, type NavigationItem } from '@certa/ui-web/account-shell';
import { signOut } from '@certa/server/actions';
import { SessionRecordingArea } from './session-recorder';
import supportStyles from './support-session.module.css';
import { TradingLaunch, useTradingLaunch } from './trading-launch';
import { CustomerMasthead } from '../_components/customer-masthead';
import { CustomerSiteFooter } from '../_components/site-footer';

const tradingLinks: NavigationItem[] = [
  { label: 'Accounts', href: '/account', icon: 'overview' },
  { label: 'Purchase account', href: '/checkout', icon: 'tickets' },
];
const communityLinks: NavigationItem[] = [
  { label: 'Trader Payouts', href: '/account/payouts', icon: 'payouts' },
  { label: 'Affiliates', href: '/account/affiliates', icon: 'community' },
  { label: 'Trophy Cabinet', href: '/awards', icon: 'awards' },
];
const accountLinks: NavigationItem[] = [
  { label: 'Receipts', href: '/account/receipts', icon: 'rules' },
  { label: 'Compliance', href: '/account/compliance', icon: 'compliance' },
  { label: 'Customer Support', href: '/account/support', icon: 'support' },
];
export function CustomerShell({ person, children, supportAccess }: { person: AccountPerson & { id: string }; children: ReactNode; supportAccess?: { expiresAt: string } | null }) {
  const pathname = usePathname(); const search = useSearchParams(); const router = useRouter();
  const trading = useTradingLaunch(pathname, person.id);
  return <AccountShell footer={<CustomerSiteFooter />} masthead={<CustomerMasthead person={person} accounts={pathname === '/account' && !search.get('account') && !search.get('slot')} />} profileInMasthead sidebarAction={<TradingLaunch {...trading} />} pathname={pathname} selection={{account:search.get('account'),slot:search.get('slot')}} LinkComponent={Link} email={person.email} groups={[tradingLinks, communityLinks, accountLinks]} label="Trader navigation" storageKey="certa.customer.sidebar.collapsed" signOut={signOut} profile={<AccountMenu person={person} LinkComponent={Link} onSaved={() => router.refresh()} />}>{supportAccess && <aside className={supportStyles.banner} aria-label="Support session"><div><strong>Support session · {person.email}</strong><span>Expires {new Date(supportAccess.expiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC. Account security settings are unavailable during support access.</span></div><form action={signOut}><button>End support session</button></form></aside>}<SessionRecordingArea>{children}</SessionRecordingArea></AccountShell>;
}
