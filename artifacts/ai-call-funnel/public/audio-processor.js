/**
 * AudioWorklet processor — forwards Float32 mic samples to the main thread.
 * Registered as "pcm-processor".
 */
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      // Transfer ownership for zero-copy
      const samples = input[0].slice();
      this.port.postMessage({ samples }, [samples.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
