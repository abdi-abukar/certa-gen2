'use client';

import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthForm } from '../auth-form';
import { ResponsiveDialog } from './responsive-dialog';
import styles from './auth-dialog.module.css';

type Mode = 'signup' | 'login' | 'recover';
const AuthDialogContext = createContext<{ open: boolean; show: (mode: Mode) => void }>({ open: false, show: () => {} });
export const useAuthDialog = () => useContext(AuthDialogContext);

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [selection, setSelection] = useState<{ mode: Mode; pathname: string } | null>(null);
  useEffect(() => setSelection(null), [pathname]);
  const active = selection?.pathname === pathname ? selection : null;
  const show = (mode: Mode) => setSelection({ mode, pathname });
  return <AuthDialogContext.Provider value={{ open: Boolean(active), show }}>
    {children}
    {active && <ResponsiveDialog
      title={active.mode === 'signup' ? 'Your story starts here.' : active.mode === 'login' ? 'Welcome back.' : 'Reset your password.'}
      description={active.mode === 'signup' ? 'Create your Certa profile. Start by choosing a password of at least 12 characters.' : active.mode === 'login' ? 'Sign in to your Certa account.' : 'We’ll email you a link to choose a new password.'}
      onClose={() => setSelection(null)}
      mobileArtwork="strip"
      contentSized
      artwork={<a href="/community" className={styles.art}>
        <div className={styles.landscape} aria-hidden="true" />
        <div className={styles.artCopy}>
          <span className={styles.artLabel}>Inside Certa <span aria-hidden="true">·</span> Community</span>
          <h3>A place for traders.<br />And everything<br className={styles.desktopBreak} /> in between.</h3>
          <p>Conversations, fresh perspectives, and a Sunday ritual. Get to know the people behind the screens.</p>
          <span className={styles.artLink}>Explore the community <span aria-hidden="true">↗</span></span>
        </div>
      </a>}>
      <div className={styles.form}>
        <AuthForm key={active.mode} mode={active.mode} passwordHelp={<button className={`${styles.textButton} ${styles.passwordHelp}`} type="button" onClick={() => show('recover')}>Forgot password?</button>} />
        <p className={styles.switch}>{active.mode === 'signup' ? 'Already have an account?' : active.mode === 'login' ? 'New to Certa?' : 'Remember your password?'}{' '}
          <button className={styles.textButton} type="button" onClick={() => show(active.mode === 'login' ? 'signup' : 'login')}>{active.mode === 'login' ? 'Create an account' : 'Sign in'}</button>
        </p>
      </div>
    </ResponsiveDialog>}
  </AuthDialogContext.Provider>;
}

/** Keep an ordinary route fallback, including modifier-click/open-in-new-tab. */
export function AuthDialogLink({ mode, onClick, ...props }: Omit<ComponentProps<'a'>, 'href'> & { mode: Mode }) {
  const { show } = useAuthDialog();
  return <a {...props} href={mode === 'recover' ? '/forgot-password' : `/${mode}`} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    show(mode);
  }} />;
}
