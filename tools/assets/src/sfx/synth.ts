// Deterministic synthesis of the SFX recipes: mono, 24,000 Hz, 16-bit PCM,
// linear 5 ms fades, peak at -6 dBFS (#21, "Exact changes" 1).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AssetBuild, AssetBuildSchema } from "../build";
import { SFX, type SfxRecipe } from "./recipes";

export const SFX_SAMPLE_RATE = 24_000;
const FADE_SAMPLES = Math.round(0.005 * SFX_SAMPLE_RATE);
export const SFX_PEAK = Math.round(0.5012 * 32767);

// mulberry32: a small seeded generator with values in [0, 1).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderSfx(recipe: SfxRecipe): Int16Array {
  const index = SFX.indexOf(recipe);
  if (index < 0) throw new Error(`${recipe.key} is not in SFX`);
  const n = Math.round((recipe.ms * SFX_SAMPLE_RATE) / 1000);
  const raw = recipe.render(n, SFX_SAMPLE_RATE, mulberry32(index + 1));
  if (raw.length !== n) throw new Error(`${recipe.key}: ${raw.length} samples, expected ${n}`);
  for (let i = 0; i < FADE_SAMPLES; i++) {
    raw[i]! *= i / FADE_SAMPLES;
    raw[n - 1 - i]! *= i / FADE_SAMPLES;
  }
  let peak = 0;
  for (const x of raw) peak = Math.max(peak, Math.abs(x));
  if (!(peak > 0) || !Number.isFinite(peak)) throw new Error(`${recipe.key}: peak ${peak}`);
  const gain = SFX_PEAK / peak;
  return Int16Array.from(raw, (x) => Math.round(x * gain));
}

// 44-byte RIFF header (PCM format 1, 1 channel, 16 bits), then little-endian samples.
export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const bytes = samples.length * 2;
  const out = new Uint8Array(44 + bytes);
  const view = new DataView(out.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, bytes, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, s, true));
  return out;
}

// Writes <outDir>/<key>/v1/<key>.wav and asset.json for every recipe.
export function writeSfxBuilds(outDir: string): AssetBuild[] {
  return SFX.map((recipe) => {
    const build = AssetBuildSchema.parse({
      key: recipe.key,
      kind: "sfx",
      name: recipe.name,
      version: 1,
      renderer: "audio",
      manifest: { kind: "sfx", file: `${recipe.key}.wav`, durationMs: recipe.ms },
    });
    const dir = join(outDir, recipe.key, "v1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${recipe.key}.wav`), encodeWav(renderSfx(recipe), SFX_SAMPLE_RATE));
    writeFileSync(join(dir, "asset.json"), `${JSON.stringify(build, null, 2)}\n`);
    return build;
  });
}
