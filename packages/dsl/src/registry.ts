import { z } from "zod";
import { SKY_PALETTES } from "./primitives";

export type AssetKind = "character" | "prop" | "scenery" | "backdrop" | "sfx";
export type Renderer = "svg-rig" | "svg" | "webp" | "audio";

export const RENDERERS = ["svg-rig", "svg", "webp", "audio"] as const satisfies readonly Renderer[];

// Units are pixels of the pose file (design "8. Asset pipeline", Measure).
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

const PointSchema = z.strictObject({ x: z.number(), y: z.number() });
// A rect needs a positive size: a zero height gives layout scale Infinity (#47).
const RectSchema = z.strictObject({ x: z.number(), y: z.number(), w: z.number().gt(0), h: z.number().gt(0) });

// One item of `poses` (implementation decision R8). `expression` is set on
// WebP and plain SVG entries that show one expression. It is absent on
// `svg-rig` entries, where the expressions are `expr-*` groups.
const PoseEntrySchema = z.strictObject({
  id: z.string(),
  file: z.string(),
  foot: PointSchema,
  box: RectSchema,
  face: RectSchema.optional(),
  expression: z.string().optional(),
});

export type PoseEntry = z.infer<typeof PoseEntrySchema>;

export const AssetManifestSchema = z.union([
  z.strictObject({
    kind: z.enum(["character", "prop", "scenery"]),
    // One line for the model (#84). Optional: releases made before #84 have none.
    description: z.string().min(1).optional(),
    poses: z.array(PoseEntrySchema).min(1),
    expressions: z.array(z.string()),
    legal: z.array(z.strictObject({ pose: z.string(), expression: z.string() })),
    flippable: z.boolean(),
    parts: z.array(z.string()).optional(),
  }),
  // A backdrop is not a layer (ADR 0016 section 1): one file per sky palette.
  z.strictObject({
    kind: z.literal("backdrop"),
    description: z.string().min(1),
    size: z.strictObject({ width: z.literal(2400), height: z.literal(1200) }),
    variants: z
      .array(z.strictObject({ sky: z.enum(SKY_PALETTES), file: z.string() }))
      .min(1)
      .refine((variants) => new Set(variants.map((v) => v.sky)).size === variants.length, {
        message: "Each sky palette has at most one variant.",
      }),
  }),
  z.strictObject({ kind: z.literal("sfx"), file: z.string(), durationMs: z.number() }),
]);

export type AssetManifest = z.infer<typeof AssetManifestSchema>;
export type LayerManifest = Extract<AssetManifest, { kind: "character" | "prop" | "scenery" }>;
export type BackdropManifest = Extract<AssetManifest, { kind: "backdrop" }>;

// True for a manifest that a layer can use: one with poses, expressions, and
// legal pairs. Ask this, not "is it not sfx", so a new kind stays out.
export function isLayerManifest(m: AssetManifest): m is LayerManifest {
  return m.kind === "character" || m.kind === "prop" || m.kind === "scenery";
}

// The files of one asset version, once each, in order of first appearance.
// Publish copies these files and the tests seed them.
export function manifestFiles(m: AssetManifest): string[] {
  if (m.kind === "sfx") return [m.file];
  if (m.kind === "backdrop") return [...new Set(m.variants.map((v) => v.file))];
  return [...new Set(m.poses.map((p) => p.file))];
}

export type RegistrySnapshot = {
  assets: Record<string, { kind: AssetKind; renderer: Renderer; version: number; manifest: AssetManifest }>;
};

// Picks the pose file for a layer (implementation decision R8).
export function selectPoseEntry(manifest: AssetManifest, pose?: string, expression?: string): PoseEntry | undefined {
  if (!isLayerManifest(manifest)) return undefined;
  if (pose === undefined) return manifest.poses[0];
  if (expression !== undefined) {
    const exact = manifest.poses.find((p) => p.id === pose && p.expression === expression);
    if (exact) return exact;
  }
  return manifest.poses.find((p) => p.id === pose);
}
