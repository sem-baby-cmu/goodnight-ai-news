import { type LayoutTemplate, validateScene } from "@storybook/dsl";
import { layoutScene, TEMPLATES } from "@storybook/layout";
import { expect, it } from "vitest";
import { buildSpikePage } from "./pages";
import { SPIKE_REGISTRY_FIXTURE } from "./registry.fixture";

const ctx = { registry: SPIKE_REGISTRY_FIXTURE, templates: TEMPLATES };

it("buildSpikePage n=1,2,3 passes validateScene with no issues", () => {
  for (const n of [1, 2, 3] as const) {
    const scene = buildSpikePage(n, ctx);
    expect(validateScene(scene, ctx), `page ${n}`).toEqual([]);
  }
});

it("buildSpikePage n=1,2,3 layoutScene returns no issues and every layer has at", () => {
  for (const n of [1, 2, 3] as const) {
    const scene = buildSpikePage(n, ctx);
    const placed = layoutScene(scene, ctx);
    expect(placed.issues, `page ${n}`).toEqual([]);
    for (const layer of placed.scene.layers) expect(layer.at, `page ${n} ${layer.instanceId}`).toBeDefined();
    for (const layer of scene.layers) expect(layer.at, `page ${n} ${layer.instanceId}`).toBeDefined();
  }
});

it('buildSpikePage throws "no template fits" when TEMPLATES is empty', () => {
  const templates: LayoutTemplate[] = [];
  expect(() => buildSpikePage(1, { registry: SPIKE_REGISTRY_FIXTURE, templates })).toThrow(/no template fits spike page 1/);
});
