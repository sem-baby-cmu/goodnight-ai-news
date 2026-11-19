import { z } from "zod";

export type AssetKind = "character" | "prop" | "scenery" | "sfx";
export type Renderer = "svg-rig" | "svg" | "webp" | "audio";

export const RENDERERS = ["svg-rig", "svg", "webp", "audio"] as const satisfies readonly Renderer[];

// Units are pixels of the pose file (design "8. Asset pipeline", Measure).
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

const PointSchema = z.strictObject({ x: z.number(), y: z.number() });
const RectSchema = z.strictObject({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

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
    poses: z.array(PoseEntrySchema).min(1),
    expressions: z.array(z.string()),
    legal: z.array(z.strictObject({ pose: z.string(), expression: z.string() })),
    flippable: z.boolean(),
    parts: z.array(z.string()).optional(),
  }),
  z.strictObject({ kind: z.literal("sfx"), file: z.string(), durationMs: z.number() }),
]);

export type AssetManifest = z.infer<typeof AssetManifestSchema>;

export type RegistrySnapshot = {
  assets: Record<string, { kind: AssetKind; renderer: Renderer; version: number; manifest: AssetManifest }>;
};

// Picks the pose file for a layer (implementation decision R8).
export function selectPoseEntry(manifest: AssetManifest, pose?: string, expression?: string): PoseEntry | undefined {
  if (manifest.kind === "sfx") return undefined;
  if (pose === undefined) return manifest.poses[0];
  if (expression !== undefined) {
    const exact = manifest.poses.find((p) => p.id === pose && p.expression === expression);
    if (exact) return exact;
  }
  return manifest.poses.find((p) => p.id === pose);
}
