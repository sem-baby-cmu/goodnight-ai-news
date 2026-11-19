import { z } from "zod";
import { makeSceneDraftSchema, makeScriptDraftSchema } from "./draft";
import type { RegistrySnapshot } from "./registry";
import type { LayoutTemplate } from "./template";

// The model JSON schema is a hint. zod and `validateScene` are the gate.

const uniqSorted = (values: string[]) => [...new Set(values)].sort();

// Every object node: no extra keys, every key required.
function makeStrict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(makeStrict);
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) out[key] = makeStrict(value);
  if (out.type === "object") {
    out.additionalProperties = false;
    out.required = Object.keys((out.properties as Record<string, unknown> | undefined) ?? {});
  }
  return out;
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { unrepresentable: "throw", reused: "inline" });
  return makeStrict(json) as Record<string, unknown>;
}

export function buildOutlineJsonSchema(registry: RegistrySnapshot): Record<string, unknown> {
  const characters = uniqSorted(
    Object.entries(registry.assets)
      .filter(([, a]) => a.kind === "character")
      .map(([key]) => key),
  );
  if (characters.length === 0) throw new Error("registry has no character assets");
  return toJsonSchema(makeScriptDraftSchema(characters));
}

export function buildSceneJsonSchema(ctx: {
  registry: RegistrySnapshot;
  templates: LayoutTemplate[];
}): Record<string, unknown> {
  const assets = Object.entries(ctx.registry.assets);
  const visual = assets.flatMap(([key, a]) => (a.kind !== "sfx" && a.manifest.kind !== "sfx" ? [{ key, manifest: a.manifest }] : []));
  return toJsonSchema(
    makeSceneDraftSchema({
      templateId: uniqSorted(ctx.templates.map((t) => t.id)),
      slot: uniqSorted(ctx.templates.flatMap((t) => t.slots.map((s) => s.id))),
      ref: uniqSorted(visual.map((v) => v.key)),
      pose: uniqSorted(visual.flatMap((v) => v.manifest.poses.map((p) => p.id))),
      expression: uniqSorted(visual.flatMap((v) => v.manifest.expressions)),
      sfx: uniqSorted(assets.filter(([, a]) => a.kind === "sfx").map(([key]) => key)),
    }),
  );
}
