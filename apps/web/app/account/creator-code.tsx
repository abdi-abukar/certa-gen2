'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { commerce, type Creator } from '../checkout/model';
import styles from './creator-code.module.css';

export function CreatorCode() {
  const [creator, setCreator] = useState<Creator | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panelId = useId();
  const errorId = useId();
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    commerce<Creator | null>('creator').then(value => {
      if (active) { setCreator(value); setCode(value?.code ?? ''); setLoaded(true); }
    }).catch(() => {
      if (active) { setError('Creator codes couldn’t load. Try again when saving your code.'); setLoaded(true); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  async function save(value: string) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const next = await commerce<Creator | null>('creator', { code: value || null });
      setCreator(next); setCode(next?.code ?? ''); setOpen(false); trigger.current?.focus();
    } catch (error) { setError(error instanceof Error ? error.message : 'Couldn’t save your code.'); }
    finally { setBusy(false); }
  }

  return <section ref={root} className={styles.creator} aria-label="Creator code" onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className={styles.trigger} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={panelId} disabled={!loaded}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 4h8l10 10-7 7L3 10V4Z" /><circle cx="7.5" cy="8" r="1" /></svg>
      <span>{!loaded ? 'Loading creator code…' : creator ? <><b>{creator.code}</b>{creator.available ? creator.discount_bps > 0 ? ` · ${creator.discount_bps / 100}% off` : ' · Added' : ' · Unavailable'}</> : error ? 'Creator code unavailable' : 'Add creator code'}</span>
      <svg className={styles.chevron} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && <div id={panelId} className={styles.panel}>
      <form onSubmit={event => { event.preventDefault(); void save(code); }}>
        <label htmlFor={`${panelId}-input`}>Creator code</label>
        <p className={styles.hint}>Support your creator on your next evaluation.</p>
        <div className={styles.entry}>
          <input ref={input} id={`${panelId}-input`} value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={32} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="Enter code" required disabled={busy} aria-describedby={error ? errorId : undefined} />
          <button type="submit" className={styles.save} disabled={busy}>{busy ? 'Saving…' : 'Save code'}</button>
        </div>
        {creator && <div className={styles.saved}><span>{creator.available ? creator.discount_bps > 0 ? `${creator.discount_bps / 100}% off evaluations` : 'Supporting your creator' : 'This code is currently unavailable.'}</span><button type="button" className={styles.remove} disabled={busy} onClick={() => void save('')}>Remove</button></div>}
        {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}
      </form>
    </div>}
  </section>;
}
