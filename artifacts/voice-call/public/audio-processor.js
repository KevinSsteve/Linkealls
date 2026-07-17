/**
 * AudioWorklet processor – runs in a dedicated audio thread.
 * Collects microphone samples and forwards them to the main thread.
 */
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      // Copy to avoid transferring the original array
      this.port.postMessage({ samples: new Float32Array(channel) });
    }
    return true; // Keep processor alive
  }
}

registerProcessor("pcm-processor", PCMProcessor);
