// Small inline assets and pages for the scene-runtime tests. The rig files
// follow the rig contract of #12: root viewBox "0 0 W H", parts
// `class="part-*"` with `data-pivot`, expression groups `class="expr-*"`.
import type { PageScene, PoseEntry } from "@storybook/dsl";
import { vi } from "vitest";
import type { AssetResolver, ResolvedAsset } from "../src/types";

export type Layer = PageScene["layers"][number];
export type Animation = PageScene["animations"][number];
export type Interaction = PageScene["interactions"][number];

// A lower-case UUID v7 for layer `n`.
export function id(n: number): string {
  return `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;
}

const NS = `xmlns="http://www.w3.org/2000/svg"`;

function rig(pose: string, parts = true): string {
  return `<svg ${NS} viewBox="0 0 100 200">
  <defs><linearGradient id="fur"><stop offset="0"/></linearGradient></defs>
  <g class="pose-${pose}"><rect class="part-body" fill="url(#fur)" width="100" height="200"/></g>
  ${parts ? `<g class="part-eyes" data-pivot="50 40"><circle cx="50" cy="40" r="4"/></g>` : ""}
  ${parts ? `<g class="part-arm-right" data-pivot="40 12"><rect x="40" y="12" width="30" height="8"/></g>` : ""}
  <g class="expr-happy"><path d="M40 60 Q50 70 60 60"/></g>
  <g class="expr-sad"><path d="M40 66 Q50 56 60 66"/></g>
</svg>`;
}

function face(name: string): string {
  return `<svg ${NS} viewBox="0 0 100 200">
  <script>alert(1)</script>
  <defs><radialGradient id="glow"><stop offset="0"/></radialGradient></defs>
  <g class="${name}" onclick="alert(1)"><circle fill="url(#glow)" cx="50" cy="50" r="40"/></g>
</svg>`;
}

const TREE = `<svg ${NS} viewBox="0 0 120 240">
  <script>alert(1)</script>
  <defs><linearGradient id="leaf"><stop offset="0"/></linearGradient></defs>
  <g class="tree" onclick="alert(1)"><rect fill="url(#leaf)" width="120" height="240"/></g>
</svg>`;

const foot = { x: 50, y: 100 };
const box = { x: 0, y: 0, w: 100, h: 200 };

type FakeAsset = ResolvedAsset & { files: Record<string, string> };

function character(
  renderer: ResolvedAsset["renderer"],
  poses: PoseEntry[],
  legal: { pose: string; expression: string }[],
  files: Record<string, string>,
): FakeAsset {
  return {
    renderer,
    manifest: { kind: "character", poses, expressions: ["happy", "sad"], legal, flippable: true },
    files,
  };
}

// A backdrop SVG of 2400 x 1200 units with one local reference (#68).
const MEADOW = `<svg ${NS} viewBox="0 0 2400 1200"><defs><linearGradient id="sky"><stop offset="0"/></linearGradient></defs><rect fill="url(#sky)" width="2400" height="1200"/></svg>`;

export const ASSETS: Record<string, FakeAsset> = {
  // Backdrop with an svg variant for every sky (#68, Exact changes 11).
  meadow: {
    renderer: "svg",
    manifest: {
      kind: "backdrop",
      description: "an open meadow with soft hills",
      size: { width: 2400, height: 1200 },
      variants: (["day", "cloudy", "dusk", "night"] as const).map((sky) => ({ sky, file: `${sky}.svg` })),
    },
    files: { "day.svg": MEADOW, "cloudy.svg": MEADOW, "dusk.svg": MEADOW, "night.svg": MEADOW },
  },
  // WebP backdrop with the day and night variants only.
  pond: {
    renderer: "webp",
    manifest: {
      kind: "backdrop",
      description: "a pond",
      size: { width: 2400, height: 1200 },
      variants: (["day", "night"] as const).map((sky) => ({ sky, file: `${sky}.webp` })),
    },
    files: {},
  },
  // svg-rig character. Legal: stand/happy, stand/sad, sit/happy.
  pip: character(
    "svg-rig",
    [
      { id: "stand", file: "stand.svg", foot, box },
      { id: "sit", file: "sit.svg", foot: { x: 50, y: 180 }, box: { x: 0, y: 20, w: 100, h: 180 } },
    ],
    [
      { pose: "stand", expression: "happy" },
      { pose: "stand", expression: "sad" },
      { pose: "sit", expression: "happy" },
    ],
    { "stand.svg": rig("stand"), "sit.svg": rig("sit") },
  ),
  // R64: svg-rig like Pip's file, where the non-default expression group is
  // hidden by the presentation attribute display="none".
  rigattr: character(
    "svg-rig",
    [{ id: "stand", file: "stand.svg", foot, box }],
    [
      { pose: "stand", expression: "happy" },
      { pose: "stand", expression: "sad" },
    ],
    { "stand.svg": rig("stand").replace('<g class="expr-sad">', '<g class="expr-sad" display="none">') },
  ),
  // Review item 3: the manifest allows sad, but the rig file has only
  // expr-happy, and the sit file does not exist (its load fails).
  rigone: character(
    "svg-rig",
    [
      { id: "stand", file: "stand.svg", foot, box },
      { id: "sit", file: "sit.svg", foot: { x: 50, y: 180 }, box: { x: 0, y: 20, w: 100, h: 180 } },
    ],
    [
      { pose: "stand", expression: "happy" },
      { pose: "stand", expression: "sad" },
      { pose: "sit", expression: "happy" },
    ],
    { "stand.svg": rig("stand").replace(/<g class="expr-sad">.*?<\/g>/s, "") },
  ),
  // svg-rig without part-eyes and part-arm-right.
  noparts: character(
    "svg-rig",
    [{ id: "stand", file: "stand.svg", foot, box }],
    [{ pose: "stand", expression: "happy" }],
    { "stand.svg": rig("stand", false) },
  ),
  // Plain svg character, one file per expression.
  owl: character(
    "svg",
    [
      { id: "stand", file: "owl-happy.svg", foot, box, expression: "happy" },
      { id: "stand", file: "owl-sad.svg", foot, box, expression: "sad" },
    ],
    [
      { pose: "stand", expression: "happy" },
      { pose: "stand", expression: "sad" },
    ],
    { "owl-happy.svg": face("owl-happy"), "owl-sad.svg": face("owl-sad") },
  ),
  // Follow-up item d: stand/sad is legal but owl-sad.svg is not in the files
  // (its load fails); sit is legal only with happy.
  owlx: character(
    "svg",
    [
      { id: "stand", file: "owl-happy.svg", foot, box, expression: "happy" },
      { id: "stand", file: "owl-sad.svg", foot, box, expression: "sad" },
      { id: "sit", file: "owl-sit.svg", foot, box, expression: "happy" },
    ],
    [
      { pose: "stand", expression: "happy" },
      { pose: "stand", expression: "sad" },
      { pose: "sit", expression: "happy" },
    ],
    { "owl-happy.svg": face("owl-happy"), "owl-sit.svg": face("owl-sit") },
  ),
  // WebP character, one file per expression.
  bun: character(
    "webp",
    [
      { id: "stand", file: "bun-happy.webp", foot, box, expression: "happy" },
      { id: "stand", file: "bun-sad.webp", foot, box, expression: "sad" },
    ],
    [
      { pose: "stand", expression: "happy" },
      { pose: "stand", expression: "sad" },
    ],
    {},
  ),
  // Review item 4: a plain svg prop whose viewBox has a zero width.
  flat: {
    renderer: "svg",
    manifest: {
      kind: "prop",
      poses: [{ id: "default", file: "flat.svg", foot: { x: 0, y: 100 }, box: { x: 0, y: 0, w: 1, h: 100 } }],
      expressions: [],
      legal: [],
      flippable: true,
    },
    files: { "flat.svg": `<svg ${NS} viewBox="0 0 0 100"><rect width="1" height="1"/></svg>` },
  },
  // Plain svg prop.
  tree: {
    renderer: "svg",
    manifest: {
      kind: "prop",
      poses: [{ id: "default", file: "tree.svg", foot: { x: 60, y: 240 }, box: { x: 0, y: 0, w: 120, h: 240 } }],
      expressions: [],
      legal: [],
      flippable: true,
    },
    files: { "tree.svg": TREE },
  },
};

export function SVG_TEXT(ref: string, file: string): string {
  const text = ASSETS[ref]?.files[file];
  if (text === undefined) throw new Error(`no file ${ref}/${file}`);
  return text;
}

export function makeResolver() {
  const svgText = vi.fn(async (ref: string, file: string) => SVG_TEXT(ref, file));
  const resolver: AssetResolver = {
    get(ref) {
      const asset = ASSETS[ref];
      return asset ? { renderer: asset.renderer, manifest: asset.manifest } : undefined;
    },
    url: (ref, file) => `https://cdn.test/${ref}/${file}`,
    svgText,
  };
  return { resolver, svgText };
}

const KIND: Record<string, Layer["kind"]> = { tree: "prop" };

export function layer(n: number, ref: string, extra: Partial<Layer> = {}): Layer {
  return {
    instanceId: id(n),
    kind: KIND[ref] ?? "character",
    ref,
    slot: `slot-${n}`,
    at: { x: 500, y: 600, scale: 0.5, z: n },
    ...extra,
  };
}

export function page(
  layers: Layer[],
  animations: Animation[] = [],
  interactions: Interaction[] = [],
  sky: PageScene["sky"] = "night",
  backdrop = "meadow",
): PageScene {
  return { templateId: "t-1", backdrop, sky, layers, animations, interactions };
}
