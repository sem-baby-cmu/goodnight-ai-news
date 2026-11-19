import { UnsupportedAudioFormatError } from "./errors";

const noContext = { modelId: "", usage: null };

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = "";
  for (let i = start; i < start + length && i < bytes.length; i++) text += String.fromCharCode(bytes[i]!);
  return text;
}

// True when the bytes start with a RIFF header of type WAVE.
export function isWav(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE";
}

// Wraps 16-bit little-endian PCM in a 44-byte RIFF/WAVE header.
export function pcmToWav(pcm: Uint8Array, rate: number, channels: number): Uint8Array {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

// Reads the `fmt ` and `data` chunks of a WAV file. Only 16-bit PCM is accepted.
export function wavInfo(wav: Uint8Array): { rate: number; channels: number; dataBytes: number } {
  if (!isWav(wav)) throw new UnsupportedAudioFormatError("Audio is not a WAV file", noContext);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let fmt: { format: number; channels: number; rate: number; bits: number } | undefined;
  let dataBytes: number | undefined;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = ascii(wav, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= wav.length) {
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      // A streamed WAV may give a size larger than the file; count what is there.
      dataBytes = Math.min(size, wav.length - body);
      break;
    }
    offset = body + size + (size % 2); // chunks are padded to an even size
  }
  if (!fmt || dataBytes === undefined) {
    throw new UnsupportedAudioFormatError("WAV file has no fmt or data chunk", noContext);
  }
  if (fmt.format !== 1 || fmt.bits !== 16) {
    throw new UnsupportedAudioFormatError(
      `WAV format ${fmt.format} with ${fmt.bits} bits is not 16-bit PCM`,
      noContext,
    );
  }
  if (fmt.rate === 0 || fmt.channels === 0) {
    throw new UnsupportedAudioFormatError("WAV file has no sample rate or channels", noContext);
  }
  return { rate: fmt.rate, channels: fmt.channels, dataBytes };
}

export function wavDurationMs(info: { rate: number; channels: number; dataBytes: number }): number {
  return Math.round((info.dataBytes / (info.rate * info.channels * 2)) * 1000);
}
