import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, Output, WebMOutputFormat } from 'mediabunny';
import { RecordingBuffer, type RecordingPacket } from './recording-buffer';

// Chromium exposes the processor on Window. Browsers with only a worker-based
// processor are explicitly unsupported here instead of falling back to rAF,
// which stops capturing when the trader switches to another tab.
type ProcessorConstructor = new (options: { track: MediaStreamTrack; maxBufferSize: number }) => { readable: ReadableStream<VideoFrame> };
type CaptureWindow = Window & typeof globalThis & { MediaStreamTrackProcessor?: ProcessorConstructor };

export async function createRecordingFile(packets: RecordingPacket[], config: VideoDecoderConfig) {
  if (!packets.length || packets[0].type !== 'key') throw new Error('No clip is ready yet. Record for a few seconds and try again.');
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const source = new EncodedVideoPacketSource('vp8');
  // WebM needs a default frame duration so readers can determine the end of
  // the final frame, which has no following timestamp to infer it from.
  output.addVideoTrack(source, { frameRate: 1 / (packets.at(-1)!.duration || 1 / 15) });
  try {
    await output.start();
    const first = packets[0].timestamp;
    for (let index = 0; index < packets.length; index++) {
      const packet = packets[index];
      const duration = packets[index + 1] ? packets[index + 1].timestamp - packet.timestamp : packet.duration;
      await source.add(new EncodedPacket(packet.data, packet.type, packet.timestamp - first, duration), index === 0 ? { decoderConfig: config } : undefined);
    }
    source.close();
    await output.finalize();
    return new Blob([target.buffer!], { type: 'video/webm' });
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
}

export class SessionRecording {
  readonly buffer = new RecordingBuffer();
  private encoder: VideoEncoder | null = null;
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private config: VideoDecoderConfig | null = null;
  private stopping: Promise<void> | null = null;
  private stopped = false;
  private disposed = false;
  private exporting = false;
  private firstTimestamp: number | null = null;
  private keyTimestamp = -Infinity;
  private track: MediaStreamTrack;
  private lastFrameAt = 0;
  readonly startedAt = Date.now();

  constructor(private stream: MediaStream, private onEnded: (failed: boolean) => void) {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('Choose a tab, window, or screen to record.');
    this.track = track;
  }

  get paused() { return this.track.muted || this.lastFrameAt > 0 && Date.now() - this.lastFrameAt > 10_000; }
  private ended = () => { void this.stop().then(() => { if (!this.disposed) this.onEnded(false); }); };

  async start() {
    const Processor = (window as CaptureWindow).MediaStreamTrackProcessor;
    if (!Processor) throw new Error('Recording needs desktop Chrome or Edge.');
    const settings = this.track.getSettings();
    const width = settings.width || 1920;
    const height = settings.height || 1080;
    const scale = Math.min(1, 1920 / width, 1080 / height);
    const config: VideoEncoderConfig = { codec: 'vp8', width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2), bitrate: 1_200_000, framerate: 15, latencyMode: 'realtime' };
    const support = await VideoEncoder.isConfigSupported(config);
    if (this.disposed || this.track.readyState === 'ended') throw new Error('Screen sharing ended before recording started.');
    if (!support.supported) throw new Error('This browser cannot encode clips. Try desktop Chrome or Edge.');
    this.config = { codec: 'vp8', codedWidth: config.width, codedHeight: config.height };
    this.encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        if (this.disposed) return;
        if (metadata?.decoderConfig) this.config = metadata.decoderConfig;
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        this.buffer.add({ data, type: chunk.type, timestamp: chunk.timestamp / 1e6, duration: (chunk.duration ?? 1e6 / 15) / 1e6 });
      },
      error: () => this.fail(),
    });
    this.encoder.configure(config);
    this.reader = new Processor({ track: this.track, maxBufferSize: 2 }).readable.getReader();
    this.track.addEventListener('ended', this.ended);
    void this.readFrames();
  }

  private fail() { if (!this.stopped) void this.stop().then(() => { if (!this.disposed) this.onEnded(true); }); }

  private async readFrames() {
    try {
      while (!this.stopped) {
        const { value: frame, done } = await this.reader!.read();
        if (done) { if (!this.stopped) this.ended(); break; }
        try {
          if (this.stopped || this.encoder!.encodeQueueSize > 2) continue;
          this.firstTimestamp ??= frame.timestamp;
          const timestamp = frame.timestamp - this.firstTimestamp;
          const keyFrame = timestamp - this.keyTimestamp >= 2_000_000;
          const normalized = new VideoFrame(frame, { timestamp });
          try { this.encoder!.encode(normalized, { keyFrame }); }
          finally { normalized.close(); }
          if (keyFrame) this.keyTimestamp = timestamp;
          this.lastFrameAt = Date.now();
        } finally { frame.close(); }
      }
    } catch { this.fail(); }
  }

  stop() {
    if (this.stopping) return this.stopping;
    this.stopped = true;
    this.track.removeEventListener('ended', this.ended);
    this.stream.getTracks().forEach(track => track.stop());
    this.stopping = (async () => {
      await this.reader?.cancel().catch(() => {});
      if (this.encoder?.state === 'configured') await this.encoder.flush().catch(() => {});
      if (this.encoder && this.encoder.state !== 'closed') this.encoder.close();
    })();
    return this.stopping;
  }

  async save(seconds: number) {
    if (this.exporting) throw new Error('A clip is already being prepared.');
    if (!this.config) throw new Error('No clip is ready yet.');
    this.exporting = true;
    // Copy only references, not video bytes; capture continues during muxing.
    const packets = this.buffer.snapshot(seconds);
    try { return await createRecordingFile(packets, this.config); }
    finally { this.exporting = false; }
  }

  dispose() { this.disposed = true; void this.stop(); this.buffer.clear(); }
}
