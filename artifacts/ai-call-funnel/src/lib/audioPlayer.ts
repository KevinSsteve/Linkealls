const PLAYBACK_SAMPLE_RATE = 24000;

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function int16ToFloat32(data: Int16Array): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++)
    out[i] = data[i] / (data[i] < 0 ? 0x8000 : 0x7fff);
  return out;
}

function safeClose(ctx: AudioContext): void {
  // ctx.close() throws synchronously if already closed; always wrap.
  try {
    if (ctx.state !== "closed") ctx.close().catch(() => {});
  } catch {
    /* ignore */
  }
}

export class AudioPlayer {
  private ctx: AudioContext;
  private nextPlayAt = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private destroyed = false;
  isPlaying = false;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
  }

  enqueue(base64: string): void {
    if (this.destroyed || this.ctx.state === "closed") return;
    try {
      // Mobile browsers suspend AudioContext until user interaction; resume if needed.
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }

      const int16 = base64ToInt16(base64);
      if (int16.length === 0) return;

      const float32 = int16ToFloat32(int16);
      const buffer = this.ctx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
      buffer.getChannelData(0).set(float32);

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);

      const now = this.ctx.currentTime;
      const startAt = Math.max(now, this.nextPlayAt);
      source.start(startAt);
      this.nextPlayAt = startAt + buffer.duration;
      this.isPlaying = true;

      this.activeSources.push(source);
      source.onended = () => {
        this.activeSources = this.activeSources.filter((s) => s !== source);
        if (this.activeSources.length === 0) this.isPlaying = false;
      };
    } catch {
      /* ignore if context becomes invalid mid-playback */
    }
  }

  interrupt(): void {
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.activeSources = [];
    try {
      if (this.ctx.state !== "closed") this.nextPlayAt = this.ctx.currentTime;
    } catch { /* ignore */ }
    this.isPlaying = false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.interrupt();
    safeClose(this.ctx);
  }
}
