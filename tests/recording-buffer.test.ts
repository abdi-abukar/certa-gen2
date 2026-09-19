import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RecordingBuffer, type RecordingPacket } from '../apps/web/app/account/recording-buffer';

function packet(timestamp: number, type: 'key' | 'delta' = 'delta', size = 10): RecordingPacket {
  return { timestamp, type, data: new Uint8Array(size), duration: 1 };
}

test('a recording longer than ten minutes keeps a decodable, bounded trailing window', () => {
  const buffer = new RecordingBuffer();
  for (let second = 0; second < 1800; second++) buffer.add(packet(second, second % 2 === 0 ? 'key' : 'delta'));
  const clip = buffer.snapshot();
  assert.equal(clip[0].type, 'key');
  assert.equal(clip[0].timestamp, 1200);
  assert.equal(clip.at(-1)?.timestamp, 1799);
  assert.equal(buffer.duration, 600);
  assert.equal(buffer.bytes, 6000);
});

test('short clips start at a key frame and contain only available footage', () => {
  const buffer = new RecordingBuffer();
  buffer.add(packet(0));
  assert.deepEqual(buffer.snapshot(), []);
  for (let second = 1; second <= 101; second++) buffer.add(packet(second, second % 2 === 1 ? 'key' : 'delta'));
  const minute = buffer.snapshot(60);
  assert.equal(minute[0].timestamp, 43);
  assert.equal(minute[0].type, 'key');
  assert.ok(minute.at(-1)!.timestamp + 1 - minute[0].timestamp <= 60);
  assert.equal(buffer.snapshot(600)[0].timestamp, 1);
});

test('memory pressure evicts entire GOPs, including an oversized single GOP', () => {
  const buffer = new RecordingBuffer(600, 35);
  buffer.add(packet(0, 'key')); buffer.add(packet(1)); buffer.add(packet(2, 'key')); buffer.add(packet(3));
  assert.equal(buffer.bytes, 20);
  assert.equal(buffer.snapshot()[0].timestamp, 2);
  assert.equal(buffer.memoryLimited, true);
  buffer.add(packet(4, 'delta', 100));
  assert.equal(buffer.bytes, 0);
  buffer.add(packet(5));
  assert.equal(buffer.bytes, 0);
  buffer.add(packet(6, 'key'));
  assert.equal(buffer.snapshot()[0].timestamp, 6);
});

test('export snapshots survive eviction without mutating the live capture buffer', () => {
  const buffer = new RecordingBuffer(3);
  buffer.add(packet(0, 'key')); buffer.add(packet(1));
  const clip = buffer.snapshot();
  buffer.add(packet(2, 'key')); buffer.add(packet(3));
  assert.equal(clip[0].timestamp, 0);
  assert.equal(buffer.snapshot()[0].timestamp, 2);
  buffer.clear();
  assert.equal(buffer.bytes, 0);
  assert.equal(buffer.duration, 0);
  assert.deepEqual(buffer.snapshot(), []);
  assert.equal(clip.length, 2);
});

test('large capture timestamp gaps never retain a clip longer than ten minutes', () => {
  const buffer = new RecordingBuffer();
  buffer.add(packet(0, 'key'));
  buffer.add(packet(900, 'key'));
  assert.equal(buffer.duration, 1);
  assert.equal(buffer.snapshot()[0].timestamp, 900);
});
