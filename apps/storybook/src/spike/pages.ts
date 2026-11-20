import type { Animation, Interaction, LayoutTemplate, PageScene, RegistrySnapshot } from "@storybook/dsl";
import { validateScene } from "@storybook/dsl";
import { layoutScene } from "@storybook/layout";
import type { SpikeRef } from "./assets";

type Kind = "character" | "prop" | "scenery";
type LayerDef = { kind: Kind; ref: SpikeRef; pose?: string; expression?: string };
type AnimationDef = { ref: SpikeRef; trigger: "enter" | "loop"; primitive: Animation["primitive"]; params: Record<string, number> };
type ActionDef =
  | { action: "play_animation"; ref: SpikeRef; primitive: Animation["primitive"] }
  | { action: "set_expression"; ref: SpikeRef; expression: string }
  | { action: "set_pose"; ref: SpikeRef; pose: string };
type TapDef = { ref: SpikeRef; do: ActionDef[] };
type SpikePageDef = { layers: LayerDef[]; animations: AnimationDef[]; taps: TapDef[] };

// The 3 fixture pages (issue #15, "SPIKE_PAGES"). Parameter names and units
// are those of `PRIMITIVES` (#10). The pace is slow: floats run on a 4 s loop.
export const SPIKE_PAGES: Record<1 | 2 | 3, SpikePageDef> = {
  1: {
    layers: [
      { kind: "scenery", ref: "tree", pose: "default" },
      { kind: "prop", ref: "toolbox", pose: "default" },
      { kind: "character", ref: "pip", pose: "front", expression: "happy" },
    ],
    animations: [
      { ref: "pip", trigger: "loop", primitive: "blink", params: { interval: 4 } },
      { ref: "pip", trigger: "enter", primitive: "wave", params: { count: 2 } },
      { ref: "tree", trigger: "loop", primitive: "sway", params: { angle: 2, period: 5 } },
    ],
    taps: [
      {
        ref: "pip",
        do: [
          { action: "set_expression", ref: "pip", expression: "surprised" },
          { action: "play_animation", ref: "pip", primitive: "wave" },
        ],
      },
      { ref: "toolbox", do: [{ action: "play_animation", ref: "toolbox", primitive: "pop" }] },
    ],
  },
  2: {
    layers: [
      { kind: "scenery", ref: "fence", pose: "default" },
      { kind: "character", ref: "pip", pose: "front", expression: "sad" },
      { kind: "character", ref: "cow", pose: "walk", expression: "happy" },
    ],
    animations: [
      { ref: "pip", trigger: "loop", primitive: "float", params: { amplitude: 0.01, period: 4 } },
      { ref: "cow", trigger: "enter", primitive: "bounce", params: { height: 0.02, count: 1 } },
    ],
    taps: [
      { ref: "pip", do: [{ action: "set_expression", ref: "pip", expression: "happy" }] },
      { ref: "cow", do: [{ action: "set_pose", ref: "cow", pose: "front" }] },
    ],
  },
  3: {
    layers: [
      { kind: "scenery", ref: "tree", pose: "default" },
      { kind: "scenery", ref: "fence", pose: "default" },
      { kind: "prop", ref: "toolbox", pose: "default" },
      { kind: "character", ref: "pip", pose: "front", expression: "worried" },
    ],
    animations: [
      { ref: "pip", trigger: "loop", primitive: "float", params: { amplitude: 0.01, period: 4 } },
      { ref: "pip", trigger: "loop", primitive: "blink", params: { interval: 3 } },
      { ref: "toolbox", trigger: "enter", primitive: "fade-in", params: { delay: 0.5 } },
    ],
    taps: [
      { ref: "tree", do: [{ action: "play_animation", ref: "tree", primitive: "sway" }] },
      {
        ref: "pip",
        do: [
          { action: "set_expression", ref: "pip", expression: "happy" },
          { action: "play_animation", ref: "pip", primitive: "wave" },
        ],
      },
    ],
  },
};

// Layer IDs are fixed UUID v7 values, because `LayerSchema.instanceId` must be
// one (implementation decision: the issue text had `p<n>-<ref>`). Page `n`,
// layer index `i` gives `00000000-0000-7000-8000-0000000000<n><i>`.
const instanceId = (n: number, index: number) => `00000000-0000-7000-8000-0000000000${n}${index}`;

// The scene of page `n` in the first template whose slots take every layer and
// that passes `validateScene` and `layoutScene` with no issues. Returns the
// laid-out scene (every layer has `at`). No `at` is written by hand.
export function buildSpikePage(
  n: 1 | 2 | 3,
  ctx: { registry: RegistrySnapshot; templates: LayoutTemplate[] },
): PageScene {
  const def = SPIKE_PAGES[n];
  const idOf = (ref: SpikeRef) => instanceId(n, def.layers.findIndex((l) => l.ref === ref));
  for (const template of ctx.templates) {
    const used = new Set<string>();
    const layers: PageScene["layers"] = [];
    for (const [index, layer] of def.layers.entries()) {
      const slot = template.slots.find((s) => s.accepts === layer.kind && !used.has(s.id));
      if (!slot) break;
      used.add(slot.id);
      layers.push({ instanceId: instanceId(n, index), kind: layer.kind, ref: layer.ref, pose: layer.pose, expression: layer.expression, slot: slot.id });
    }
    if (layers.length < def.layers.length) continue;
    const scene: PageScene = {
      templateId: template.id,
      backdrop: "meadow",
      sky: "day",
      layers,
      animations: def.animations.map((a) => ({ target: idOf(a.ref), primitive: a.primitive, params: a.params, trigger: a.trigger }) as Animation),
      interactions: def.taps.map(
        (tap): Interaction => ({
          on: { tap: idOf(tap.ref) },
          do: tap.do.map((a) => {
            const target = idOf(a.ref);
            if (a.action === "play_animation") return { action: a.action, target, primitive: a.primitive };
            if (a.action === "set_expression") return { action: a.action, target, expression: a.expression };
            return { action: a.action, target, pose: a.pose };
          }),
        }),
      ),
    };
    if (validateScene(scene, ctx).length > 0) continue;
    const placed = layoutScene(scene, ctx);
    if (placed.issues.length === 0) return placed.scene;
  }
  throw new Error(`no template fits spike page ${n}`);
}
