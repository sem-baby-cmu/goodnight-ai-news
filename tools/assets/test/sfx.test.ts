import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AssetBuildSchema } from "../src/build";
import { main } from "../src/cli";
import { SFX } from "../src/sfx/recipes";
import { encodeWav, mulberry32, renderSfx } from "../src/sfx/synth";

// Expected values from the #21 refinement ("Exact changes" 1), not from the code.
const LENGTHS_MS: Record<string, number> = {
  "sfx-pop": 120,
  "sfx-boing": 450,
  "sfx-chime": 900,
  "sfx-whoosh": 600,
  "sfx-tick": 60,
  "sfx-bell": 1200,
  "sfx-splash": 500,
  "sfx-tada": 600,
};
const SAMPLE_RATE = 24_000;
const PEAK = Math.round(0.5012 * 32767);

describe("sfx", () => {
  it("SFX is the closed list of 8 keys", () => {
    expect(SFX.map((r) => r.key)).toEqual(Object.keys(LENGTHS_MS));
  });

  it("mulberry32 is deterministic and in [0, 1)", () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(2)()).not.toBe(mulberry32(1)());
  });

  it("renderSfx is byte-identical across two runs for every SFX key", () => {
    for (const recipe of SFX) {
      const first = Buffer.from(encodeWav(renderSfx(recipe), SAMPLE_RATE));
      const second = Buffer.from(encodeWav(renderSfx(recipe), SAMPLE_RATE));
      expect(first.equals(second), recipe.key).toBe(true);
    }
  });

  it("encodeWav writes RIFF/WAVE, PCM 1, 1 channel, 24000 Hz, 16 bit", () => {
    const samples = Int16Array.from([0, 1000, -1000, 32767, -32768, 0]);
    const wav = Buffer.from(encodeWav(samples, SAMPLE_RATE));
    expect(wav.length).toBe(44 + samples.length * 2);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(36 + samples.length * 2);
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.toString("ascii", 12, 16)).toBe("fmt ");
    expect(wav.readUInt32LE(16)).toBe(16);
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(28)).toBe(48_000);
    expect(wav.readUInt16LE(32)).toBe(2);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString("ascii", 36, 40)).toBe("data");
    expect(wav.readUInt32LE(40)).toBe(samples.length * 2);
    for (let i = 0; i < samples.length; i++) expect(wav.readInt16LE(44 + i * 2)).toBe(samples[i]);
  });

  it("REG-02.S5 every SFX sound has durationMs equal to its recipe length, peak within 0.1 dB of -6 dBFS, first and last sample 0", async () => {
    const out = mkdtempSync(join(tmpdir(), "assets-sfx-"));
    expect(await main(["sfx", "--out", out], { log: () => {} })).toBe(0);
    expect(readdirSync(out).sort()).toEqual(Object.keys(LENGTHS_MS).sort());
    for (const [key, ms] of Object.entries(LENGTHS_MS)) {
      const dir = join(out, key, "v1");
      const build = AssetBuildSchema.parse(JSON.parse(readFileSync(join(dir, "asset.json"), "utf8")));
      expect(build).toMatchObject({ key, kind: "sfx", version: 1, renderer: "audio", manifest: { kind: "sfx", file: `${key}.wav`, durationMs: ms } });
      expect(build.name.length, key).toBeGreaterThan(0);
      const wav = readFileSync(join(dir, `${key}.wav`));
      expect(statSync(join(dir, `${key}.wav`)).size, key).toBeLessThanOrEqual(58 * 1024);
      expect(wav.readUInt32LE(24)).toBe(SAMPLE_RATE);
      const n = wav.readUInt32LE(40) / 2;
      expect(n, key).toBe((ms * SAMPLE_RATE) / 1000);
      let peak = 0;
      for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(wav.readInt16LE(44 + i * 2)));
      expect(peak, key).toBe(PEAK);
      expect(Math.abs(20 * Math.log10(peak / 32767) - -6), key).toBeLessThanOrEqual(0.1);
      expect(wav.readInt16LE(44), key).toBe(0);
      expect(wav.readInt16LE(44 + (n - 1) * 2), key).toBe(0);
    }
  });
});
