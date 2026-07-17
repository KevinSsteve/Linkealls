const TARGET_SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 80; // Send 80ms chunks for low latency

/** Linear-interpolation downsample from source rate to 16 kHz. */
function downsample(
  buffer: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
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

/** Convert Float32 samples (−1…1) to signed 16-bit PCM. */
function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Encode Int16 PCM bytes as base64 string. */
function int16ToBase64(data: Int16Array): string {
  const bytes = new Uint8Array(data.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export interface AudioCapture {
  /** Current RMS volume (0–1), updated every worklet callback (~128 samples). */
  getVolume: () => number;
  stop: () => void;
}

/**
 * Starts capturing microphone audio, downsamples to 16 kHz, and delivers
 * base64-encoded Int16 PCM chunks to `onChunk` every ~80 ms.
 */
export async function startAudioCapture(
  onChunk: (base64: string) => void,
): Promise<AudioCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);

  // Load worklet processor from public directory
  const processorUrl = new URL("/audio-processor.js", window.location.origin)
    .href;
  await audioContext.audioWorklet.addModule(processorUrl);
  const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");

  let accumSamples: Float32Array[] = [];
  let accumLength = 0;
  let currentVolume = 0;
  const chunkSamples = Math.round(
    (audioContext.sampleRate * CHUNK_DURATION_MS) / 1000,
  );

  workletNode.port.onmessage = (e: MessageEvent<{ samples: Float32Array }>) => {
    const { samples } = e.data;

    // Update volume (RMS)
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    currentVolume = Math.sqrt(sum / samples.length);

    accumSamples.push(samples);
    accumLength += samples.length;

    if (accumLength >= chunkSamples) {
      // Merge accumulated buffers
      const merged = new Float32Array(accumLength);
      let offset = 0;
      for (const chunk of accumSamples) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      accumSamples = [];
      accumLength = 0;

      const downsampled = downsample(
        merged,
        audioContext.sampleRate,
        TARGET_SAMPLE_RATE,
      );
      const int16 = float32ToInt16(downsampled);
      onChunk(int16ToBase64(int16));
    }
  };

  // Connect source → worklet (don't connect worklet to destination to avoid feedback)
  source.connect(workletNode);

  return {
    getVolume: () => currentVolume,
    stop: () => {
      workletNode.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void audioContext.close();
    },
  };
}
