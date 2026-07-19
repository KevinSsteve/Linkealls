const TARGET_SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 30;

function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = buffer[idx] ?? 0;
    const b = buffer[idx + 1] ?? a;
    result[i] = a + frac * (b - a);
  }
  return result;
}

function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function int16ToBase64(data: Int16Array): string {
  const bytes = new Uint8Array(data.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface AudioCapture {
  getVolume: () => number;
  stop: () => void;
}

export async function startAudioCapture(onChunk: (base64: string) => void): Promise<AudioCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const audioContext = new AudioContext();
  // BASE_URL = "/ai-call-funnel/" (set by Vite from vite.config.ts `base`)
  // Must use base-relative path so the proxy routes correctly in Replit
  const processorUrl = import.meta.env.BASE_URL + "audio-processor.js";
  await audioContext.audioWorklet.addModule(processorUrl);
  const source = audioContext.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");

  let accumSamples: Float32Array[] = [];
  let accumLength = 0;
  let currentVolume = 0;
  const chunkSamples = Math.round((audioContext.sampleRate * CHUNK_DURATION_MS) / 1000);

  workletNode.port.onmessage = (e: MessageEvent<{ samples: Float32Array }>) => {
    const { samples } = e.data;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    currentVolume = Math.sqrt(sum / samples.length);

    accumSamples.push(samples);
    accumLength += samples.length;

    if (accumLength >= chunkSamples) {
      const merged = new Float32Array(accumLength);
      let offset = 0;
      for (const chunk of accumSamples) { merged.set(chunk, offset); offset += chunk.length; }
      accumSamples = [];
      accumLength = 0;
      const downsampled = downsample(merged, audioContext.sampleRate, TARGET_SAMPLE_RATE);
      onChunk(int16ToBase64(float32ToInt16(downsampled)));
    }
  };

  source.connect(workletNode);

  return {
    getVolume: () => currentVolume,
    stop: () => {
      try { workletNode.disconnect(); } catch { /* already disconnected */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
      stream.getTracks().forEach((t) => t.stop());
      if (audioContext.state !== "closed") void audioContext.close();
    },
  };
}
