const PLAYBACK_SAMPLE_RATE = 24000; // Gemini outputs 24 kHz PCM

/** Decode base64 string to Int16 PCM samples. */
function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

/** Convert signed 16-bit PCM to Float32 (−1…1). */
function int16ToFloat32(data: Int16Array): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] / (data[i] < 0 ? 0x8000 : 0x7fff);
  }
  return out;
}

/**
 * Queues and plays base64-encoded PCM audio chunks from Gemini.
 * Chunks are scheduled back-to-back for gapless playback.
 */
export class AudioPlayer {
  private ctx: AudioContext;
  private nextPlayAt = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  isPlaying = false;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
  }

  /** Enqueue a base64 PCM chunk for immediate (gapless) playback. */
  enqueue(base64: string): void {
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
      if (this.activeSources.length === 0) {
        this.isPlaying = false;
      }
    };
  }

  /** Stop all pending/playing audio (e.g. on barge-in). */
  interrupt(): void {
    for (const s of this.activeSources) {
      try {
        s.stop();
      } catch {
        // Already stopped
      }
    }
    this.activeSources = [];
    this.nextPlayAt = 0;
    this.isPlaying = false;
  }

  /** Fully tear down the player. */
  destroy(): void {
    this.interrupt();
    void this.ctx.close();
  }
}
