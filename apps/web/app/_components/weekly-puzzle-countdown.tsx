'use client';

import { useEffect, useState } from 'react';

import { nextPuzzleSunday } from './weekly-puzzle-schedule';

export function WeeklyPuzzleCountdown({ endsAt }: { endsAt?: string } = {}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let target = endsAt ? Date.parse(endsAt) : nextPuzzleSunday(new Date());
    const update = () => {
      const now = Date.now();
      if (!endsAt && now >= target) target = nextPuzzleSunday(new Date(now));
      setRemaining(Math.max(0, Math.ceil((target - now) / 1000)));
    };
    const sync = () => {
      clearInterval(timer);
      if (!document.hidden) { update(); timer = setInterval(update, 1000); }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sync); };
  }, [endsAt]);

  if (remaining === null) return <span>{endsAt ? 'Calculating…' : 'Sunday · 5 PM Toronto'}</span>;
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor(remaining / 3600) % 24;
  const minutes = Math.floor(remaining / 60) % 60;
  const seconds = remaining % 60;
  return <span aria-live="off" aria-label={`${endsAt ? 'Puzzle closes in' : 'Next scheduled Sunday:'} ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`}>
    {days}d {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}m {String(seconds).padStart(2, '0')}s
  </span>;
}
