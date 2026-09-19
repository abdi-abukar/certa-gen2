'use client';

import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthForm } from '../auth-form';
import { LoginForm } from './login-form';
import { SignupForm } from './signup-form';
import { VillageGraphic } from './village-graphic';
import { ResponsiveDialog } from './responsive-dialog';
import styles from './auth-dialog.module.css';

type Mode = 'signup' | 'login' | 'recover';
const AuthDialogContext = createContext<{ open: boolean; show: (mode: Mode) => void }>({ open: false, show: () => {} });
export const useAuthDialog = () => useContext(AuthDialogContext);

const copy: Record<Mode, { title: string; description?: string }> = {
  signup: { title: 'Create your account.' },
  login: { title: 'Welcome back.' },
  recover: { title: 'Reset your password.', description: 'We’ll email you a link to choose a new password.' },
};

const PERKS = [
  { icon: 'payout', title: '100% payout split', detail: 'Keep every approved reward.' },
  { icon: 'news', title: 'No news trading restrictions', detail: 'Trade through market-moving news.', scope: 'Eval & funded' },
  { icon: 'cadence', title: 'No consistency rules', detail: 'One strong day will not disqualify you.', scope: 'Eval & funded' },
  { icon: 'purchase', title: 'One-time purchase', detail: 'Pay once. No recurring subscription.' },
  { icon: 'fee', title: 'No activation fee', detail: 'No extra fee to start your funded account.' },
] as const;

const LOGIN_FEATURES = [
  { icon: 'about', title: 'Start your next evaluation', detail: 'Take the next step in your trading journey.' },
  { icon: 'rewards', title: 'Explore your rewards', detail: 'Find your tickets and revealed prizes.' },
  { icon: 'purchase', title: 'See your achievements', detail: 'Visit your awards and certificates.' },
  { icon: 'community', title: 'Join the conversation', detail: 'Connect with the Certa trading community.' },
  { icon: 'transparency', title: 'Manage your account', detail: 'Keep your sign-in and security up to date.' },
] as const;

/** The editorial panel explains the moment: joining, a welcome back, or recovery. */
export function AuthPanel({ mode }: { mode: Mode }) {
  const items = mode === 'login' ? LOGIN_FEATURES : PERKS;
  if (mode !== 'recover') return <div className={styles.art}>
    <div className={styles.landscape} aria-hidden="true" />
    <div className={styles.artCopy}>
      {mode === 'signup' && <span className={styles.artLabel}>Welcome to Certa Futures</span>}
      <h3>{mode === 'login' ? <>Your trading journey.<br />All in one place.</> : <>One evaluation.<br />One funded account.</>}</h3>
      <div className={styles.perksMarquee}>
        <div className={styles.perksViewport} tabIndex={0} role="region" aria-label={mode === 'login' ? 'What you can do on Certa' : 'Certa account perks'}>
          <div className={styles.perksTrack}>
            {[false, true].map(duplicate => <ul className={styles.perks} key={String(duplicate)} aria-hidden={duplicate || undefined}>
              {items.map(perk => <li key={perk.title}>
                <VillageGraphic kind={perk.icon} className={styles.perkIcon} />
                <span className={styles.perkText}>{'scope' in perk && <small className={styles.perkScope}>{perk.scope}</small>}<strong>{perk.title}</strong><span>{perk.detail}</span></span>
              </li>)}
            </ul>)}
          </div>
        </div>
      </div>
    </div>
  </div>;
  return <div className={styles.art}>
    <div className={styles.landscape} aria-hidden="true" />
    <div className={styles.artCopy}>
      <span className={styles.artLabel}>Account recovery</span>
      <h3>Let’s get you back in.</h3>
      <p>We send a reset link to the email on your account. Nothing changes until you choose a new password.</p>
    </div>
  </div>;
}

/** The switch row stays a clear, separate action so it reads well on a phone. */
export function AuthSwitch({ mode, onSwitch }: { mode: Mode; onSwitch: (mode: Mode) => void }) {
  const next: Mode = mode === 'login' ? 'signup' : 'login';
  return <div className={styles.switch}>
    <span>{mode === 'signup' ? 'Already have an account?' : mode === 'login' ? 'New to Certa?' : 'Remember your password?'}</span>
    <button className={styles.switchButton} type="button" onClick={() => onSwitch(next)}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button>
  </div>;
}

export function AuthContent({ mode, onSwitch }: { mode: Mode; onSwitch: (mode: Mode) => void }) {
  return <div className={styles.form}>
    {mode === 'signup' ? <SignupForm onLogin={() => onSwitch('login')} />
      : mode === 'login' ? <LoginForm onRecover={() => onSwitch('recover')} onSignup={() => onSwitch('signup')} />
      : <AuthForm mode="recover" />}
    {mode === 'recover' && <AuthSwitch mode={mode} onSwitch={onSwitch} />}
  </div>;
}

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [selection, setSelection] = useState<{ mode: Mode; pathname: string } | null>(null);
  useEffect(() => setSelection(null), [pathname]);
  const active = selection?.pathname === pathname ? selection : null;
  const show = (mode: Mode) => setSelection({ mode, pathname });
  return <AuthDialogContext.Provider value={{ open: Boolean(active), show }}>
    {children}
    {active && <ResponsiveDialog
      title={copy[active.mode].title}
      description={copy[active.mode].description}
      onClose={() => setSelection(null)}
      mobileArtwork="strip"
      contentSized
      artwork={<AuthPanel mode={active.mode} />}>
      <AuthContent key={active.mode} mode={active.mode} onSwitch={show} />
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
