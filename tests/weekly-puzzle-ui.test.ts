import assert from 'node:assert/strict';
import test from 'node:test';
import { readPuzzle, readReward, readRewards } from '../apps/web/app/_components/weekly-puzzle-contract';
const id = '11111111-1111-4111-8111-111111111111';
const item = { id, prompt: 'A synthetic clue', answer_mask: '_____', starts_at: '2026-09-13T21:00:00Z', ends_at: '2026-09-20T21:00:00Z', image_id: null, reward_cap: 100, claimed: 4 };
test('live puzzle view reads server dates, answer length and remaining capacity', () => {
  assert.equal(readPuzzle({ item })?.answerLength, 5);
  assert.equal(readPuzzle({ item })?.endsAt, item.ends_at);
  assert.equal(readPuzzle({ item: null }), null);
  assert.throws(() => readPuzzle({}));
  for (const change of [{ answer_mask: 'SECRET' }, { claimed: 101 }, { claimed: -1 }, { ends_at: 'yesterday' }, { ends_at: item.starts_at }, { id: '../guess' }]) assert.throws(() => readPuzzle({ item: { ...item, ...change } }));
});
test('clue images reject executable and insecure URLs', () => {
  for (const url of ['javascript:alert(1)', 'http://example.test/clue.png', 'data:image/svg+xml,anything']) assert.throws(() => readPuzzle({ item: { ...item, image_id: 'image', images: { image: url } } }));
  assert.equal(readPuzzle({ item: { ...item, image_id: 'image', images: { image: 'https://example.test/clue.png' } } })?.image, 'https://example.test/clue.png');
});
test('a correct answer does not imply an issued ticket or prize', () => {
  assert.equal(readReward({ puzzle_id: id, state: 'pending', ticket_grant_id: null }, id).state, 'pending');
  assert.throws(() => readReward({ puzzle_id: id, state: 'granted', ticket_grant_id: null }, id));
  assert.throws(() => readReward({ puzzle_id: 'another-puzzle', state: 'granted', ticket_grant_id: 'ticket' }, id));
  assert.equal(readReward({ puzzle_id: id, state: 'granted', ticket_grant_id: 'ticket' }, id).state, 'granted');
  assert.equal(readRewards({ items: [] }, id), null);
});
