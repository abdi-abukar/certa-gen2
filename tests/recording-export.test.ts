import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { RecordingBuffer } from '../apps/web/app/account/recording-buffer';
import { createRecordingFile } from '../apps/web/app/account/session-recording';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { Input, BufferSource, WEBM, EncodedPacketSink } = requireWeb('mediabunny');
// Real 32x32 green VP8 frames generated with FFmpeg, with no captured user data.
const key = Buffer.from('EAMAnQEqIAAgAABHCIWFiIWEiAICAnWqA/gD+gIIWQy9AP79bvP/4rWHWcX/it//02TxV4z/6YsA', 'base64');
const delta = Buffer.from('sQEABRCsABgAGFgv9AAIcAA=', 'base64');
const config = { codec: 'vp8', codedWidth: 32, codedHeight: 32 };

test('rolling export writes a standalone WebM with rebased timestamps and decoder metadata', async () => {
  const buffer = new RecordingBuffer(2);
  for (let index = 0; index < 6; index++) buffer.add({ data: index % 2 ? delta : key, type: index % 2 ? 'delta' : 'key', timestamp: index / 2, duration: .5 });
  assert.equal(buffer.snapshot()[0].timestamp, 1, 'old key-frame group was evicted');
  const file = await createRecordingFile(buffer.snapshot(1), config);
  assert.equal(file.type, 'video/webm');
  const input = new Input({ source: new BufferSource(await file.arrayBuffer()), formats: [WEBM] });
  try {
    assert.equal(await input.computeDuration(), 1);
    const track = await input.getPrimaryVideoTrack();
    const decoder = await track.getDecoderConfig();
    assert.equal(decoder.codec, 'vp8');
    assert.equal(decoder.codedWidth, 32);
    const packets = [];
    for await (const packet of new EncodedPacketSink(track).packets()) packets.push(packet);
    assert.equal(packets.length, 2);
    assert.equal(packets[0].timestamp, 0);
    assert.equal(packets[0].type, 'key');
    assert.equal(packets[1].timestamp, .5);
    assert.deepEqual(Buffer.from(packets[0].data), key);
    assert.deepEqual(Buffer.from(packets[1].data), delta);
    assert.equal(buffer.duration, 2, 'saving does not clear capture');
  } finally { input.dispose(); }
});

test('empty or non-decodable clips cannot be downloaded as a broken file', async () => {
  await assert.rejects(createRecordingFile([], config), /No clip is ready/);
  await assert.rejects(createRecordingFile([{ data: delta, type: 'delta', timestamp: 1, duration: .5 }], config), /No clip is ready/);
});
