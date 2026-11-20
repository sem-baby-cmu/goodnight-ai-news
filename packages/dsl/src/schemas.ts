import { z } from "zod";
import { PRIMITIVES, PRIMITIVE_IDS, type PrimitiveId, SKY_PALETTES } from "./primitives";
import { AssetManifestSchema, RENDERERS } from "./registry";

// Lower-case UUID version 7 (ADR 0007).
const uuid7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

export const LAYER_KINDS = ["character", "prop", "scenery"] as const;
const LayerKind = z.enum(LAYER_KINDS);

type Str = z.ZodType<string>;

// ---- Shape factories. schemas.ts and draft.ts build every scene shape from
// these, so the zod schemas and the model JSON schema have one source.

function paramsSchema(id: PrimitiveId) {
  const shape: Record<string, z.ZodNumber> = {};
  for (const [key, b] of Object.entries(PRIMITIVES[id].params)) {
    const n = b.integer ? z.number().int() : z.number();
    shape[key] = n.min(b.min).max(b.max);
  }
  return z.strictObject(shape);
}

// One member per primitive, with its own bounded params. A value outside the
// bounds fails; code does not clamp it (design "5. Scene runtime").
export function animationSchema(target: Str) {
  const members = PRIMITIVE_IDS.map((id) =>
    z.strictObject({
      target,
      primitive: z.literal(id),
      params: paramsSchema(id),
      trigger: z.enum(["enter", "loop"]),
    }),
  );
  return z.discriminatedUnion("primitive", members as [(typeof members)[number], ...typeof members]);
}

export type ActionEnums = {
  target: Str;
  // `null` leaves out the `play_sfx` variant (the registry has no sound).
  sfx: Str | null;
  expression: Str;
  pose: Str;
};

export function actionSchema(e: ActionEnums) {
  const playAnimation = z.strictObject({
    action: z.literal("play_animation"),
    target: e.target,
    primitive: z.enum(PRIMITIVE_IDS),
  });
  const playSfx = z.strictObject({ action: z.literal("play_sfx"), sfx: e.sfx ?? z.string() });
  const showBubble = z.strictObject({
    action: z.literal("show_bubble"),
    target: e.target,
    text: z.string().min(1).max(60),
  });
  const setExpression = z.strictObject({ action: z.literal("set_expression"), target: e.target, expression: e.expression });
  const setPose = z.strictObject({ action: z.literal("set_pose"), target: e.target, pose: e.pose });
  const all = z.discriminatedUnion("action", [playAnimation, playSfx, showBubble, setExpression, setPose]);
  if (e.sfx !== null) return all;
  // Same TypeScript type; the value has no play_sfx member.
  return z.discriminatedUnion("action", [playAnimation, showBubble, setExpression, setPose]) as unknown as typeof all;
}

export function interactionSchema(e: ActionEnums) {
  return z.strictObject({ on: z.strictObject({ tap: e.target }), do: z.array(actionSchema(e)).min(1) });
}

// The page minimums come from the requirements: at least one layer, one
// animation, and one tap interaction (implementation decision R23).
export function sceneSchema<L extends z.ZodType>(layer: L, e: ActionEnums & { templateId: Str; backdrop: Str }) {
  return z.strictObject({
    templateId: e.templateId,
    backdrop: e.backdrop,
    sky: z.enum(SKY_PALETTES),
    layers: z.array(layer).min(1),
    animations: z.array(animationSchema(e.target)).min(1),
    interactions: z.array(interactionSchema(e)).min(1),
  });
}

// ---- Stored shapes (design "Storybook DSL").

export const OutlineSchema = z.strictObject({
  title: z.string().min(1),
  ageBand: z.literal("5-7"),
  cast: z.array(z.string()).min(1),
  pages: z.array(z.strictObject({ pageId: uuid7, beat: z.string().min(1) })).min(6).max(8),
});

export const PageTextSchema = z
  .strictObject({ text: z.string() })
  .superRefine(({ text }, ctx) => {
    const words = text.trim().split(/\s+/).length;
    if (words < 1 || words > 40) {
      ctx.addIssue({ code: "custom", path: ["text"], message: `The text has ${words} words; the limit is 1 to 40.` });
    }
    const sentences = text
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean).length;
    if (sentences < 1 || sentences > 3) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: `The text has ${sentences} sentences; the limit is 1 to 3.`,
      });
    }
  });

const AtSchema = z.strictObject({ x: z.number(), y: z.number(), scale: z.number().gt(0), z: z.number().int() });

const layerShape = {
  instanceId: uuid7,
  kind: LayerKind,
  ref: z.string(),
  pose: z.string().optional(),
  expression: z.string().optional(),
  slot: z.string(),
  at: AtSchema.optional(),
  flip: z.boolean().optional(),
};

export const LayerSchema = z.strictObject(layerShape);

const plain: ActionEnums & { templateId: Str; backdrop: Str } = {
  templateId: z.string(),
  backdrop: z.string(),
  target: z.string(),
  sfx: z.string(),
  expression: z.string(),
  pose: z.string(),
};

export const AnimationSchema = animationSchema(plain.target);
export const InteractionSchema = interactionSchema(plain);
export const PageSceneSchema = sceneSchema(LayerSchema, plain);

export const ReleaseManifestSchema = z.strictObject({
  format: z.literal("storybook-mvp"),
  formatVersion: z.literal(1),
  storyId: uuid7,
  releaseId: uuid7,
  number: z.number().int().min(1),
  title: z.string(),
  pages: z.array(z.strictObject({ pageId: uuid7, json: z.string() })).min(1),
});

// In a release, every layer has `at`.
const PlacedLayerSchema = z.strictObject({ ...layerShape, at: AtSchema });

export const ReleasePageSchema = z.strictObject({
  pageId: uuid7,
  text: z.string(),
  audio: z.string(),
  scene: sceneSchema(PlacedLayerSchema, plain),
  assets: z.record(
    z.string(),
    z.strictObject({ renderer: z.enum(RENDERERS), manifest: AssetManifestSchema, base: z.string() }),
  ),
});

export type Outline = z.infer<typeof OutlineSchema>;
export type PageText = z.infer<typeof PageTextSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type Animation = z.infer<typeof AnimationSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type PageScene = z.infer<typeof PageSceneSchema>;
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;
export type ReleasePage = z.infer<typeof ReleasePageSchema>;
