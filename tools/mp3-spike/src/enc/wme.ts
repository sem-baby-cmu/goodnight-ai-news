import { createEncoder } from "wasm-media-encoders";
import { CHUNK, concat, type Encode } from "./common";

// The caller gives the Wasm: a compiled `WebAssembly.Module` in the Worker
// (Workers take only pre-compiled modules), the file bytes in Node.
// `createMp3Encoder()` is not used: it compiles an inline base64 binary.
export function makeWme(wasm: () => WebAssembly.Module | Uint8Array): Encode {
  return async (pcm, rate, kbps, onChunk) => {
    const enc = await createEncoder("audio/mpeg", wasm());
    enc.configure({
      channels: 1,
      sampleRate: rate,
      bitrate: kbps as 32 | 48 | 64,
      outputSampleRate: rate as 24000,
    });
    const parts: Uint8Array[] = [];
    const buf = new Float32Array(CHUNK);
    for (let i = 0; i < pcm.length; i += CHUNK) {
      const n = Math.min(CHUNK, pcm.length - i);
      for (let k = 0; k < n; k++) buf[k] = pcm[i + k]! / 32768;
      // The returned array is owned by the encoder: copy it.
      const out = enc.encode([buf.subarray(0, n)]);
      if (out.length > 0) parts.push(out.slice());
      onChunk?.();
    }
    parts.push(enc.finalize().slice());
    return concat(parts);
  };
}
