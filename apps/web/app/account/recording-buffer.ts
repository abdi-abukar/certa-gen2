/** Encoded VP8 frames in decode order; every retained clip starts at a key frame. */
export type RecordingPacket = { data: Uint8Array; type: 'key' | 'delta'; timestamp: number; duration: number };
export const RECORDING_SECONDS = 600;
export const RECORDING_BYTES = 128 * 1024 * 1024;

export class RecordingBuffer {
  private packets: RecordingPacket[] = [];
  bytes = 0;
  memoryLimited = false;

  constructor(private seconds = RECORDING_SECONDS, private maxBytes = RECORDING_BYTES) {}

  add(packet: RecordingPacket) {
    if (!this.packets.length && packet.type !== 'key') return;
    this.packets.push(packet);
    this.bytes += packet.data.byteLength;
    const end = packet.timestamp + packet.duration;
    // Evict complete GOPs. Keeping delta frames after deleting their key frame
    // would make the download undecodable. Never keep an oversized lone GOP.
    while (this.packets.length && (end - this.packets[0].timestamp > this.seconds || this.bytes > this.maxBytes)) {
      if (this.bytes > this.maxBytes) this.memoryLimited = true;
      const next = this.packets.findIndex((value, index) => index > 0 && value.type === 'key');
      const removed = this.packets.splice(0, next < 0 ? this.packets.length : next);
      for (const value of removed) this.bytes -= value.data.byteLength;
    }
  }

  get duration() {
    const last = this.packets.at(-1);
    return last ? last.timestamp + last.duration - this.packets[0].timestamp : 0;
  }

  snapshot(seconds = RECORDING_SECONDS) {
    const last = this.packets.at(-1);
    if (!last) return [];
    const cutoff = last.timestamp + last.duration - Math.min(seconds, RECORDING_SECONDS);
    const start = this.packets.findIndex(packet => packet.type === 'key' && packet.timestamp >= cutoff);
    return start < 0 ? [] : this.packets.slice(start);
  }

  clear() { this.packets = []; this.bytes = 0; this.memoryLimited = false; }
}
