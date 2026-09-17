import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { chooseFirmJump, FIRM_JUMPS, sampleFirmJump } from '../packages/game/src/firm-jumps.js';

test('all five randomized jumps are reachable and never immediately repeat', () => {
  assert.equal(FIRM_JUMPS.length, 5);
  for (const previous of [null, ...FIRM_JUMPS]) {
    const choices = FIRM_JUMPS.filter(jump => jump !== previous);
    choices.forEach((expected, index) => {
      assert.equal(chooseFirmJump(previous, () => (index + .5) / choices.length), expected);
    });
  }
});

test('every variation has one upright arc and returns exactly to the path', () => {
  for (const jump of FIRM_JUMPS) {
    assert.equal(sampleFirmJump(jump, null), 0);
    assert.equal(sampleFirmJump(jump, 0), 0);
    assert.equal(sampleFirmJump(jump, jump.duration), 0);
    assert.equal(sampleFirmJump(jump, jump.duration + 1), 0);
    assert.equal(sampleFirmJump(jump, jump.duration / 2), jump.height);
    let previous = 0;
    for (let frame = 1; frame <= 100; frame++) {
      const height = sampleFirmJump(jump, jump.duration * frame / 100);
      assert.ok(Number.isFinite(height) && height >= 0 && height <= jump.height);
      assert.ok(frame <= 50 ? height >= previous : height <= previous);
      previous = height;
    }
  }
});

test('paused character taps leave the world and stop timer frozen; hard pauses block taps', () => {
  const listeners: Record<string, (event: any) => void> = {};
  const objects: any[] = [];
  let load = () => {};
  let update = () => {};
  const noop = () => {};
  const k = {
    debug: { paused: false }, dt: () => .05,
    vec2: (x: number, y: number) => ({ x, y }),
    sprite: noop, pos: noop, scale: noop, z: noop, anchor: noop,
    add: () => { const object = { pos: {}, scale: {}, play: noop }; objects.push(object); return object; },
    loadSprite: noop, quit: noop, onError: noop, onResize: noop,
    onLoad: (callback: () => void) => { load = callback; },
    onUpdate: (callback: () => void) => { update = callback; },
  };
  const parent = { postMessage: noop };
  const document = { hidden: false, addEventListener: noop, removeEventListener: noop,
    getElementById: () => ({ style: {}, addEventListener: noop, removeEventListener: noop }) };
  const window = {
    parent, location: { origin: 'https://certa.test' }, innerWidth: 1200, innerHeight: 800,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    addEventListener: (type: string, callback: (event: any) => void) => { listeners[type] = callback; },
    removeEventListener: noop,
  };
  // Run the real scene against a minimal engine/DOM, without creating WebGL.
  const source = readFileSync(new URL('../packages/game/src/initFirm.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace('export default function', 'function');
  runInNewContext(source + '\ninitFirm();', {
    kaplay: () => k, chooseFirmJump, sampleFirmJump, window, document,
    location: { search: '' }, URLSearchParams,
  });
  load();
  const send = (type: string, extra = {}) => listeners.message({
    origin: window.location.origin, source: parent, data: { type, ...extra },
  });
  const tick = (count: number) => { for (let i = 0; i < count; i++) if (!k.debug.paused) update(); };
  send('certa:firm-focus', { index: 0 });
  const player = objects.at(-1);
  const grounded = player.pos.y;
  const world = JSON.stringify(objects.slice(0, -1).map(object => object.pos));
  send('certa:pause', { allowJump: true });
  assert.equal(k.debug.paused, true);
  send('certa:firm-jump');
  tick(1);
  assert.ok(player.pos.y < grounded);
  tick(30);
  assert.equal(player.pos.y, grounded);
  assert.equal(k.debug.paused, true);
  assert.equal(JSON.stringify(objects.slice(0, -1).map(object => object.pos)), world);
  send('certa:resume');
  tick(110); // 5.5 seconds: the six-second landmark timer did not run during the jump.
  assert.equal(JSON.stringify(objects.slice(0, -1).map(object => object.pos)), world);
  send('certa:pause');
  send('certa:firm-jump');
  tick(5);
  assert.equal(player.pos.y, grounded);
  assert.equal(k.debug.paused, true);
  send('certa:pause', { allowJump: true });
  document.hidden = true;
  send('certa:firm-jump');
  assert.equal(k.debug.paused, true);
  document.hidden = false;
  send('certa:firm-motion', { reduced: true });
  send('certa:firm-jump');
  assert.equal(k.debug.paused, true);
});
