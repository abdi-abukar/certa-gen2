'use client';

import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { SessionRecording } from './session-recording';
import styles from './session-recorder.module.css';

type Phase = 'idle' | 'choosing' | 'recording' | 'stopping' | 'stopped';
function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const RecordingAccountContext = createContext<Dispatch<SetStateAction<boolean>> | null>(null);

/** Only a resolved, opened account can offer capture; the shell retains any existing footage. */
export function useRecordingAccount(accountId: string | null) {
  const setAvailable = useContext(RecordingAccountContext);
  useEffect(() => {
    setAvailable?.(!!accountId);
    return () => setAvailable?.(false);
  }, [accountId, setAvailable]);
}

export function SessionRecordingArea({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false);
  return <RecordingAccountContext.Provider value={setAvailable}>{children}<SessionRecorder canStart={available} /></RecordingAccountContext.Provider>;
}

function SessionRecorder({ canStart }: { canStart: boolean }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(600);
  const [elapsed, setElapsed] = useState(0);
  const [available, setAvailable] = useState(0);
  const [paused, setPaused] = useState(false);
  const [limited, setLimited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clip, setClip] = useState<{ url: string; name: string } | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const exportBusy = useRef(false);
  const recording = useRef<SessionRecording | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const clipUrl = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    setSupported(window.isSecureContext && typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
      typeof VideoEncoder !== 'undefined' && 'MediaStreamTrackProcessor' in window);
    const unload = (event: BeforeUnloadEvent) => {
      if (recording.current || busy.current) { event.preventDefault(); event.returnValue = ''; }
    };
    const pagehide = () => {
      generation.current++; busy.current = false;
      recording.current?.dispose(); recording.current = null;
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
      clipUrl.current = null;
      setClip(null); setPhase('idle'); setAvailable(0);
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('pagehide', pagehide);
    return () => {
      mounted.current = false;
      generation.current++;
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('pagehide', pagehide);
      recording.current?.dispose(); recording.current = null;
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const update = () => {
      const current = recording.current;
      if (!current) return;
      setElapsed((Date.now() - current.startedAt) / 1000);
      setAvailable(current.buffer.duration);
      setPaused(current.paused);
      setLimited(current.buffer.memoryLimited);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function start() {
    if (busy.current || recording.current || !supported || !canStart) return;
    busy.current = true;
    const attempt = ++generation.current;
    setError(''); setNotice(''); setPhase('choosing');
    try {
      // Keep this call directly in the click gesture: awaiting an import first
      // can lose the transient activation required by the browser's picker.
      const selected = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 15 }, width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 } },
        audio: false,
      });
      if (!mounted.current || generation.current !== attempt) { selected.getTracks().forEach(track => track.stop()); return; }
      stream.current = selected;
      const { SessionRecording } = await import('./session-recording');
      if (!mounted.current || generation.current !== attempt) { selected.getTracks().forEach(track => track.stop()); return; }
      const current = new SessionRecording(selected, failed => {
        if (!mounted.current || recording.current !== current) return;
        setPhase('stopped'); setPaused(false); setAvailable(current.buffer.duration);
        if (failed) setError('Recording was interrupted. You can still save the footage captured so far.');
        else setNotice('Recording stopped. Save your clip before leaving.');
      });
      recording.current = current;
      await current.start();
      if (!mounted.current || generation.current !== attempt) { current.dispose(); return; }
      setElapsed(0); setAvailable(0); setLimited(false); setPaused(false); setPhase('recording');
      setNotice('Recording started. Switch to your trading tab.');
    } catch (reason) {
      if (generation.current !== attempt) return;
      recording.current?.dispose(); recording.current = null;
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      if (!mounted.current) return;
      setPhase('idle');
      if (reason instanceof DOMException && reason.name === 'NotAllowedError') setNotice('Recording wasn’t started. Choose a source and allow sharing to try again.');
      else setError(reason instanceof Error && !(reason instanceof DOMException) ? reason.message : 'Could not start recording. Check screen-recording permissions or try desktop Chrome or Edge.');
    } finally { if (generation.current === attempt) busy.current = false; }
  }

  async function stop() {
    const current = recording.current;
    if (!current || phase !== 'recording') return;
    setPhase('stopping');
    await current.stop();
    if (!mounted.current) return;
    setAvailable(current.buffer.duration); setPaused(false); setPhase('stopped');
    setNotice('Recording stopped. Save your clip before leaving.');
  }

  async function save() {
    const current = recording.current;
    if (!current || exportBusy.current) return;
    exportBusy.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const blob = await current.save(seconds);
      if (!mounted.current || recording.current !== current) return;
      const url = URL.createObjectURL(blob);
      if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
      clipUrl.current = url;
      const name = `certa-trading-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      setClip({ url, name });
      const link = document.createElement('a');
      link.href = url; link.download = name;
      document.body.append(link); link.click(); link.remove();
      setNotice('Your clip is ready. If the download didn’t start, use Download clip below.');
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not prepare the clip. Try again.');
    } finally { exportBusy.current = false; if (mounted.current) setSaving(false); }
  }

  function discard() {
    if (saving || phase !== 'stopped') return;
    recording.current?.dispose(); recording.current = null; stream.current = null;
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    clipUrl.current = null;
    setClip(null); setAvailable(0); setElapsed(0); setLimited(false); setPhase('idle'); setError(''); setNotice('Recording cleared.');
  }

  if (!canStart && phase === 'idle') return null;
  const active = phase === 'recording' || phase === 'stopping';
  return <section className={styles.recorder} aria-label="Session recording">
    <div className={styles.row}>
      <div className={styles.copy}>
        <div className={styles.title}><span className={styles.dot} data-active={active && !paused} aria-hidden />
          <strong>{phase === 'choosing' ? 'Choose what to record' : active ? paused ? 'Waiting for capture' : 'Recording' : phase === 'stopped' ? 'Recording stopped' : 'Record your trading session'}</strong>
          {(active || phase === 'stopped') && <span className={styles.timer} aria-label={`${clock(elapsed)} elapsed`}>{clock(elapsed)}</span>}
        </div>
        <p>{supported === false ? 'Screen recording is available in desktop Chrome or Edge.' : phase === 'idle' || phase === 'choosing'
          ? 'Choose a tab, window, or screen. Keep up to your last 10 minutes, saved only on your device.'
          : `${clock(available)} available${limited ? ' · Shorter buffer to limit memory use' : ''}. Keep this dashboard tab open. Video only.`}</p>
        {(phase === 'idle' || phase === 'choosing') && supported !== false && <p className={styles.hint}>Video only. Keep this dashboard tab open while you trade.</p>}
      </div>
      <div className={styles.actions}>
        {phase === 'idle' || phase === 'choosing' ? <button type="button" className={styles.primary} disabled={!supported || phase === 'choosing'} onClick={() => void start()}>{phase === 'choosing' ? 'Choosing source…' : 'Start recording'}</button> : <>
          <label className={styles.duration}>Clip length<select value={seconds} onChange={event => setSeconds(Number(event.target.value))} disabled={saving}>
            <option value={60}>Last 1 minute</option><option value={300}>Last 5 minutes</option><option value={600}>Last 10 minutes</option>
          </select></label>
          <button type="button" className={styles.primary} onClick={() => void save()} disabled={saving || available < 1 || phase === 'stopping'}>{saving ? 'Preparing clip…' : 'Save clip'}</button>
          {active ? <button type="button" className={styles.secondary} onClick={() => void stop()} disabled={phase === 'stopping'}>{phase === 'stopping' ? 'Stopping…' : 'Stop'}</button>
            : <button type="button" className={styles.secondary} onClick={discard} disabled={saving}>Clear recording</button>}
        </>}
      </div>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.notice} role="status">{notice}</p>
    {clip && <div className={styles.clip}><a href={clip.url} download={clip.name}>Download clip</a><details><summary>Preview clip</summary><video src={clip.url} controls preload="metadata" aria-label="Recorded session preview" /></details></div>}
  </section>;
}
