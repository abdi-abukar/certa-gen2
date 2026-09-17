import assert from 'node:assert/strict';
import test from 'node:test';
import { nextPuzzleSunday } from '../apps/web/app/_components/weekly-puzzle-schedule';

test('puzzle countdown follows Toronto Sunday 17:00 through DST and year boundaries', () => {
  for (const [now, expected] of [
    ['2026-09-16T12:00:00Z', '2026-09-20T21:00:00Z'],
    ['2026-03-07T12:00:00Z', '2026-03-08T21:00:00Z'],
    ['2026-10-31T12:00:00Z', '2026-11-01T22:00:00Z'],
    ['2026-12-31T12:00:00Z', '2027-01-03T22:00:00Z'],
    ['2026-09-20T20:59:59Z', '2026-09-20T21:00:00Z'],
    ['2026-09-20T21:00:00Z', '2026-09-27T21:00:00Z'],
  ]) assert.equal(nextPuzzleSunday(new Date(now)), Date.parse(expected));
});
