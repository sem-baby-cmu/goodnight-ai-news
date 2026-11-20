import { Mp3Encoder } from "@breezystack/lamejs";
import { asBytes, CHUNK, concat, type Encode } from "./common";

export const encodeBreezy: Encode = async (pcm, rate, kbps, onChunk) => {
  const enc = new Mp3Encoder(1, rate, kbps);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += CHUNK) {
    const out = enc.encodeBuffer(pcm.subarray(i, i + CHUNK));
    if (out.length > 0) parts.push(asBytes(out));
    onChunk?.();
  }
  parts.push(asBytes(enc.flush()));
  return concat(parts);
};
