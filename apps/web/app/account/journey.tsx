'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './dashboard.module.css';

export type JourneyPhase = 'empty' | 'pending' | 'evaluation' | 'practice' | 'funded' | 'passed' | 'failed' | 'locked';
export function JourneyScene({ userId, accountId, phase, progress, targetLabel, initialized = true }: { userId: string; accountId: string; phase: JourneyPhase; progress: number; targetLabel?: string; initialized?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const previous = useRef<number | undefined>(undefined);
  const state = useRef({ accountId, phase, progress, targetLabel, initialized });
  state.current = { accountId, phase, progress, targetLabel, initialized };
  const key = `certa:journey:${userId}:${accountId}:${phase}`;
  const configure = useCallback(() => {
    const current = state.current;
    frame.current?.contentWindow?.postMessage({ type: 'certa:dashboard-state', ...current,
      phase: current.initialized || previous.current !== undefined ? current.phase : 'pending',
      progress: current.initialized ? current.progress : previous.current ?? 0,
      previousProgress: previous.current,
      reducedMotion: !current.initialized || window.matchMedia('(prefers-reduced-motion: reduce)').matches }, window.location.origin);
  }, []);
  useEffect(() => {
    try { const saved = sessionStorage.getItem(key); previous.current = saved !== null && Number.isFinite(Number(saved)) ? Number(saved) : undefined; } catch { previous.current = undefined; }
    configure();
  }, [key, configure]);
  useEffect(() => { if (ready) configure(); }, [ready, accountId, phase, progress, targetLabel, initialized, configure]);
  useEffect(() => {
    let loaded = false;
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'certa:dashboard-ready') { loaded = true; setReady(true); setUnavailable(false); configure(); }
      if (event.data?.type === 'certa:dashboard-error') setUnavailable(true);
      if (event.data?.type === 'certa:dashboard-settled' && state.current.initialized && event.data.accountId === state.current.accountId && Number.isFinite(event.data.progress)) {
        try { sessionStorage.setItem(`certa:journey:${userId}:${state.current.accountId}:${state.current.phase}`, String(event.data.progress)); } catch { /* Presentation can run without browser storage. */ }
        previous.current = event.data.progress;
      }
    };
    addEventListener('message', receive);
    const timeout = setTimeout(() => { if (!loaded) setUnavailable(true); }, 12000);
    return () => { removeEventListener('message', receive); clearTimeout(timeout); };
  }, [configure, userId]);
  useEffect(() => {
    if (!ready) return;
    let intersecting = true;
    const sync = () => frame.current?.contentWindow?.postMessage({ type: document.hidden || !intersecting ? 'certa:pause' : 'certa:resume' }, location.origin);
    const observer = new IntersectionObserver(entries => { intersecting = entries[0]?.isIntersecting ?? false; sync(); });
    if (surface.current) observer.observe(surface.current);
    document.addEventListener('visibilitychange', sync);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', configure);
    sync();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); motion.removeEventListener('change', configure); };
  }, [ready, configure]);
  return <div className={styles.scene} ref={surface} aria-label="Your account journey">
    {(!ready || unavailable) && <img className={styles.sceneFallback} src="/game/world-background.png" alt="" />}
    <iframe ref={frame} className={styles.sceneFrame} style={{ opacity: ready && !unavailable ? 1 : 0 }} src="/game/index.html?mode=dashboard" title="Certa account journey" tabIndex={-1} sandbox="allow-scripts allow-same-origin" onLoad={configure} onError={() => setUnavailable(true)} />
    <div className={styles.sceneFade} />
    <span className={styles.srOnly}>{!initialized ? 'Awaiting updated journey progress.' : phase === 'passed' ? 'Evaluation passed.' : phase === 'failed' ? 'This account is no longer active.' : `Journey progress ${Math.round(progress * 100)} percent.`}</span>
  </div>;
}
