import { expect, it } from "vitest";
import { makeSilentWav } from "../../e2e/wav";
import { PlayerAudio, SILENT_WAV } from "./audio";

it("SILENT_WAV is the base64 of makeSilentWav(50)", () => {
  const bytes = makeSilentWav(50);
  expect(SILENT_WAV).toBe("data:audio/wav;base64," + btoa(String.fromCharCode(...bytes)));

  const decoded = Uint8Array.from(atob(SILENT_WAV.slice("data:audio/wav;base64,".length)), (c) => c.charCodeAt(0));
  const view = new DataView(decoded.buffer);
  const format = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const rate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  const dataSize = view.getUint32(40, true);
  const samples = dataSize / (channels * (bits / 8));
  expect(format).toBe(1);
  expect(channels).toBe(1);
  expect(samples).toBeGreaterThanOrEqual(1);
  expect(decoded.slice(44).every((b) => b === 0)).toBe(true);
  expect(samples / rate).toBeLessThanOrEqual(0.1);
});

it("start plays the narration, then the silent clip on the sound-effect element", () => {
  const log: string[] = [];
  // Every play() rejects: PlayerAudio catches it (no unhandled rejection).
  const element = (name: string) => {
    const el = {
      src: "",
      play: () => {
        log.push(`${name} play ${el.src}`);
        return Promise.reject(new Error("blocked"));
      },
      pause: () => {
        log.push(`${name} pause`);
      },
    };
    return el as unknown as HTMLAudioElement;
  };
  const audio = new PlayerAudio(element("narration"), element("sfx"));

  audio.start("/n1.wav");
  audio.playNarration("/n2.wav");
  audio.playSfx("/ding.wav");
  audio.stopNarration();
  audio.stopAll();

  expect(log).toEqual([
    "narration play /n1.wav",
    `sfx play ${SILENT_WAV}`,
    "narration play /n2.wav",
    "sfx play /ding.wav",
    "narration pause",
    "narration pause",
    "sfx pause",
  ]);
});
