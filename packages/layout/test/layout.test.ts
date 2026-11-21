import { describe, expect, it } from "vitest";
import type { LayoutTemplate } from "@storybook/dsl";
import { layerBoxes, layoutScene, SHRINK_STEP, slotAt, TEMPLATES } from "../src/index";
import { codes, type LayerSpec, registryOf, sceneOf, type TestAsset } from "./helpers";

// Shared test assets of the refinement.
const refChar: TestAsset = {
  kind: "character",
  entry: { box: { x: 0, y: 0, w: 400, h: 500 }, foot: { x: 200, y: 500 }, face: { x: 80, y: 25, w: 240, h: 175 } },
};
const sq500: TestAsset = {
  kind: "character",
  entry: { box: { x: 0, y: 0, w: 500, h: 500 }, foot: { x: 250, y: 500 }, face: { x: 100, y: 25, w: 300, h: 175 } },
};
const wide800: TestAsset = {
  kind: "character",
  entry: { box: { x: 0, y: 0, w: 800, h: 500 }, foot: { x: 400, y: 500 }, face: { x: 160, y: 25, w: 480, h: 175 } },
};
const pp100: TestAsset = { kind: "prop", entry: { box: { x: 0, y: 0, w: 100, h: 100 }, foot: { x: 50, y: 100 } } };
const faceless: TestAsset = { kind: "character", entry: { box: { x: 0, y: 0, w: 400, h: 500 }, foot: { x: 200, y: 500 } } };

const registry = registryOf({ "ref-char": refChar, sq500, wide800, pp100, faceless });
registry.assets["bell"] = {
  kind: "sfx",
  renderer: "audio",
  version: 1,
  manifest: { kind: "sfx", file: "bell.mp3", durationMs: 500 },
};
const ctx = { registry, templates: TEMPLATES };

function lineUp(ref: string, at?: { x: number; y: number; scale: number; z: number }) {
  const specs: LayerSpec[] = ["pos-1", "pos-2", "pos-3", "pos-4"].map((slot) => ({ ref, kind: "character", slot }));
  if (at) specs[0] = { ...specs[0]!, at };
  return sceneOf("line-up", specs);
}

function scales(result: ReturnType<typeof layoutScene>): Array<number | undefined> {
  return result.scene.layers.map((layer) => layer.at?.scale);
}

describe("layoutScene", () => {
  it("shrinks in steps of 5 hundredths", () => {
    expect(SHRINK_STEP).toBe(5);
  });

  it("RUN-04.S1 fills at from the slot", () => {
    const result = layoutScene(sceneOf("two-friends", [{ ref: "ref-char", kind: "character", slot: "left" }]), ctx);
    expect(result.issues).toEqual([]);
    // two-friends `left`: foot (520, 1080), height 600, z 50. 600 / 500 = 1.2.
    expect(result.scene.layers[0]?.at).toEqual({ x: 520, y: 1080, scale: 1.2, z: 50 });
  });

  it("RUN-04.S5 shrink resolves line-up with square characters", () => {
    const result = layoutScene(lineUp("sq500"), ctx);
    expect(scales(result)).toEqual([0.816, 0.816, 0.816, 0.816]);
    expect(result.issues).toEqual([]);
    // Feet stay on the slot's ground line.
    expect(result.scene.layers.map((l) => [l.at?.x, l.at?.y])).toEqual([
      [250, 1080],
      [617, 1080],
      [983, 1080],
      [1350, 1080],
    ]);
  });

  it("shrink stops at minScale", () => {
    const result = layoutScene(lineUp("wide800"), ctx);
    expect(scales(result)).toEqual([0.768, 0.768, 0.768, 0.768]);
    expect(codes(result.issues)).toEqual([
      "layout.face-covered",
      "layout.face-covered",
      "layout.face-covered",
      "layout.overlap",
      "layout.overlap",
      "layout.overlap",
    ]);
    expect(result.issues.map((i) => i.path)).toEqual([
      "layers.0",
      "layers.1",
      "layers.2",
      "layers.0",
      "layers.1",
      "layers.2",
    ]);
    expect(result.issues[0]?.message).toContain("pos-1");
    expect(result.issues.slice(3).map((i) => i.message.split(" overlap ")[0])).toEqual([
      "pos-1 and pos-2",
      "pos-2 and pos-3",
      "pos-3 and pos-4",
    ]);
  });

  it("EDT-03.S5 a manual at is kept and never shrunk", () => {
    const at = { x: 250, y: 1080, scale: 0.96, z: 50 };
    const result = layoutScene(lineUp("sq500", at), ctx);
    expect(result.scene.layers[0]?.at).toEqual(at);
    expect(scales(result)).toEqual([0.96, 0.768, 0.816, 0.816]);
    expect(codes(result.issues)).toEqual(["layout.overlap"]);
    expect(result.issues[0]?.path).toBe("layers.0");
    expect(result.issues[0]?.message).toMatch(/^pos-1 and pos-2 overlap \d+\.\d% \(limit 15%\)$/);
  });

  it("a prop that covers a face is shrunk, because it is one of the layers involved", () => {
    // `sq100` has its face at x 750..850, y 500..530 (foot 800, 600; fixed size).
    // The prop (foot 860, 545, z 2) covers (50s - 10) / 100 of the face: 40% at
    // scale 1, 30% at 0.8, where it passes (equal to the limit).
    const sq100: TestAsset = {
      kind: "character",
      entry: { box: { x: 0, y: 0, w: 100, h: 100 }, foot: { x: 50, y: 100 }, face: { x: 0, y: 0, w: 100, h: 30 } },
    };
    const template: LayoutTemplate = {
      id: "front-prop",
      stage: { width: 1600, height: 1200 },
      slots: [
        { id: "hero", accepts: "character", footX: 800, footY: 600, height: 100, minScale: 1, z: 1 },
        { id: "front", accepts: "prop", footX: 860, footY: 545, height: 100, minScale: 0.7, z: 2 },
      ],
    };
    const scene = sceneOf("front-prop", [
      { ref: "sq100", kind: "character", slot: "hero" },
      { ref: "pp100", kind: "prop", slot: "front" },
    ]);
    const result = layoutScene(scene, { registry: registryOf({ sq100, pp100 }), templates: [template] });
    expect(result.issues).toEqual([]);
    expect(scales(result)).toEqual([1, 0.8]);
  });

  it("a layer with a manual at takes part in every check, also when its slot is taken (R59)", () => {
    // Layer 1 has a manual `at` on the same box as pos-1, one z higher.
    const scene = sceneOf("line-up", [
      { ref: "sq500", kind: "character", slot: "pos-1" },
      { ref: "sq500", kind: "character", slot: "pos-1", at: { x: 250, y: 1080, scale: 0.96, z: 51 } },
    ]);
    const result = layoutScene(scene, ctx);
    expect(codes(result.issues)).toEqual(["layout.slot-taken", "layout.face-covered", "layout.overlap"]);
    expect(result.issues.map((i) => i.path)).toEqual(["layers.1", "layers.0", "layers.0"]);
    expect(result.issues[2]?.message).toMatch(/^pos-1 and pos-1 overlap /);
    // The manual `at` is kept; layer 0 is shrunk to its floor.
    expect(result.scene.layers[1]?.at).toEqual({ x: 250, y: 1080, scale: 0.96, z: 51 });
    expect(scales(result)).toEqual([0.768, 0.96]);
  });

  describe("placement errors are issues, not exceptions", () => {
    it("layout.unknown-template", () => {
      const scene = sceneOf("no-such-template", [{ ref: "ref-char", kind: "character", slot: "left" }]);
      const result = layoutScene(scene, ctx);
      expect(result.scene).toEqual(scene);
      expect(result.scene).not.toBe(scene);
      expect(result.issues).toEqual([expect.objectContaining({ path: "templateId", code: "layout.unknown-template" })]);
    });

    it("layout.unknown-slot", () => {
      const result = layoutScene(sceneOf("line-up", [{ ref: "sq500", kind: "character", slot: "pos-9" }]), ctx);
      expect(result.issues).toEqual([expect.objectContaining({ path: "layers.0", code: "layout.unknown-slot" })]);
      expect(result.scene.layers[0]?.at).toBeUndefined();
    });

    it("layout.slot-kind", () => {
      const result = layoutScene(sceneOf("line-up", [{ ref: "pp100", kind: "prop", slot: "pos-1" }]), ctx);
      expect(result.issues).toEqual([expect.objectContaining({ path: "layers.0", code: "layout.slot-kind" })]);
      expect(result.scene.layers[0]?.at).toBeUndefined();
    });

    it("layout.slot-taken", () => {
      const scene = sceneOf("line-up", [
        { ref: "sq500", kind: "character", slot: "pos-1" },
        { ref: "sq500", kind: "character", slot: "pos-1" },
      ]);
      const result = layoutScene(scene, ctx);
      expect(result.issues).toEqual([expect.objectContaining({ path: "layers.1", code: "layout.slot-taken" })]);
      expect(result.scene.layers[0]?.at).toBeDefined();
      expect(result.scene.layers[1]?.at).toBeUndefined();
    });

    it("layout.unknown-asset", () => {
      const scene = sceneOf("line-up", [
        { ref: "missing", kind: "character", slot: "pos-1" },
        { ref: "bell", kind: "character", slot: "pos-2" },
      ]);
      const result = layoutScene(scene, ctx);
      expect(result.issues).toEqual([
        expect.objectContaining({ path: "layers.0", code: "layout.unknown-asset" }),
        expect.objectContaining({ path: "layers.1", code: "layout.unknown-asset" }),
      ]);
      expect(result.scene.layers.map((l) => l.at)).toEqual([undefined, undefined]);
    });

    it("layout.unknown-pose", () => {
      const scene = sceneOf("line-up", [{ ref: "sq500", kind: "character", slot: "pos-1", pose: "no-such-pose" }]);
      const result = layoutScene(scene, ctx);
      expect(result.issues).toEqual([expect.objectContaining({ path: "layers.0", code: "layout.unknown-pose" })]);
      expect(result.scene.layers[0]?.at).toBeUndefined();
    });

    it("layout.face-missing", () => {
      const result = layoutScene(sceneOf("line-up", [{ ref: "faceless", kind: "character", slot: "pos-1" }]), ctx);
      expect(result.issues).toEqual([expect.objectContaining({ path: "layers.0", code: "layout.face-missing" })]);
      // Still placed: 480 / 500 = 0.96.
      expect(result.scene.layers[0]?.at).toEqual({ x: 250, y: 1080, scale: 0.96, z: 50 });
    });
  });

  describe("width fit and centred box (#127)", () => {
    // A wide scenery asset with its foot near the right edge (as fence, log,
    // bush), and a character with its foot left of the box centre.
    const offScenery: TestAsset = { kind: "scenery", entry: { box: { x: 0, y: 0, w: 400, h: 100 }, foot: { x: 350, y: 100 } } };
    const offChar: TestAsset = {
      kind: "character",
      entry: { box: { x: 0, y: 0, w: 400, h: 500 }, foot: { x: 100, y: 500 }, face: { x: 80, y: 25, w: 240, h: 175 } },
    };
    const fit: LayoutTemplate = {
      id: "fit",
      stage: { width: 1600, height: 1200 },
      slots: [
        { id: "wide", accepts: "scenery", footX: 800, footY: 1000, height: 200, width: 300, minScale: 1, z: 10 },
        { id: "tall", accepts: "scenery", footX: 800, footY: 1000, height: 200, minScale: 1, z: 11 },
        { id: "hero", accepts: "character", footX: 800, footY: 1100, height: 500, minScale: 1, z: 50 },
      ],
    };
    const fitCtx = { registry: registryOf({ "off-scenery": offScenery, "off-char": offChar }), templates: [fit] };
    const placeOne = (spec: LayerSpec) => {
      const result = layoutScene(sceneOf("fit", [spec]), fitCtx);
      const layer = result.scene.layers[0]!;
      const entry = spec.ref === "off-char" ? offChar.entry : offScenery.entry;
      return { issues: result.issues, at: layer.at, box: layer.at ? layerBoxes(entry, layer.at, layer.flip).box : undefined };
    };

    it("RUN-04.S7 a layer is centred on its slot and fits the slot's width and height", () => {
      // scale = min(200 / 100, 300 / 400) = 0.75; off = (200 - 350) * 0.75 = -112.5.
      const plain = placeOne({ ref: "off-scenery", kind: "scenery", slot: "wide" });
      expect(plain.issues).toEqual([]);
      expect(plain.at).toEqual({ x: 912.5, y: 1000, scale: 0.75, z: 10 });
      expect(plain.box).toEqual({ x: 650, y: 925, w: 300, h: 75 });
      expect(slotAt(fit.slots[0]!, offScenery.entry, undefined)).toEqual({ x: 912.5, y: 1000, scale: 0.75, z: 10 });

      // With flip the foot point moves to the other side; the box stays.
      const flipped = placeOne({ ref: "off-scenery", kind: "scenery", slot: "wide", flip: true });
      expect(flipped.issues).toEqual([]);
      expect(flipped.at?.x).toBe(687.5);
      expect(flipped.box).toEqual({ x: 650, y: 925, w: 300, h: 75 });

      // A slot without `width`: height only, scale 2; still centred on footX.
      const tall = placeOne({ ref: "off-scenery", kind: "scenery", slot: "tall" });
      expect(tall.issues).toEqual([]);
      expect(tall.at?.scale).toBe(2);
      expect(tall.box).toMatchObject({ x: 400, w: 800 });

      // The anchor applies to characters too: off = (200 - 100) * 1 = 100.
      const hero = placeOne({ ref: "off-char", kind: "character", slot: "hero" });
      const heroFlip = placeOne({ ref: "off-char", kind: "character", slot: "hero", flip: true });
      expect([hero.issues, heroFlip.issues]).toEqual([[], []]);
      expect([hero.at?.x, heroFlip.at?.x]).toEqual([700, 900]);
      expect([hero.box?.x, heroFlip.box?.x]).toEqual([600, 600]);
    });

    it("a layer with a stored at is not placed again, also when its flip changes (#127)", () => {
      const at = { x: 800, y: 1000, scale: 1, z: 10 };
      const stored = placeOne({ ref: "off-scenery", kind: "scenery", slot: "wide", at, flip: true });
      expect(stored.issues).toEqual([]);
      expect(stored.at).toEqual(at);
      // Mirrored around the foot point at at.x: unflipped x 450..850, flipped 750..1150.
      expect(stored.box).toEqual({ x: 750, y: 900, w: 400, h: 100 });
      expect(layerBoxes(offScenery.entry, at, false).box).toEqual({ x: 450, y: 900, w: 400, h: 100 });
    });

    it("scenery can cover the face of a character with a stored low z (#127)", () => {
      const cover: LayoutTemplate = {
        id: "cover",
        stage: { width: 1600, height: 1200 },
        slots: [
          { id: "hero", accepts: "character", footX: 800, footY: 1000, height: 500, minScale: 1, z: 50 },
          { id: "back", accepts: "scenery", footX: 800, footY: 700, height: 200, width: 300, minScale: 1, z: 10 },
        ],
      };
      const coverCtx = { registry: registryOf({ "ref-char": refChar, "off-scenery": offScenery }), templates: [cover] };
      const back: LayerSpec = { ref: "off-scenery", kind: "scenery", slot: "back" };
      // Face x 680..920, y 525..700; scenery box x 650..950, y 625..700: 42.9% covered.
      const low = layoutScene(
        sceneOf("cover", [{ ref: "ref-char", kind: "character", slot: "hero", at: { x: 800, y: 1000, scale: 1, z: 3 } }, back]),
        coverCtx,
      );
      expect(codes(low.issues)).toEqual(["layout.face-covered"]);
      expect(low.issues[0]?.path).toBe("layers.0");
      const placed = layoutScene(sceneOf("cover", [{ ref: "ref-char", kind: "character", slot: "hero" }, back]), coverCtx);
      expect(placed.issues).toEqual([]);
    });
  });

  it("input is not mutated and output is deterministic", () => {
    const scene = lineUp("wide800", { x: 250, y: 1080, scale: 0.9, z: 50 });
    const before = structuredClone(scene);
    const first = layoutScene(scene, ctx);
    const second = layoutScene(scene, ctx);
    expect(scene).toEqual(before);
    expect(first).toEqual(second);
    expect(first.scene).not.toBe(scene);
  });
});
