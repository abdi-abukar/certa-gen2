'use client';

import { createContext, useContext, useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import styles from './account-shell.module.css';
import { PageMasthead } from './page-masthead';

export type IconName = 'overview' | 'history' | 'payouts' | 'terminal' | 'rules' | 'awards' | 'tickets' | 'community' | 'compliance' | 'security' | 'support' | 'signout' | 'menu' | 'close' | 'collapse';
export type NavigationItem = { label: string; href: string; icon: IconName };

type ShellOptions = { groups: NavigationItem[][]; label: string; storageKey: string; signOut: () => Promise<void>; profile: ReactNode; sidebarAction?: ReactNode; pathname: string; selection?: { account?: string | null; slot?: string | null }; LinkComponent: ElementType; homeHref?: string };
const ShellContext = createContext<ShellOptions>(null!);
function ShellIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    history: <><path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
    payouts: <><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9h.01M18 15h.01M2 10a5 5 0 0 0 5-5m10 14a5 5 0 0 1 5-5" /></>,
    terminal: <><rect x="2.5" y="3.5" width="19" height="13" rx="2" /><path d="M8 21h8m-4-4.5V21M6 12l4-4 4 3 4-4" /></>,
    rules: <><path d="M6 3h11a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 14h15M8 7h7m-7 4h5" /></>,
    awards: <><path d="M8 3h8v5a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v5m-4 4h8m-9 0 1-4h6l1 4" /></>,
    tickets: <><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Zm12-2v2m0 4v2m0 4v2" /></>,
    community: <><path d="M21 11.5A8.5 8.5 0 0 1 12.5 20H4l-1 1v-9.5a9 9 0 0 1 18 0Z" /><path d="M8 10h8m-8 4h5" /></>,
    compliance: <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    security: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    support: <><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 12H3v6h4v-6H4Zm16 0h1v6h-4v-6h3Zm0 6c0 3-4 3-7 3" /></>,
    signout: <><path d="M9 4H4v16h5m5-13 5 5-5 5M8 12h12" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    collapse: <path d="m14 6-6 6 6 6" />,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  const { LinkComponent: Link, homeHref = '/' } = useContext(ShellContext);
  return <Link href={homeHref} className={styles.brand} aria-label="Certa Futures home">
    <img src="/brand/certa-crest.png" width={34} height={34} alt="" />
    {!compact && <span>Certa Futures</span>}
  </Link>;
}

function Navigation({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { pathname, selection: chosen, LinkComponent: Link } = useContext(ShellContext);
  const account = chosen?.account;
  const slot = chosen?.slot;
  const selection = new URLSearchParams();
  if (account) selection.set('account', account);
  else if (slot) selection.set('slot', slot);
  const { groups, label } = useContext(ShellContext);
  return <nav className={styles.navigation} aria-label={label}>
    {groups.map((group, index) => <ul key={index} className={styles.navGroup}>
      {group.map(item => {
        const active = item.href === '/account' ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const carriesSelection = ['/account/terminal', '/account/rules', '/account/compliance', '/account/support'].includes(item.href);
        const href = carriesSelection && selection.size ? `${item.href}?${selection}` : item.href;
        return <li key={item.href}><Link href={href} className={styles.navLink} aria-current={active ? 'page' : undefined}
          aria-label={compact ? item.label : undefined} title={compact ? item.label : undefined} onClick={onNavigate}>
          <ShellIcon name={item.icon} />{!compact && <span>{item.label}</span>}
        </Link></li>;
      })}
    </ul>)}
  </nav>;
}

function SignOutButton({ compact }: { compact: boolean }) {
  const { pending } = useFormStatus();
  return <button className={styles.signOut} type="submit" disabled={pending} aria-label={pending ? 'Signing out' : 'Sign out'} title={compact ? 'Sign out' : undefined}>
    <ShellIcon name="signout" />{!compact && <span>{pending ? 'Signing out…' : 'Sign out'}</span>}
  </button>;
}

function SidebarFooter({ compact = false, showProfile = true, onNavigate }: { compact?: boolean; showProfile?: boolean; onNavigate?: () => void }) {
  const { profile, signOut, sidebarAction } = useContext(ShellContext);
  return <>
    {sidebarAction && <div className={styles.sidebarAction}>
      <div className={styles.launchAction} onClick={onNavigate}>{sidebarAction}</div>
      <form action={signOut} className={styles.inlineSignOut}><SignOutButton compact /></form>
    </div>}
    {(showProfile || !sidebarAction) && <div className={styles.profile} data-compact={compact}>
      {showProfile && profile}
      {!sidebarAction && <form action={signOut} className={styles.signOutForm}><SignOutButton compact={compact} /></form>}
    </div>}
  </>;
}

function NavigationDrawer({ onClose }: { onClose: () => void }) {
  const { label } = useContext(ShellContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const backdropPressed = useRef(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const body = document.body;
    const rootOverflow = root.style.overflow;
    const originalBody = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow };
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    root.style.overflow = 'hidden';
    Object.assign(body.style, { position: 'fixed', top: `${-scrollY}px`, left: `${-scrollX}px`, width: '100%', overflow: 'hidden' });
    element.showModal();
    closeButton.current?.focus({ preventScroll: true });
    const desktop = window.matchMedia('(min-width: 900px)');
    const handleResize = () => { if (desktop.matches) onCloseRef.current(); };
    desktop.addEventListener('change', handleResize);
    return () => {
      desktop.removeEventListener('change', handleResize);
      element.close();
      root.style.overflow = rootOverflow;
      Object.assign(body.style, originalBody);
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className={styles.drawer} aria-label={label} onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { backdropPressed.current = event.target === event.currentTarget; }}
    onClick={event => { if (event.target === event.currentTarget && backdropPressed.current) onClose(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <div className={styles.drawerPanel}>
      <div className={styles.drawerTop}><Brand /><button ref={closeButton} className={styles.iconButton} type="button" aria-label="Close navigation" onClick={onClose}><ShellIcon name="close" /></button></div>
      <Navigation onNavigate={onClose} />
      <SidebarFooter onNavigate={onClose} />
    </div>
  </dialog>;
}

export function AccountShell({ email, children, groups, label, storageKey, signOut, profile, sidebarAction, pathname, selection, LinkComponent, homeHref, masthead, footer, profileInMasthead = false }: ShellOptions & { email: string | null; children: ReactNode; masthead?: ReactNode; footer?: ReactNode; profileInMasthead?: boolean }) {
  const collapsedKey = storageKey;
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(collapsedKey) === 'true'); } catch { /* Navigation works without storage. */ }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem(collapsedKey, String(next)); } catch { /* Keep the preference for this visit. */ }
  }

  return <ShellContext.Provider value={{ groups, label, storageKey, signOut, profile, sidebarAction, pathname, selection, LinkComponent, homeHref }}><div className={styles.shell} data-collapsed={collapsed}>
    <a className={styles.skipLink} href="#account-main">Skip to content</a>
    <aside className={styles.sidebar}>
      <div className={styles.sidebarTop}><Brand compact={collapsed} /></div>
      <Navigation compact={collapsed} />
      <button type="button" className={styles.collapseButton} onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}><ShellIcon name="collapse" /></button>
      <div className={styles.sidebarBottom}>
        <SidebarFooter compact={collapsed} showProfile={!profileInMasthead} />
      </div>
    </aside>
    <div className={styles.mobileHeader}>
      <Brand />
      <button className={styles.iconButton} type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><ShellIcon name="menu" /></button>
    </div>
    <main className={styles.main} id="account-main" tabIndex={-1}>{masthead ?? <PageMasthead />}{children}</main>
    {footer && <div className={styles.siteFooter}>{footer}</div>}
    {drawerOpen && <NavigationDrawer onClose={() => setDrawerOpen(false)} />}
  </div></ShellContext.Provider>;
}
