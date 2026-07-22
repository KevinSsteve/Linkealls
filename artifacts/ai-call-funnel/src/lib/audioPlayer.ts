const PLAYBACK_SAMPLE_RATE = 24000; // Gemini outputs 24 kHz PCM

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

export class AudioPlayer {
  private ctx: AudioContext;
  private nextPlayAt = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  isPlaying = false;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
  }

  /**
   * Call this immediately after construction, while still inside the user-gesture
   * call stack (button tap). Plays a silent buffer to fully unlock the AudioContext
   * on iOS Safari and resumes it on Android Chrome.
   */
  unlock(): void {
    try {
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch { /* ignore */ }

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  private _scheduleBuffer(base64: string): void {
    if (this.ctx.state === "closed") return;
    try {
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
    } catch { /* ignore if context became invalid */ }
  }

  enqueue(base64: string): void {
    if (this.ctx.state === "closed") return;

    if (this.ctx.state === "suspended") {
      // Resume first, then schedule — critical on mobile where context can be
      // suspended even after unlock() if the page lost focus briefly.
      this.ctx.resume()
        .then(() => this._scheduleBuffer(base64))
        .catch(() => {});
      return;
    }

    this._scheduleBuffer(base64);
  }

  interrupt(): void {
    for (const s of this.activeSources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.activeSources = [];
    this.nextPlayAt = 0;
    this.isPlaying = false;
  }

  destroy(): void {
    this.interrupt();
    try { void this.ctx.close(); } catch { /* ignore */ }
  }
}
