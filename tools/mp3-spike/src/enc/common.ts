// One adapter per candidate, all with this signature (issue #69, exact change 3).
// Mono, CBR, no resampling: 24 kHz in, 24 kHz out.
//
// `onChunk` is an addition to the contract signature (implementation decision):
// the Node harness uses it to sample memory during the encode. The Worker
// does not pass it.
export type Encode = (pcm: Int16Array, rate: number, kbps: number, onChunk?: () => void) => Promise<Uint8Array<ArrayBuffer>>;

// Samples per `encode` call. 1152 is the MPEG-1 frame size from the lamejs README.
export const CHUNK = 1152;

export function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function asBytes(a: Int8Array | Uint8Array): Uint8Array {
  return new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice();
}
