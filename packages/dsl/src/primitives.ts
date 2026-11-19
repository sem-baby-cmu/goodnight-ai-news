import type { Renderer } from "./registry";

// Closed lists from design "5. Scene runtime". Units: `amplitude` and
// `height` are fractions of the stage height; `period`, `delay` and
// `interval` are seconds; `angle` is degrees.

export type ParamBounds = { min: number; max: number; integer: boolean };

export type PrimitiveSpec = {
  renderers: "all" | readonly Renderer[];
  params: Record<string, ParamBounds>;
  // Values for `play_animation`, which has no params (implementation decision R3).
  defaults: Record<string, number>;
};

const num = (min: number, max: number): ParamBounds => ({ min, max, integer: false });
const int = (min: number, max: number): ParamBounds => ({ min, max, integer: true });

export const PRIMITIVES = {
  float: { renderers: "all", params: { amplitude: num(0.005, 0.03), period: num(2, 6) }, defaults: { amplitude: 0.007, period: 4 } },
  sway: { renderers: "all", params: { angle: num(1, 8), period: num(2, 6) }, defaults: { angle: 3, period: 4 } },
  bounce: { renderers: "all", params: { height: num(0.01, 0.05), count: int(1, 3) }, defaults: { height: 0.03, count: 1 } },
  pop: { renderers: "all", params: { scale: num(1.05, 1.25) }, defaults: { scale: 1.15 } },
  "fade-in": { renderers: "all", params: { delay: num(0, 3) }, defaults: { delay: 0 } },
  blink: { renderers: ["svg-rig"], params: { interval: num(2, 6) }, defaults: { interval: 4 } },
  wave: { renderers: ["svg-rig"], params: { count: int(1, 3) }, defaults: { count: 2 } },
} as const satisfies Record<string, PrimitiveSpec>;

export type PrimitiveId = keyof typeof PRIMITIVES;

export const PRIMITIVE_IDS = Object.keys(PRIMITIVES) as [PrimitiveId, ...PrimitiveId[]];

export type TargetKind = "character" | "prop" | "scenery";

export type ActionSpec = { targetKinds: readonly TargetKind[]; maxTextLength?: number };

export const ACTIONS = {
  play_animation: { targetKinds: ["character", "prop", "scenery"] },
  play_sfx: { targetKinds: [] },
  show_bubble: { targetKinds: ["character", "prop", "scenery"], maxTextLength: 60 },
  // Props and scenery have no expressions, so they have no legal pairs.
  set_expression: { targetKinds: ["character"] },
  set_pose: { targetKinds: ["character"] },
} as const satisfies Record<string, ActionSpec>;

export type ActionId = keyof typeof ACTIONS;

// Sky palettes (implementation decision R2).
export const SKY_PALETTES = ["day", "cloudy", "dusk", "night"] as const;

export type PaletteId = (typeof SKY_PALETTES)[number];

// One-shot primitives may not loop (implementation decision R5).
export const ONE_SHOT_PRIMITIVES: readonly PrimitiveId[] = ["bounce", "pop", "fade-in", "wave"];

export function primitiveAllows(id: PrimitiveId, renderer: Renderer): boolean {
  const renderers: "all" | readonly Renderer[] = PRIMITIVES[id].renderers;
  return renderers === "all" || renderers.includes(renderer);
}
