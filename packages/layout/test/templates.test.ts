import type { LayoutTemplate } from "@storybook/dsl";
import { describe, expect, it } from "vitest";
import { layoutScene, TEMPLATE_DESCRIPTIONS, TEMPLATES } from "../src/index";
import { codes, type LayerSpec, registryOf, sceneOf, type TestAsset } from "./helpers";

// Shared test assets of the refinement.
const refChar: TestAsset = {
  kind: "character",
  entry: { box: { x: 0, y: 0, w: 400, h: 500 }, foot: { x: 200, y: 500 }, face: { x: 80, y: 25, w: 240, h: 175 } },
};
const refSquare: TestAsset = { kind: "prop", entry: { box: { x: 0, y: 0, w: 300, h: 300 }, foot: { x: 150, y: 300 } } };

const ctx = { registry: registryOf({ "ref-char": refChar, "ref-square": refSquare }), templates: TEMPLATES };

// Slots that only one layer may use: the self-check never fills both
// (implementation decision R57).
const EXCLUSIVE: Record<string, [string, string]> = { "solo-center": ["hero", "bust"] };

type Slot = LayoutTemplate["slots"][number];

function fill(template: LayoutTemplate, slots: Slot[]) {
  const specs: LayerSpec[] = slots.map((slot) => ({
    ref: slot.accepts === "character" ? "ref-char" : "ref-square",
    kind: slot.accepts,
    slot: slot.id,
  }));
  return layoutScene(sceneOf(template.id, specs), ctx);
}

// Every slot filled, once for each side of an exclusive pair.
function selfCheckCases(): Array<{ name: string; template: LayoutTemplate; slots: Slot[] }> {
  return TEMPLATES.flatMap((template) => {
    const pair = EXCLUSIVE[template.id];
    if (!pair) return [{ name: template.id, template, slots: template.slots }];
    return pair.map((keep) => {
      const drop = pair.find((id) => id !== keep);
      return { name: `${template.id} with ${keep}`, template, slots: template.slots.filter((s) => s.id !== drop) };
    });
  });
}

describe("templates", () => {
  it("the bust slot of solo-center lists poses [\"bust\"] and no other slot lists poses", () => {
    const withPoses = TEMPLATES.flatMap((t) => t.slots.filter((s) => s.poses !== undefined).map((s) => [t.id, s.id, s.poses]));
    expect(withPoses).toEqual([["solo-center", "bust", ["bust"]]]);
  });

  it("TEMPLATES has the 8 ids in order", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      "solo-center",
      "two-friends",
      "three-friends",
      "hero-and-object",
      "circle-around-object",
      "big-sky",
      "landscape",
      "line-up",
    ]);
  });

  it("every template is well formed", () => {
    for (const t of TEMPLATES) {
      expect(t.stage, t.id).toEqual({ width: 1600, height: 1200 });
      expect(new Set(t.slots.map((s) => s.id)).size, t.id).toBe(t.slots.length);
      expect(new Set(t.slots.map((s) => s.z)).size, t.id).toBe(t.slots.length);
      expect(t.slots.some((s) => s.accepts === "character"), t.id).toBe(true);
      for (const s of t.slots) {
        const where = `${t.id}.${s.id}`;
        expect(s.minScale >= 0.7 && s.minScale <= 1, where).toBe(true);
        expect(Math.round(s.minScale * 100) % 5, where).toBe(0);
        expect(s.footX >= 0 && s.footX <= 1600 && s.footY >= 0 && s.footY <= 1200, where).toBe(true);
        expect(s.height > 0, where).toBe(true);
      }
    }
  });

  it("every scenery slot has a width, and no character or prop slot has one (#127)", () => {
    for (const t of TEMPLATES) {
      for (const s of t.slots) {
        const where = `${t.id}.${s.id}`;
        if (s.accepts === "scenery") expect(s.width !== undefined && s.width > 0, where).toBe(true);
        else expect(s.width, where).toBeUndefined();
      }
    }
  });

  it("every scenery frame is inside the stage, and no width is wider than 2 · min(footX, 1600 − footX) (#127)", () => {
    for (const t of TEMPLATES) {
      for (const s of t.slots.filter((slot) => slot.accepts === "scenery")) {
        const where = `${t.id}.${s.id}`;
        const width = s.width ?? Number.NaN;
        expect(s.footX - width / 2 >= 0, where).toBe(true);
        expect(s.footX + width / 2 <= 1600, where).toBe(true);
        expect(s.footY - s.height >= 0, where).toBe(true);
        expect(s.footY <= 1200, where).toBe(true);
        expect(width <= 2 * Math.min(s.footX, 1600 - s.footX), where).toBe(true);
      }
    }
  });

  it("the scenery slot widths are the D1 ruling of #127", () => {
    const widths = TEMPLATES.flatMap((t) => t.slots.filter((s) => s.accepts === "scenery").map((s) => [`${t.id}.${s.id}`, s.width]));
    expect(widths).toEqual([
      ["solo-center.back-left", 480],
      ["solo-center.back-right", 480],
      ["solo-center.sky-1", 700],
      ["two-friends.back-left", 480],
      ["two-friends.back-right", 480],
      ["two-friends.sky-1", 1600],
      ["three-friends.back-left", 410],
      ["three-friends.back-right", 410],
      ["three-friends.sky-1", 1600],
      ["hero-and-object.back-left", 440],
      ["hero-and-object.back-right", 440],
      ["hero-and-object.sky-1", 600],
      ["circle-around-object.back-left", 370],
      ["circle-around-object.back-right", 370],
      ["big-sky.hill", 720],
      ["big-sky.sky-1", 840],
      ["big-sky.sky-2", 800],
      ["big-sky.sky-3", 1600],
      ["landscape.place", 900],
      ["landscape.side", 310],
      ["landscape.sky-1", 800],
      ["line-up.back-1", 640],
      ["line-up.sky-1", 600],
    ]);
  });

  it("every template has a description", () => {
    expect(Object.keys(TEMPLATE_DESCRIPTIONS).sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
    for (const text of Object.values(TEMPLATE_DESCRIPTIONS)) expect(text.length).toBeGreaterThan(0);
  });

  it("self-check: reference assets fill every slot with no issue and no shrink", () => {
    for (const { name, template, slots } of selfCheckCases()) {
      const result = fill(template, slots);
      expect({ name, issues: result.issues }).toEqual({ name, issues: [] });
      const ats = result.scene.layers.map((layer) => layer.at);
      // scale = min(height, width) / h (#127); x stays footX: the reference
      // assets have a centred foot.
      const expected = slots.map((slot) => {
        const h = slot.accepts === "character" ? 500 : 300;
        const target = Math.min(slot.height, slot.width ?? Number.POSITIVE_INFINITY);
        return { x: slot.footX, y: slot.footY, scale: Math.round((target / h) * 10000) / 10000, z: slot.z };
      });
      expect({ name, ats }).toEqual({ name, ats: expected });
    }
  });

  it("solo-center with both hero and bust fails overlap", () => {
    const template = TEMPLATES.find((t) => t.id === "solo-center")!;
    const slots = template.slots.filter((s) => s.id === "hero" || s.id === "bust");
    const result = fill(template, slots);
    expect(codes(result.issues)).toContain("layout.overlap");
    const overlap = result.issues.find((i) => i.code === "layout.overlap")!;
    expect(overlap.message).toMatch(/^hero and bust overlap /);
  });
});
