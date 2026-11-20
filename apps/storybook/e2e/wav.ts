import { pcmToWav } from "@storybook/models";

// A silent WAV file: 8000 Hz, 1 channel, 16-bit PCM, `ms` long. The browser
// tests answer every `.wav` path with it, and src/player/audio.ts holds the
// base64 of makeSilentWav(50).
export function makeSilentWav(ms: number): Uint8Array {
  return pcmToWav(new Uint8Array(Math.round((8000 * ms) / 1000) * 2), 8000, 1);
}
