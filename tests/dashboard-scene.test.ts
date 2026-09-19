import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createDashboardMotion, readDashboardState } from '../packages/game/src/dashboard-motion.js';

const input = (extra = {}) => ({ type: 'certa:dashboard-state', accountId: 'evaluation-a',
  phase: 'evaluation', progress: .4, reducedMotion: false, ...extra });

test('dashboard scene accepts finite presentation progress and supported phases only', () => {
  assert.ok(readDashboardState(input()));
  for (const extra of [{ progress: NaN }, { progress: 1.01 }, { progress: -1 }, { progress: '.4' },
    { previousProgress: Infinity }, { accountId: '' }, { phase: 'approved' }, { reducedMotion: undefined }]) {
    assert.equal(readDashboardState(input(extra)), null);
  }
});

test('first visit starts at the actual balance; a saved observation animates only this first selection', () => {
  const fresh = createDashboardMotion();
  fresh.receive(input());
  assert.equal(fresh.state.progress, .4);
  assert.deepEqual(fresh.takeSettlement(), { accountId: 'evaluation-a', progress: .4 });
  assert.equal(fresh.takeSettlement(), null);
  const returning = createDashboardMotion();
  returning.receive(input({ previousProgress: .1 }));
  assert.equal(returning.state.progress, .1);
  assert.equal(returning.takeSettlement(), null);
  returning.step(.3);
  assert.ok(returning.state.progress > .1 && returning.state.progress < .4);
  returning.receive(input({ accountId: 'evaluation-b', previousProgress: .1, progress: .7 }));
  assert.equal(returning.state.progress, .7);
  assert.deepEqual(returning.takeSettlement(), { accountId: 'evaluation-b', progress: .7 });
});

test('updates coalesce from the visible position, move backward, and never infer a pass', () => {
  const motion = createDashboardMotion();
  motion.receive(input({ previousProgress: .1 }));
  motion.step(.2);
  const shown = motion.state.progress;
  motion.receive(input({ progress: .9, previousProgress: 0 }));
  assert.equal(motion.state.progress, shown);
  motion.step(.2);
  assert.ok(motion.state.progress > shown && motion.state.progress < .9);
  const forward = motion.state.progress;
  motion.receive(input({ progress: .01 }));
  assert.equal(motion.state.direction, -1);
  motion.step(.2);
  assert.ok(motion.state.progress < forward);
  motion.receive(input({ progress: 1 }));
  motion.step(10);
  assert.equal(motion.state.phase, 'evaluation');
  assert.equal(motion.state.progress, 1);
  assert.deepEqual(motion.takeSettlement(), { accountId: 'evaluation-a', progress: 1 });
  motion.receive(input({ progress: 1 }));
  assert.equal(motion.takeSettlement(), null);
});

test('reduced motion and waiting states immediately settle without an invented traversal', () => {
  for (const extra of [{ reducedMotion: true }, { phase: 'pending' }, { phase: 'empty' }, { phase: 'locked' }]) {
    const motion = createDashboardMotion();
    motion.receive(input({ previousProgress: 0, ...extra }));
    assert.equal(motion.state.progress, .4);
    assert.equal(motion.state.moving, false);
  }
  const system = createDashboardMotion();
  system.receive(input({ previousProgress: .1 }));
  system.receive(input(), true);
  assert.equal(system.state.progress, .4);
  assert.equal(system.state.reducedMotion, true);
});

test('the first known account snapshot after loading never invents a traversal from zero', () => {
  for (const phase of ['evaluation', 'practice', 'funded']) {
    const motion = createDashboardMotion();
    motion.receive(input({ phase: 'pending', progress: 0 }));
    motion.takeSettlement();
    motion.receive(input({ phase, progress: .65 }));
    assert.equal(motion.state.progress, .65);
    assert.equal(motion.state.moving, false);
    assert.deepEqual(motion.takeSettlement(), { accountId: 'evaluation-a', progress: .65 });
    // Later actual observations continue to move from the previous observation.
    motion.receive(input({ phase, progress: .8 }));
    assert.equal(motion.state.progress, .65);
    assert.equal(motion.state.moving, true);
  }
});

test('scene checks parent and origin, freezes while hidden, and removes listeners on disposal', () => {
  const handlers = new Map<string, (event: any) => void>();
  const messages: any[] = [];
  let update = () => {};
  let load = () => {};
  let draw = () => {};
  let quit = false;
  const noop = () => {};
  const parent = { postMessage: (data: unknown, target: string) => messages.push({ data, target }) };
  const canvas = { style: {}, addEventListener: noop, removeEventListener: noop };
  const document = { hidden: false, getElementById: () => canvas,
    addEventListener: (key: string, fn: any) => handlers.set(key, fn),
    removeEventListener: (key: string) => handlers.delete(key) };
  const window = { parent, location: { origin: 'https://certa.test', search: '' }, innerWidth: 640, innerHeight: 280,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    addEventListener: (key: string, fn: any) => handlers.set(key, fn),
    removeEventListener: (key: string) => handlers.delete(key) };
  const k = { debug: { paused: false }, dt: () => .05,
    vec2: (x: number, y: number) => ({ x, y }), rgb: (value: string) => value,
    loadSprite: noop, onResize: noop, onError: noop, quit: () => { quit = true; },
    drawSprite: noop, drawRect: noop, drawPolygon: noop, drawEllipse: noop, drawLine: noop,
    onLoad: (fn: () => void) => { load = fn; }, onUpdate: (fn: () => void) => { update = fn; },
    onDraw: (fn: () => void) => { draw = fn; } };
  const source = readFileSync(new URL('../packages/game/src/initDashboard.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace('export default function', 'function');
  runInNewContext(source + '\ninitDashboard();', { window, document, kaplay: () => k,
    createDashboardMotion, readDashboardState, URLSearchParams });
  load();
  assert.equal(messages[0].data.type, 'certa:dashboard-ready');
  const send = (data: any, origin = window.location.origin, source = parent) => handlers.get('message')!({ origin, source, data });
  send(input(), 'https://elsewhere.test');
  send(input(), window.location.origin, {} as any);
  assert.equal(messages.length, 1);
  send(input({ previousProgress: 0 }));
  send({ type: 'certa:pause' });
  assert.equal(k.debug.paused, true);
  for (let i = 0; i < 50; i++) update();
  assert.equal(messages.length, 1);
  send({ type: 'certa:resume' });
  document.hidden = true;
  handlers.get('visibilitychange')!({});
  for (let i = 0; i < 50; i++) update();
  assert.equal(messages.length, 1);
  document.hidden = false;
  handlers.get('visibilitychange')!({});
  for (let i = 0; i < 50; i++) update();
  draw();
  assert.equal(messages.length, 2);
  assert.equal(messages[1].data.accountId, 'evaluation-a');
  assert.equal(messages[1].data.progress, .4);
  assert.ok(messages.every(message => message.target === window.location.origin));
  handlers.get('pagehide')!({ persisted: true });
  assert.equal(k.debug.paused, true);
  handlers.get('pageshow')!({ persisted: true });
  assert.equal(k.debug.paused, false);
  handlers.get('pagehide')!({ persisted: false });
  assert.equal(quit, true);
  assert.equal(handlers.size, 0);
});
