import type { z } from "zod";
import { ACTIONS, ONE_SHOT_PRIMITIVES, primitiveAllows } from "./primitives";
import type { AssetManifest, RegistrySnapshot } from "./registry";
import { type Layer, type PageScene, PageSceneSchema } from "./schemas";
import type { LayoutTemplate } from "./template";

export type Issue = { path: string; code: string; message: string };

type Ctx = { registry: RegistrySnapshot; templates: LayoutTemplate[] };
type VisualManifest = Exclude<AssetManifest, { kind: "sfx" }>;

// Path format (implementation decision R1): the path keys joined with ".".
const joinPath = (path: readonly PropertyKey[]) => path.map(String).join(".");

function schemaIssue(issue: z.core.$ZodIssue): Issue {
  const path = joinPath(issue.path);
  const where = path === "" ? "The scene" : `The value at "${path}"`;
  return { path, code: "schema", message: `${where} is invalid: ${issue.message.replace(/\.$/, "")}.` };
}

// Checks a stored scene: first the zod schema, then the rules that a JSON
// schema cannot express. Returns every issue; an empty list means valid.
// Messages name the bad value but never quote narration or bubble text.
export function validateScene(scene: unknown, ctx: Ctx): Issue[] {
  const parsed = PageSceneSchema.safeParse(scene);
  if (!parsed.success) return parsed.error.issues.map(schemaIssue);
  return semanticIssues(parsed.data, ctx);
}

function visualManifest(ctx: Ctx, ref: string): { renderer: string; manifest: VisualManifest } | undefined {
  const asset = ctx.registry.assets[ref];
  if (!asset || asset.kind === "sfx" || asset.manifest.kind === "sfx") return undefined;
  return { renderer: asset.renderer, manifest: asset.manifest };
}

const isLegal = (m: VisualManifest, pose: string, expression: string) =>
  m.legal.some((p) => p.pose === pose && p.expression === expression);

function semanticIssues(scene: PageScene, ctx: Ctx): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, code: string, message: string) => issues.push({ path, code, message });

  // Template.
  const template = ctx.templates.find((t) => t.id === scene.templateId);
  if (!template) add("templateId", "unknown_template", `Template "${scene.templateId}" is not in the template list.`);
  // A pose that some slot lists is reserved for slots that list it (R35).
  const reserved = new Set(ctx.templates.flatMap((t) => t.slots.flatMap((s) => s.poses ?? [])));

  // Layers, by index.
  const layerById = new Map<string, Layer>();
  const usedSlots = new Set<string>();
  scene.layers.forEach((layer, i) => {
    const p = `layers.${i}`;
    const slot = template?.slots.find((s) => s.id === layer.slot);
    if (template && !slot) {
      add(`${p}.slot`, "unknown_slot", `Slot "${layer.slot}" is not in template "${template.id}".`);
    }
    if (usedSlots.has(layer.slot)) {
      add(`${p}.slot`, "duplicate_slot", `Slot "${layer.slot}" is already used by an earlier layer.`);
    }
    usedSlots.add(layer.slot);
    if (layerById.has(layer.instanceId)) {
      add(`${p}.instanceId`, "duplicate_instance_id", `Layer ID "${layer.instanceId}" is already used by an earlier layer.`);
    } else {
      layerById.set(layer.instanceId, layer);
    }

    const asset = ctx.registry.assets[layer.ref];
    if (!asset) add(`${p}.ref`, "unknown_asset", `Asset "${layer.ref}" is not in the registry.`);
    else if (asset.kind !== layer.kind) {
      add(`${p}.kind`, "asset_kind_mismatch", `Asset "${layer.ref}" is a ${asset.kind}, not a ${layer.kind}.`);
    }

    if (slot && slot.accepts !== layer.kind) {
      add(`${p}.slot`, "slot_kind_mismatch", `Slot "${slot.id}" accepts a ${slot.accepts}, not a ${layer.kind}.`);
    }
    if (slot && layer.pose !== undefined && (slot.poses ? !slot.poses.includes(layer.pose) : reserved.has(layer.pose))) {
      add(`${p}.pose`, "slot_pose_mismatch", `Pose "${layer.pose}" is not allowed in slot "${slot.id}".`);
    }

    // Checks that need the asset manifest. Skipped when the ref is unknown.
    const visual = visualManifest(ctx, layer.ref);
    if (!asset || !visual) return;
    const m = visual.manifest;
    let poseKnown = false;
    if (layer.pose === undefined) {
      add(`${p}.pose`, "missing_pose", `Layer "${layer.ref}" has no pose.`);
    } else if (!m.poses.some((e) => e.id === layer.pose)) {
      add(`${p}.pose`, "unknown_pose", `Pose "${layer.pose}" is not a pose of asset "${layer.ref}".`);
    } else {
      poseKnown = true;
    }
    let expressionKnown = false;
    if (layer.expression === undefined) {
      if (asset.kind === "character") {
        add(`${p}.expression`, "missing_expression", `Character "${layer.ref}" has no expression.`);
      }
    } else if (m.expressions.length === 0) {
      add(`${p}.expression`, "unexpected_expression", `Asset "${layer.ref}" has no expressions, but the layer sets "${layer.expression}".`);
    } else if (!m.expressions.includes(layer.expression)) {
      add(`${p}.expression`, "unknown_expression", `Expression "${layer.expression}" is not an expression of asset "${layer.ref}".`);
    } else {
      expressionKnown = true;
    }
    if (poseKnown && expressionKnown && !isLegal(m, layer.pose!, layer.expression!)) {
      add(p, "illegal_pair", `Pose "${layer.pose}" with expression "${layer.expression}" is not legal for "${layer.ref}".`);
    }
    if (layer.flip === true && !m.flippable) {
      add(`${p}.flip`, "flip_not_allowed", `Asset "${layer.ref}" cannot be flipped.`);
    }
  });

  if (!scene.layers.some((l) => l.kind === "character")) {
    add("layers", "min_character", "The page has no character layer.");
  }

  // The renderer comes from the registry entry of the target layer.
  const rendererRejects = (layer: Layer, primitive: Parameters<typeof primitiveAllows>[0]) => {
    const asset = ctx.registry.assets[layer.ref];
    return asset !== undefined && !primitiveAllows(primitive, asset.renderer);
  };

  // Animations, by index.
  scene.animations.forEach((a, i) => {
    const p = `animations.${i}`;
    if (a.trigger === "loop" && ONE_SHOT_PRIMITIVES.includes(a.primitive)) {
      add(`${p}.trigger`, "loop_not_allowed", `Primitive "${a.primitive}" plays once and cannot loop.`);
    }
    const layer = layerById.get(a.target);
    if (!layer) {
      add(`${p}.target`, "unknown_target", `Target "${a.target}" names no layer of the page.`);
    } else if (rendererRejects(layer, a.primitive)) {
      add(`${p}.primitive`, "primitive_renderer", `Primitive "${a.primitive}" does not work on the renderer of "${layer.ref}".`);
    }
  });

  // Interactions, by index. Each action is checked against the layer as the
  // scene declares it; taps are not simulated in sequence (R4).
  scene.interactions.forEach((t, i) => {
    const p = `interactions.${i}`;
    if (!layerById.has(t.on.tap)) {
      add(`${p}.on.tap`, "unknown_target", `Tap target "${t.on.tap}" names no layer of the page.`);
    }
    t.do.forEach((a, j) => {
      const q = `${p}.do.${j}`;
      if (a.action === "play_sfx") {
        if (ctx.registry.assets[a.sfx]?.kind !== "sfx") {
          add(`${q}.sfx`, "unknown_sfx", `Sound "${a.sfx}" is not an sfx asset in the registry.`);
        }
        return;
      }
      const layer = layerById.get(a.target);
      if (!layer) {
        add(`${q}.target`, "unknown_target", `Target "${a.target}" names no layer of the page.`);
        return;
      }
      const kinds: readonly string[] = ACTIONS[a.action].targetKinds;
      if (!kinds.includes(layer.kind)) {
        add(`${q}.target`, "action_needs_character", `Action "${a.action}" needs a character, but "${layer.ref}" is a ${layer.kind}.`);
        return;
      }
      if (a.action === "play_animation") {
        if (rendererRejects(layer, a.primitive)) {
          add(`${q}.primitive`, "primitive_renderer", `Primitive "${a.primitive}" does not work on the renderer of "${layer.ref}".`);
        }
        return;
      }
      const m = visualManifest(ctx, layer.ref)?.manifest;
      if (!m) return;
      const hasPose = (pose: string | undefined): pose is string => pose !== undefined && m.poses.some((e) => e.id === pose);
      const hasExpression = (e: string | undefined): e is string => e !== undefined && m.expressions.includes(e);
      if (a.action === "set_expression") {
        if (!hasExpression(a.expression)) {
          add(`${q}.expression`, "unknown_expression", `Expression "${a.expression}" is not an expression of asset "${layer.ref}".`);
        } else if (hasPose(layer.pose) && !isLegal(m, layer.pose, a.expression)) {
          add(q, "illegal_pair", `Pose "${layer.pose}" with expression "${a.expression}" is not legal for "${layer.ref}".`);
        }
      } else if (a.action === "set_pose") {
        if (!hasPose(a.pose)) {
          add(`${q}.pose`, "unknown_pose", `Pose "${a.pose}" is not a pose of asset "${layer.ref}".`);
        } else if (hasExpression(layer.expression) && !isLegal(m, a.pose, layer.expression)) {
          add(q, "illegal_pair", `Pose "${a.pose}" with expression "${layer.expression}" is not legal for "${layer.ref}".`);
        }
      }
    });
  });

  return issues;
}
