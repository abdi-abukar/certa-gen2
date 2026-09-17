import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canScrollInDirection } from '../apps/web/app/_components/dialog-scroll';

test('sheet scrolling permits reading content but blocks gestures escaping either edge', () => {
  assert.equal(canScrollInDirection(0, 900, 400, 20), true);
  assert.equal(canScrollInDirection(0, 900, 400, -20), false);
  assert.equal(canScrollInDirection(250, 900, 400, 20), true);
  assert.equal(canScrollInDirection(250, 900, 400, -20), true);
  assert.equal(canScrollInDirection(500, 900, 400, 20), false);
  assert.equal(canScrollInDirection(500, 900, 400, -20), true);
});

test('short content and Safari rubber-band offsets cannot unlock background scrolling', () => {
  for (const delta of [-20, 0, 20]) assert.equal(canScrollInDirection(0, 200, 400, delta), false);
  assert.equal(canScrollInDirection(-12, 900, 400, -20), false);
  assert.equal(canScrollInDirection(512, 900, 400, 20), false);
  assert.equal(canScrollInDirection(499.5, 900, 400, 20), false);
  assert.equal(canScrollInDirection(0.5, 900, 400, -20), false);
});
