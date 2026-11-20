import { z } from "zod";
import { LAYER_KINDS, type Layer, type PageScene, sceneSchema } from "./schemas";

// What a model writes. The model has no IDs and no positions: it names
// layers by slot, and code assigns IDs (`assignSceneIds`) and places them.

// Enum lists for the model JSON schema. Without lists, each field is a plain
// string; `json-schema.ts` passes the lists from the registry and templates.
export type SceneDraftLists = {
  templateId: string[];
  backdrop: string[];
  slot: string[];
  ref: string[];
  pose: string[];
  expression: string[];
  // Empty: the schema has no `play_sfx` action.
  sfx: string[];
};

function oneOf(name: string, values: string[]): z.ZodType<string> {
  if (values.length === 0) throw new Error(`cannot build the scene schema: no ${name} values`);
  return z.enum(values as [string, ...string[]]);
}

export function makeScriptDraftSchema(cast?: string[]) {
  return z.strictObject({
    title: z.string().min(1),
    cast: z.array(cast ? oneOf("cast", cast) : z.string()).min(1),
    pages: z
      .array(z.strictObject({ beat: z.string().min(1), text: z.string().min(1) }))
      .min(6)
      .max(8),
  });
}

export function makeSceneDraftSchema(lists?: SceneDraftLists) {
  const pick = (name: keyof SceneDraftLists) => (lists ? oneOf(name, lists[name]) : z.string());
  const slot = pick("slot");
  const pose = pick("pose");
  const expression = pick("expression");
  const layer = z.strictObject({
    kind: z.enum(LAYER_KINDS),
    ref: pick("ref"),
    pose,
    expression: expression.nullable(),
    slot,
    flip: z.boolean(),
  });
  const sfx = !lists ? z.string() : lists.sfx.length > 0 ? oneOf("sfx", lists.sfx) : null;
  return sceneSchema(layer, { templateId: pick("templateId"), backdrop: pick("backdrop"), target: slot, sfx, expression, pose });
}

export const ScriptDraftSchema = makeScriptDraftSchema();
export const SceneDraftSchema = makeSceneDraftSchema();

export type ScriptDraft = z.infer<typeof ScriptDraftSchema>;
export type SceneDraft = z.infer<typeof SceneDraftSchema>;

// Gives each layer an ID from `newId` and rewrites every `target` and
// `on.tap` from a slot ID to that layer's ID. A target that names no slot
// stays as it is, so `validateScene` reports `unknown_target`.
export function assignSceneIds(draft: SceneDraft, newId: () => string): PageScene {
  const bySlot = new Map<string, string>();
  const layers = draft.layers.map((d): Layer => {
    const instanceId = newId();
    if (!bySlot.has(d.slot)) bySlot.set(d.slot, instanceId);
    return {
      instanceId,
      kind: d.kind,
      ref: d.ref,
      pose: d.pose,
      ...(d.expression === null ? {} : { expression: d.expression }),
      slot: d.slot,
      flip: d.flip,
    };
  });
  const id = (slot: string) => bySlot.get(slot) ?? slot;
  return {
    templateId: draft.templateId,
    backdrop: draft.backdrop,
    sky: draft.sky,
    layers,
    animations: draft.animations.map((a) => ({ ...a, target: id(a.target) })),
    interactions: draft.interactions.map((t) => ({
      on: { tap: id(t.on.tap) },
      do: t.do.map((a) => ("target" in a ? { ...a, target: id(a.target) } : a)),
    })),
  };
}
