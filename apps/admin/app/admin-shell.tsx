'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './admin-shell.module.css';
const links = [['/puzzles', 'Weekly puzzles', '01'], ['/awards', 'Awards', '02'], ['/discord', 'Community', '03'], ['/vendors', 'Connections', '04'], ['/staff', 'Manage staff', '05'], ['/account', 'My account', '06']];
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const auth = ['/', '/login', '/forgot-password', '/reset-password', '/forbidden'].includes(pathname);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  return <div className={styles.shell} data-auth={auth}>
    <a className={styles.skip} href="#workspace">Skip to workspace</a>
    <header ref={header} className={styles.navigation}>
      <Link className={styles.brand} href="/puzzles"><svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><path d="M16 2 29 8v10c0 6-13 12-13 12S3 24 3 18V8Z" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="m7 21 6-10 4 7 3-4 5 7" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg><span>Certa<small>Staff workspace</small></span></Link>
      {!auth && <><button ref={toggle} className={styles.toggle} type="button" aria-expanded={open} aria-controls="staff-navigation" onClick={() => setOpen(value => !value)}>{links.find(([href]) => pathname.startsWith(href))?.[1] ?? 'Menu'}<span aria-hidden="true">{open ? '−' : '+'}</span></button>
      <nav id="staff-navigation" aria-label="Staff navigation" className={styles.links} data-open={open}>
        <p>Workspace</p>{links.map(([href, label, number]) => <Link key={href} href={href} aria-current={pathname.startsWith(href) ? 'page' : undefined} onClick={() => setOpen(false)}><span aria-hidden="true">{number}</span>{label}</Link>)}
      </nav><p className={styles.footnote}>A clearer view.<br/>A stronger firm.</p></>}
    </header>
    <main id="workspace" className={styles.workspace}>{children}</main>
  </div>;
}
