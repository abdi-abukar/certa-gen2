'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntroJourney } from './use-intro-journey';
import styles from './intro.module.css';
import { AccountGuide } from './account-guide';
import { WeeklyPuzzleCountdown } from './weekly-puzzle-countdown';
import { VillageGraphic } from './village-graphic';
import { WeeklyPuzzleDialog } from './weekly-puzzle-dialog';
import { AuthDialogLink, useAuthDialog } from './auth-dialog';

const sceneTopics = [
  { title: 'About Certa', eyebrow: 'About Certa Futures', headline: 'One account. One size.', copy: 'Certa Futures offers one account and one size: a free, simple place to start trading.', cta: 'Learn more', href: '#account-plan-heading' },
  { title: 'Certa Transparency', eyebrow: 'Certa Transparency', headline: 'Fair trading. Clear rules.', copy: 'Certa Futures is committed to a fair, transparent trading experience, with clear rules and an open view of trader progress.', cta: 'Learn more', href: null },
  { title: 'Certa Community', headline: 'Trading has a social side.', copy: 'Meet other traders, exchange perspectives and stay connected. There’s more to Certa than an account page.', cta: 'Explore the community', href: '/community' },
  { title: 'Affiliates', eyebrow: 'Affiliates', headline: 'Open to all.', copy: 'Certa Futures rewards you for creating content, inviting friends and sharing Certa with your community.', cta: 'Learn more', href: '/community' },
  { title: 'Bugs & Roadmap', headline: 'Help shape what comes next.', copy: 'Have an idea or spotted something that could work better? Join the conversation with the Certa community.', cta: 'Join the conversation', href: '/community' },
] as const;

export function Intro() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [guideChapter, setGuideChapter] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const authDialog = useAuthDialog();
  const journey = useIntroJourney(authDialog.open || puzzleOpen);
  const featured = journey.callout?.visible ? sceneTopics[journey.callout.index] : null;

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 0);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('pageshow', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('pageshow', schedule);
    };
  }, []);

  const navigateSection = useCallback((id: string, chapter?: number) => {
    setMenuOpen(false);
    if (chapter !== undefined) setGuideChapter(chapter);
    const section = document.getElementById(id);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!navigation.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', outside);
    };
  }, [menuOpen]);

  return <div className={styles.home}>
    <a className={styles.skipLink} href="#introduction">Skip to introduction</a>
    <header className={`${styles.header} ${scrolled || menuOpen ? styles.headerSolid : featured ? styles.headerShaded : ''}`} ref={navigation}>
      <a className={styles.brand} href="/" aria-label="Certa Futures home">
        <Image src="/brand/certa-crest.png" alt="" width={46} height={46} priority />
        <span className={styles.wordmark}>Certa Futures</span>
      </a>

      <div id="certa-navigation" className={`${styles.navigation} ${menuOpen ? styles.navigationOpen : ''}`}>
        <nav className={styles.topicNavigation} aria-label="Discover Certa">
          <button type="button" data-action="ghost" onClick={() => navigateSection('account-plan-heading', 0)}>Account Rules</button>
          <button type="button" data-action="ghost" className={styles.liveProgress} aria-disabled="true">
            Live Trader Progress <span className={styles.liveIndicator} aria-hidden="true" />
          </button>
          <button type="button" data-action="ghost" aria-disabled="true">Customer Support</button>
          <a href="/community" data-action="ghost" onClick={() => setMenuOpen(false)}>Certa Sundays</a>
          <button type="button" data-action="ghost" aria-disabled="true">Bug Reports</button>
        </nav>
      </div>
      <div className={styles.navActions}>
        <AuthDialogLink mode="login" data-action="ghost" className={styles.loginButton} aria-label="Log In" title="Log In" onClick={() => setMenuOpen(false)}>
          <span>Log In</span>
          <svg className={styles.loginIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M3 12h12m-4-4 4 4-4 4" />
          </svg>
        </AuthDialogLink>
        <AuthDialogLink mode="signup" data-action="primary" onClick={() => setMenuOpen(false)}>Get Started</AuthDialogLink>
      </div>
      <button ref={menuButton} type="button" data-action="ghost" className={styles.menuToggle}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen} aria-controls="certa-navigation"
        onClick={() => setMenuOpen(open => !open)}>
        <span>{menuOpen ? 'Close' : 'Menu'}</span>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          {menuOpen ? <path d="m4 4 10 10M14 4 4 14" /> : <path d="M2 4h14M2 9h14M2 14h14" />}
        </svg>
      </button>
    </header>

    <main className={styles.siteMain}>
    <div className={styles.scrollTrack} ref={journey.trackRef}>
    <div className={styles.landing} data-featured={Boolean(featured)}>
    <section id="introduction" className={styles.hero} tabIndex={-1}>
      <div className={styles.copy}>
        <h1 id="why-certa" tabIndex={-1} className={styles.headline}>
          <span>The world’s simplest</span>{' '}
          <span>futures prop firm.</span>
        </h1>
        <p className={styles.heroDescription}>A clear account, straightforward rules, and a community to explore along the way.</p>
        <div className={styles.heroActions}>
          <AuthDialogLink mode="signup" data-action="primary">Get started (Free)
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 9h12m-5-5 5 5-5 5" /></svg>
          </AuthDialogLink>
          <button type="button" data-action="secondary" className={styles.puzzleButton} onClick={() => setPuzzleOpen(true)}>
            <span>Weekly puzzle</span>
            <span className={styles.countdown}><WeeklyPuzzleCountdown /></span>
          </button>
        </div>
      </div>
      <div className={styles.featureArea} role="region" aria-label="Village details"
        onFocusCapture={() => journey.setFocused(true)}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) journey.setFocused(false); }}>
        <label className={styles.topicPicker} data-fallback={!journey.ready || journey.reduced}>
          <span>Explore the village</span>
          <select value={journey.callout?.index ?? ''} onChange={event => journey.selectTopic(Number(event.target.value))}>
            <option value="" disabled>Choose a landmark</option>
            {sceneTopics.map((topic, index) => <option key={topic.title} value={index}>{topic.title}</option>)}
          </select>
        </label>
        {featured && <article key={featured.title} className={styles.featurePanel}
          onPointerEnter={() => journey.setHovered(true)} onPointerLeave={() => journey.setHovered(false)}>
          <VillageGraphic index={journey.callout!.index} className={styles.featureGraphic} />
          <h2>{'eyebrow' in featured && <span className={styles.featureEyebrow}>{featured.eyebrow}</span>}{featured.headline}</h2>
          <p className={styles.featureDescription}>{featured.copy}</p>
          <nav className={`${styles.featureLinks} ${'eyebrow' in featured ? styles.featureButtons : ''}`} aria-label={`${featured.title} links`}>
            {featured.href ? <a href={featured.href} data-action={'eyebrow' in featured ? 'secondary' : undefined} onClick={event => {
              if (featured.href?.startsWith('#')) { event.preventDefault(); navigateSection('account-plan-heading', 0); }
            }}>{featured.cta}<span aria-hidden="true">↗</span></a> : <button type="button" data-action="secondary" disabled title="Live Trader Progress is not available yet">{featured.cta}</button>}
            {featured.title === 'About Certa' ? <a href="https://discord.gg/certa" data-action="secondary">
              <svg className={styles.discordIcon} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515c-.211.375-.457.88-.626 1.281a18.27 18.27 0 0 0-5.413 0 12.64 12.64 0 0 0-.636-1.281A19.736 19.736 0 0 0 3.87 4.37C.78 8.94-.057 13.4.362 17.8a19.9 19.9 0 0 0 5.994 3.03c.486-.66.918-1.36 1.29-2.1a12.9 12.9 0 0 1-2.032-.975c.17-.123.337-.251.498-.383 3.927 1.814 8.193 1.814 12.073 0 .163.132.33.26.499.383-.645.38-1.327.707-2.033.976.372.738.804 1.44 1.29 2.1a19.84 19.84 0 0 0 6.003-3.03c.49-5.1-.838-9.522-3.627-13.43ZM8.02 15.12c-1.18 0-2.15-1.08-2.15-2.41s.95-2.42 2.15-2.42c1.2 0 2.17 1.09 2.15 2.42 0 1.33-.95 2.41-2.15 2.41Zm7.96 0c-1.18 0-2.15-1.08-2.15-2.41s.95-2.42 2.15-2.42c1.2 0 2.17 1.09 2.15 2.42 0 1.33-.94 2.41-2.15 2.41Z" />
              </svg>
              Join community
            </a> : !('eyebrow' in featured) && <AuthDialogLink mode="signup">Get started (Free)<span aria-hidden="true">↗</span></AuthDialogLink>}
          </nav>
        </article>}
      </div>
    </section>
      {journey.ready && <div className={styles.landmarkTitles} aria-hidden="true">
        {journey.landmarks.map(landmark => <span key={landmark.index} className={styles.landmarkTitle}
          style={{ left: `${landmark.x * 100}%`, top: `${landmark.y * 100}%` }}>
          {sceneTopics[landmark.index].title}
        </span>)}
      </div>}
      <section className={styles.journey} aria-label="Background animation" ref={journey.regionRef}>
        <div className={styles.scene} aria-hidden="true">
          {journey.frameSource && <iframe
            ref={journey.frameRef}
            className={`${styles.gameFrame} ${journey.ready ? styles.gameReady : ''}`}
            src={journey.frameSource}
            title="Decorative Certa character walking through the village and looking at five landmarks"
            tabIndex={-1} loading="eager"
          />}
        </div>
      </section>
      <div className={styles.sceneShade} aria-hidden="true" />
      <a className={styles.rulesLink} href="#account-plan-heading" onClick={event => {
        event.preventDefault();
        navigateSection('account-plan-heading', 0);
      }}>
        <span>Account rules</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4v15m-6-6 6 6 6-6" />
        </svg>
      </a>

  </div></div>
    <AccountGuide active={guideChapter} onChapterChange={setGuideChapter} />
    </main>
    {puzzleOpen && <WeeklyPuzzleDialog onClose={() => setPuzzleOpen(false)} />}
  </div>;
}
