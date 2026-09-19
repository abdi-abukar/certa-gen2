'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { WeeklyPuzzleCountdown } from './weekly-puzzle-countdown';
import { readPuzzle, readReward, readRewards, type LivePuzzle, type PuzzleReward } from './weekly-puzzle-contract';
import styles from './weekly-puzzle-dialog.module.css';
import { ResponsiveDialog } from './responsive-dialog';

type Load = 'loading' | 'ready' | 'error';
export function WeeklyPuzzleDialog({ onClose }: { onClose: () => void }) {
  const controller = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const [load, setLoad] = useState<Load>('loading');
  const [puzzle, setPuzzle] = useState<LivePuzzle | null>(null);
  const [reward, setReward] = useState<PuzzleReward | null>(null);
  const [guess, setGuess] = useState('');
  const [message, setMessage] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [expired, setExpired] = useState(false);
  const [soldOut, setSoldOut] = useState(false);
  const [showImage, setShowImage] = useState(false);

  async function refresh() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]);
    setLoad('loading'); setShowImage(false); setReward(null); setMessage(''); setGuess(''); setAuthRequired(false);
    try {
      const response = await fetch('/api/content/puzzles/current', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('Unavailable');
      const current = readPuzzle(await response.json());
      if (abort.signal.aborted) return;
      setPuzzle(current); setExpired(!!current && Date.parse(current.endsAt) <= Date.now()); setSoldOut(!!current && current.claimed >= current.capacity);
      if (current) {
        // Identity is checked only on opening the puzzle, never to render the marketing page.
        const rewards = await fetch(`/api/content/puzzles/rewards?puzzle_id=${current.id}`, { cache: 'no-store', signal });
        if (abort.signal.aborted) return;
        if (rewards.status === 401) setAuthRequired(true);
        else if (rewards.ok) setReward(readRewards(await rewards.json(), current.id));
        else throw new Error('Reward status unavailable');
      }
      if (!abort.signal.aborted) { setUncertain(false); setLoad('ready'); }
    } catch {
      if (!abort.signal.aborted) setLoad('error');
    }
  }

  useEffect(() => {
    void refresh();
    return () => { controller.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!puzzle) return;
    const check = () => setExpired(Date.now() >= Date.parse(puzzle.endsAt));
    const timer = setTimeout(check, Math.max(0, Date.parse(puzzle.endsAt) - Date.now()));
    document.addEventListener('visibilitychange', check);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', check); };
  }, [puzzle]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!puzzle || submitting.current || reward || uncertain) return;
    if (Date.now() >= Date.parse(puzzle.endsAt)) { setExpired(true); return; }
    submitting.current = true; setBusy(true); setMessage('');
    const abort = controller.current!;
    try {
      const response = await fetch(`/api/content/puzzles/${puzzle.id}/guess`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guess }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      });
      const body = await response.json();
      if (abort.signal.aborted) return;
      if (response.status === 401) { setAuthRequired(true); return; }
      if (body.error === 'verified_email_required') { setMessage('Confirm your email before submitting an answer.'); return; }
      if (body.error === 'rate_limited') { setMessage('You’ve used your attempts for this hour. Please try again later.'); return; }
      if (body.error === 'sold_out') { setSoldOut(true); return; }
      if (body.error === 'not_live') { setExpired(true); return; }
      if (!response.ok) throw new Error('Unknown submission');
      if (body.correct === true) setReward(readReward(body.reward, puzzle.id));
      else if (body.correct === false && Number.isInteger(body.attempts_remaining) && body.attempts_remaining >= 0 && body.attempts_remaining <= 9) {
        setMessage(`Not quite. ${body.attempts_remaining} attempts left this hour.`);
      } else throw new Error('Invalid submission response');
    } catch {
      if (!abort.signal.aborted) {
        setUncertain(true);
        setMessage('We couldn’t confirm the result. Check your reward status before submitting again.');
      }
    } finally { submitting.current = false; if (!abort.signal.aborted) setBusy(false); }
  }

  const ticketState = reward?.state === 'granted' ? 'Ticket issued' : reward?.state === 'pending' ? 'Issuance pending' : reward?.state === 'failed' ? 'Issuance needs attention' : 'Solve to unlock';
  return <ResponsiveDialog
    title={reward ? 'You solved it.' : 'A little curiosity.\nA Sunday ritual.'}
    onClose={onClose}
    artwork={<div className={styles.ticketSide} aria-label="Weekly puzzle ticket">
        <div className={styles.ticketIntro}><span>Certa Sundays</span><span>Weekly puzzle</span></div>
        <div className={styles.ticket}>
          <div className={styles.ticketTop}><Image src="/brand/certa-crest.png" alt="" width={36} height={36} /><span>Certa Futures</span></div>
          <div className={styles.foil}>
            <svg viewBox="0 0 240 100" aria-hidden="true"><path d="m0 95 62-62 31 29 38-53 109 86M106 44l25-35 30 26-23-7-13 12-9-3" /></svg>
            <span className={styles.ticketName}>The Sunday<br />ticket.</span>
            <span className={styles.seal}>{ticketState}</span>
          </div>
          <div className={styles.stub}><span>One puzzle.<br />One ticket per person.</span><span className={styles.perforation} aria-hidden="true" /></div>
        </div>
        <p className={styles.ticketNote}>{reward ? 'Your answer and ticket status are saved to your account.' : 'Solve this week’s clue to claim a ticket while supplies last.'}</p>
      </div>}>
    <div className={styles.content}>
        {load === 'loading' && <p role="status">Finding this week’s puzzle…</p>}
        {load === 'error' && <div><p role="alert">We can’t load the puzzle right now.</p><p>Please try again in a moment.</p><button type="button" className={styles.primary} onClick={() => void refresh()}>Try again</button></div>}
        {load === 'ready' && !puzzle && <div><p>No puzzle is live right now.</p><p>Next scheduled Sunday · 5 PM Toronto</p><div className={styles.timer}><WeeklyPuzzleCountdown /></div><button type="button" className={styles.secondary} onClick={() => void refresh()}>Check again</button></div>}
        {load === 'ready' && puzzle && <>
          <div className={styles.facts}><span>{Math.max(0, puzzle.capacity - puzzle.claimed)} of {puzzle.capacity} tickets remaining</span><span>{expired ? 'Puzzle closed' : <>Closes in <WeeklyPuzzleCountdown endsAt={puzzle.endsAt} /></>}</span></div>
          {puzzle.image && <button type="button" className={styles.secondary} onClick={() => setShowImage(value => !value)}>{showImage ? 'Hide clue image' : 'Show clue image / animation'}</button>}
          {puzzle.image && showImage && <Image className={styles.clueImage} width={640} height={360} sizes="(max-width: 700px) 90vw, 420px" src={puzzle.image} alt={puzzle.prompt || 'This week’s puzzle clue'} referrerPolicy="no-referrer" />}
          <p className={styles.clue}>{puzzle.prompt}</p>
          {reward ? <div className={styles.result} role="status">
            <h3>{ticketState}</h3>
            <p>{reward.state === 'granted' ? 'Your ticket is ready. Open your collection to reveal the prize.' : reward.state === 'pending' ? 'Your correct answer is saved. Your ticket will appear once issuance is confirmed.' : 'Your correct answer is saved, but the ticket could not be issued yet.'}</p>
            {reward.state === 'granted' ? <a className={styles.primary} href="/tickets">Open your tickets</a> : <button type="button" className={styles.secondary} onClick={() => void refresh()}>Refresh ticket status</button>}
          </div> : expired || soldOut ? <div><p>{expired ? 'This puzzle has ended.' : 'All tickets for this puzzle have been claimed.'}</p><button type="button" className={styles.secondary} onClick={() => void refresh()}>Check latest puzzle</button></div> : authRequired ? <div><p>Sign in with a verified email to submit your answer.</p><div className={styles.actions}><a className={styles.primary} href="/login">Log in to play</a><a className={styles.secondary} href="/signup">Get started (Free)</a></div></div> : <form onSubmit={submit}>
            <label htmlFor="weekly-answer">Your answer</label>
            <p id="weekly-answer-hint" className={styles.hint}>{puzzle.answerLength} letters or numbers · 10 attempts per hour</p>
            <input id="weekly-answer" value={guess} onChange={event => setGuess(event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} maxLength={puzzle.answerLength} autoComplete="off" spellCheck={false} autoCapitalize="characters" aria-describedby="weekly-answer-hint weekly-answer-message" disabled={busy || uncertain} required />
            <button type="submit" className={styles.primary} disabled={busy || uncertain || guess.length !== puzzle.answerLength}>{busy ? 'Checking…' : 'Submit answer'}</button>
          </form>}
          <p id="weekly-answer-message" role="status" className={styles.feedback}>{message}</p>
          {uncertain && <button type="button" className={styles.secondary} onClick={() => void refresh()}>Check reward status</button>}
        </>}
    </div>
  </ResponsiveDialog>;
}
