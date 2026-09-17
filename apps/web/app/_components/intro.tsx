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
  { title: 'About Certa', eyebrow: 'About Certa Futures', icon: 'about', headline: 'One account. One size.', copy: 'One account type, one size and a straightforward path to getting started. Explore the account before you trade.', cta: 'Explore the account', href: '#account-plan-heading', chapter: 0 },
  { title: 'Certa Transparency', eyebrow: 'Certa Transparency', icon: 'transparency', headline: 'Fair trading. Clear rules.', copy: 'Certa Futures is committed to a fair, transparent trading experience. Read the targets, limits and rules before you decide.', cta: 'Read the rules', href: '#account-plan-heading', chapter: 3 },
  { title: 'Certa Community', eyebrow: 'Certa Community', icon: 'community', headline: 'Join us on Certa Sundays.', copy: 'Meet other traders, share ideas and find out what’s happening on Certa Sundays. Join the conversation on Discord.', cta: 'Join Discord', href: 'https://discord.gg/certa' },
  { title: 'Affiliates', eyebrow: 'Affiliate Program', icon: 'affiliates', headline: 'Open to all traders.', copy: 'Create content, invite friends and introduce more traders to Certa. Ask our team how affiliate rewards work.', cta: 'Ask about affiliates', href: 'https://discord.gg/certa' },
  { title: 'Certa Rewards', eyebrow: 'Certa Rewards', icon: 'rewards', headline: 'A new challenge each week.', copy: 'Put your problem-solving skills to the test. Open the weekly puzzle to see the current clue and available ticket rewards.', cta: 'Try the weekly puzzle', action: 'puzzle' },
] as const;

export function Intro() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [guideChapter, setGuideChapter] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const authDialog = useAuthDialog();
  const journey = useIntroJourney(authDialog.open || puzzleOpen);
  const featured = journey.callout?.visible ? sceneTopics[journey.callout.index] : null;

  useEffect(() => {
    // A failed/slow image must not leave the introduction or its links hidden.
    const timer = window.setTimeout(() => setBackgroundReady(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);

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
    <div className={styles.landing} data-featured={Boolean(featured)} data-background-ready={backgroundReady || journey.ready}>
    <Image src="/game/firm-landscape.webp" alt="" fill preload unoptimized className={styles.heroBackdrop}
      onLoad={() => setBackgroundReady(true)} onError={() => setBackgroundReady(true)} />
    <noscript><style>{`.${styles.landing}[data-background-ready='false'] .${styles.hero} { visibility: visible; }`}</style></noscript>
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
          <VillageGraphic kind={featured.icon} className={styles.featureGraphic} />
          <h2><span className={styles.featureEyebrow}>{featured.eyebrow}</span>{featured.headline}</h2>
          <p className={styles.featureDescription}>{featured.copy}</p>
          <div className={styles.featureLinks}>
            {'href' in featured ? <a href={featured.href} data-action="primary" onClick={event => {
              if ('chapter' in featured) { event.preventDefault(); navigateSection('account-plan-heading', featured.chapter); }
            }}>{featured.cta}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></a> :
              <button type="button" data-action="primary" onClick={() => setPuzzleOpen(true)}>{featured.cta}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></button>}
          </div>
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
      {journey.ready && !journey.reduced && <button ref={journey.characterRef} className={styles.characterControl}
        type="button" aria-label="Make the character jump" onClick={journey.jump} />}
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
