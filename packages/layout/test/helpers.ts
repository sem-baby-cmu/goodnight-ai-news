// Builders for the layout tests. The asset values are defined in each test file.
import type { AssetManifest, LayoutTemplate, PageScene, PoseEntry, RegistrySnapshot } from "@storybook/dsl";

type Kind = "character" | "prop" | "scenery";
type Slot = LayoutTemplate["slots"][number];
type Layer = PageScene["layers"][number];

export type TestAsset = { kind: Kind; entry: Omit<PoseEntry, "id" | "file"> };

// A lower-case UUID v7 for layer `n`.
export function id(n: number): string {
  return `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;
}

function manifest(asset: TestAsset): AssetManifest {
  return {
    kind: asset.kind,
    poses: [{ id: "default", file: "default.svg", ...asset.entry }],
    expressions: [],
    legal: [],
    flippable: true,
  };
}

export function registryOf(assets: Record<string, TestAsset>): RegistrySnapshot {
  const out: RegistrySnapshot = { assets: {} };
  for (const [key, asset] of Object.entries(assets)) {
    out.assets[key] = { kind: asset.kind, renderer: "svg", version: 1, manifest: manifest(asset) };
  }
  return out;
}

export type LayerSpec = { ref: string; kind: Kind; slot: string } & Partial<Pick<Layer, "pose" | "expression" | "at" | "flip">>;

export function sceneOf(templateId: string, specs: LayerSpec[]): PageScene {
  const layers: Layer[] = specs.map((spec, i) => ({ instanceId: id(i + 1), ...spec }));
  return {
    templateId,
    sky: "day",
    layers,
    animations: [{ target: id(1), primitive: "float", params: { amplitude: 0.01, period: 4 }, trigger: "loop" }],
    interactions: [{ on: { tap: id(1) }, do: [{ action: "play_animation", target: id(1), primitive: "pop" }] }],
  };
}

// A test-only template: every slot has height 100 and minScale 1.0, so a
// 100-unit-high asset gets scale 1 and is never shrunk.
export function testTemplate(slots: Array<Pick<Slot, "id" | "accepts" | "footX" | "footY" | "z">>): LayoutTemplate {
  return {
    id: "test",
    stage: { width: 1600, height: 1200 },
    slots: slots.map((slot) => ({ ...slot, height: 100, minScale: 1 })),
  };
}

export function codes(issues: Array<{ code: string }>): string[] {
  return issues.map((issue) => issue.code);
}
