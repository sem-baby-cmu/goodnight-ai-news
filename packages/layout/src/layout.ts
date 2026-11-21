import { type Issue, type LayoutTemplate, type PageScene, type PoseEntry, type RegistrySnapshot, selectPoseEntry } from "@storybook/dsl";
import { CHECK_LIMITS, type Failure, type PlacedLayer, runChecks } from "./checks";
import { layerBoxes } from "./geometry";

// One shrink step, in hundredths of the slot target size.
export const SHRINK_STEP = 5;

type Slot = LayoutTemplate["slots"][number];
type Layer = PageScene["layers"][number];
type At = NonNullable<Layer["at"]>;

type Item = {
  index: number;
  layer: Layer;
  slot: Slot;
  entry: PoseEntry;
  // A layer with `at` in the input keeps it: shrink never touches it.
  fixed: boolean;
  f: number;
  minF: number;
};

const LAYER_KINDS = new Set(["character", "prop", "scenery"]);

const round4 = (value: number) => Math.round(value * 10000) / 10000;
const percent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

// The `at` of `entry` in `slot` at factor `f` (design "4. Layout engine",
// #127): the box fits the slot height and, when set, the slot width; its
// centre is on `footX` and its foot on `footY`. `at` stays the stage position
// of the foot point, so a flipped layer gets the same box.
export function slotAt(
  slot: Slot,
  entry: Pick<PoseEntry, "box" | "foot">,
  flip: boolean | undefined,
  f = 100,
): { x: number; y: number; scale: number; z: number } {
  const base =
    slot.width === undefined ? slot.height / entry.box.h : Math.min(slot.height / entry.box.h, slot.width / entry.box.w);
  const scale = round4((base * f) / 100);
  const off = (entry.box.x + entry.box.w / 2 - entry.foot.x) * scale;
  return { x: round4(flip === true ? slot.footX + off : slot.footX - off), y: slot.footY, scale, z: slot.z };
}

// Places every layer of `scene` in its template slot, runs the checks, and
// shrinks the layers involved down to `minScale`. Never throws, never drops a
// layer, and never moves a layer to another slot: problems are issues.
export function layoutScene(
  scene: PageScene,
  ctx: { registry: RegistrySnapshot; templates: LayoutTemplate[] },
): { scene: PageScene; issues: Issue[] } {
  const out = structuredClone(scene);
  const template = ctx.templates.find((t) => t.id === scene.templateId);
  if (!template) {
    return {
      scene: out,
      issues: [
        { path: "templateId", code: "layout.unknown-template", message: `Unknown layout template "${scene.templateId}".` },
      ],
    };
  }

  const issues: Issue[] = [];
  const items: Item[] = [];
  out.layers.forEach((layer, index) => {
    const add = (code: string, message: string) => issues.push({ path: `layers.${index}`, code, message });
    const slot = template.slots.find((s) => s.id === layer.slot);
    if (!slot) return add("layout.unknown-slot", `Template "${template.id}" has no slot "${layer.slot}".`);
    if (slot.accepts !== layer.kind) {
      return add("layout.slot-kind", `Slot "${slot.id}" accepts ${slot.accepts}, not ${layer.kind}.`);
    }
    if (out.layers.slice(0, index).some((earlier) => earlier.slot === layer.slot)) {
      add("layout.slot-taken", `Slot "${slot.id}" is already used by an earlier layer.`);
      // A layer with a manual `at` is still drawn, so it still takes part in
      // every check (implementation decision R59). Without `at` it stays unplaced.
      if (layer.at === undefined) return;
    }
    const asset = ctx.registry.assets[layer.ref];
    if (!asset || !LAYER_KINDS.has(asset.manifest.kind)) {
      return add("layout.unknown-asset", `Asset "${layer.ref}" is not a character, prop, or scenery asset.`);
    }
    const entry = selectPoseEntry(asset.manifest, layer.pose, layer.expression);
    if (!entry) return add("layout.unknown-pose", `Asset "${layer.ref}" has no pose "${layer.pose ?? ""}".`);
    if (layer.kind === "character" && !entry.face) {
      add("layout.face-missing", `Pose "${entry.id}" of "${layer.ref}" has no face box; the face checks skip it.`);
    }
    items.push({
      index,
      layer,
      slot,
      entry,
      fixed: layer.at !== undefined,
      f: 100,
      minF: Math.round(slot.minScale * 100),
    });
  });

  const free = items.filter((item) => !item.fixed);
  let failures: Failure[];
  for (;;) {
    for (const item of free) {
      item.layer.at = slotAt(item.slot, item.entry, item.layer.flip, item.f);
    }
    failures = runChecks(items.map(toPlaced));
    if (failures.length === 0) break;
    const named = new Set(failures.flatMap((failure) => failure.layers));
    const shrinkable = free.filter((item) => named.has(item.index) && item.f > item.minF);
    if (shrinkable.length === 0) break;
    for (const item of shrinkable) item.f = Math.max(item.minF, item.f - SHRINK_STEP);
  }

  const slotOf = (index: number) => out.layers[index]!.slot;
  for (const failure of failures) {
    issues.push({ path: `layers.${failure.layers[0]}`, code: failure.code, message: describe(failure, slotOf) });
  }
  return { scene: out, issues };
}

function toPlaced(item: Item): PlacedLayer {
  const at = item.layer.at as At;
  return { index: item.index, kind: item.layer.kind, z: at.z, ...layerBoxes(item.entry, at, item.layer.flip) };
}

function describe(failure: Failure, slotOf: (index: number) => string): string {
  const [first, ...rest] = failure.layers.map(slotOf);
  const ratio = percent(failure.ratio ?? 0);
  switch (failure.code) {
    case "layout.face-outside":
      return `${first} face is outside the stage`;
    case "layout.face-covered":
      return `${first} face is ${ratio} covered by ${rest.join(", ")} (limit ${limit(CHECK_LIMITS.faceCovered)})`;
    case "layout.overlap":
      return `${first} and ${rest[0]} overlap ${ratio} (limit ${limit(CHECK_LIMITS.overlap)})`;
    case "layout.bounds":
      return `${first} is ${ratio} outside the stage (limit ${limit(CHECK_LIMITS.bounds)})`;
  }
}

// `0.3 * 100` is not exactly 30 in JavaScript.
const limit = (value: number) => `${Math.round(value * 100)}%`;
