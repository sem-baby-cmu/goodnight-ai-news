import type { PageScene } from "@storybook/dsl";
import { STAGE_H, STAGE_W } from "./keyframes";
import type { AssetResolver } from "./types";

// The backdrop frame (ADR 0016 section 1, design "5. Scene runtime"): the
// 1600 x 1200 stage in the middle and 400 units of bleed on each side.
export const FRAME_W = 2400;
export const FRAME_H = 1200;
export const BLEED = 400;
// DESIGN.md 8: the texture tile is 480 x 480 stage units at 32 % opacity.
export const TEXTURE_TILE = 480;
export const TEXTURE_OPACITY = 0.32;
// design "5", "Late images": the late image fades in for 200 ms.
export const LATE_FADE_MS = 200;
// DESIGN.md 2 `--paper`.
export const PAPER = "var(--paper, #FFF8EC)";

export type Fit = "contain" | "cover";

const size = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

// Scale and offset of the frame in a viewport of `width` x `height` CSS px
// (invariant 3). `contain` shows the whole stage; `cover` fills the box with
// the frame. The frame is centred in both. A zero size gives k = 0.
export function fitFrame(width: number, height: number, fit: Fit = "contain"): { k: number; x: number; y: number } {
  const w = size(width);
  const h = size(height);
  const k = w === 0 || h === 0 ? 0 : fit === "cover" ? Math.max(h / FRAME_H, w / FRAME_W) : Math.min(w / STAGE_W, h / STAGE_H);
  return { k, x: (w - FRAME_W * k) / 2, y: (h - FRAME_H * k) / 2 };
}

export type BackdropSource =
  | { ok: true; renderer: "svg" | "webp"; file: string; url: string }
  | { ok: false; reason: string };

// The variant file that (backdrop, sky) names. No fallback to another
// variant or backdrop (invariant 1, "No silent fixes").
export function resolveBackdrop(assets: AssetResolver, scene: Pick<PageScene, "backdrop" | "sky">): BackdropSource {
  const key = scene.backdrop;
  const asset = assets.get(key);
  if (!asset) return { ok: false, reason: `backdrop "${key}" is not in the assets` };
  const { manifest, renderer } = asset;
  if (manifest.kind !== "backdrop") return { ok: false, reason: `asset "${key}" is not a backdrop` };
  const variant = manifest.variants.find((v) => v.sky === scene.sky);
  if (!variant) return { ok: false, reason: `backdrop "${key}" has no variant for sky "${scene.sky}"` };
  if (renderer !== "svg" && renderer !== "webp") return { ok: false, reason: `backdrop "${key}" has renderer "${renderer}"` };
  return { ok: true, renderer, file: variant.file, url: assets.url(key, variant.file) };
}
