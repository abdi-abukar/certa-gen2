'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode } from 'react';
import { AccountShell, type NavigationItem } from '@certa/ui-web/account-shell';
import { AccountMenu, type AccountPerson } from '@certa/ui-web/account-menu';
import { SiteFooter } from '@certa/ui-web/site-footer';
import { signOut } from '@certa/server/actions';
import styles from './admin-shell.module.css';
const groups: NavigationItem[][] = [
 [
  {href:'/puzzles',label:'Weekly Puzzle',icon:'rules'},
  {href:'/newsletter',label:'Newsletter',icon:'community'},
 ],
 [
  {href:'/coupons',label:'Coupons',icon:'tickets'},
  {href:'/tickets',label:'Tickets',icon:'tickets'},
 ],
 [
  {href:'/traders',label:'Traders',icon:'overview'},
  {href:'/accounts',label:'Trading Accounts',icon:'terminal'},
 ],
 [{href:'/compliance',label:'Compliance',icon:'compliance'}],
 [
  {href:'/risk',label:'Firm Risk/Economics',icon:'history'},
  {href:'/payouts',label:'Payouts',icon:'history'},
 ],
 [{href:'/commerce',label:'Checkout',icon:'tickets'}],
 [{href:'/affiliates',label:'Affiliates',icon:'community'}],
 [{href:'/staff',label:'Staff Accounts',icon:'security'}],
 [
  {href:'/bugs',label:'Bug Items',icon:'rules'},
  {href:'/support',label:'Customer Support',icon:'support'},
 ],
];
export function AdminShell({ children, person, customerOrigin }: { children:ReactNode; person:AccountPerson|null; customerOrigin:string }) {
 const pathname=usePathname(); const router=useRouter();
 const auth=['/','/login','/forgot-password','/reset-password','/forbidden'].includes(pathname);
 const footer=<SiteFooter customerOrigin={customerOrigin || 'https://certafutures.com'} />;
 if(!auth && person) return <AccountShell footer={footer} pathname={pathname} homeHref="/puzzles" LinkComponent={Link} key={person.email} email={person.email} groups={groups} label="Staff navigation" storageKey="certa.staff.sidebar.collapsed" signOut={signOut} profile={<AccountMenu person={person} customerOrigin={customerOrigin} onSaved={() => router.refresh()} />}>{children}</AccountShell>;
 return <div className={styles.shell} data-auth="true"><a className={styles.skip} href="#workspace">Skip to workspace</a><header className={styles.navigation}><Link className={styles.brand} href="/puzzles"><Image src="/brand/certa-crest.png" alt="" width={40} height={40} priority /><span>Certa Futures<small>Staff workspace</small></span></Link></header><main id="workspace" className={styles.workspace}>{children}</main>{footer}</div>;
}
