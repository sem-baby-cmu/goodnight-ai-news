import { expect, it } from "vitest";
import { pcmToWav, wavInfo } from "./wav";
import { ascii } from "./test-helpers";

it("pcmToWav and wavInfo round trip", () => {
  const pcm = new Uint8Array(400).map((_, i) => i % 256);
  const wav = pcmToWav(pcm, 16000, 2);
  expect(wav.length).toBe(444);
  expect(ascii(wav, 0, 4)).toBe("RIFF");
  expect(ascii(wav, 8, 4)).toBe("WAVE");
  expect(wavInfo(wav)).toEqual({ rate: 16000, channels: 2, dataBytes: 400 });
  expect(wav.subarray(44)).toEqual(pcm);
});
