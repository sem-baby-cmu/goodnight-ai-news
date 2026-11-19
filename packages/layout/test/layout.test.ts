import { describe, expect, it } from "vitest";
import { layoutScene, SHRINK_STEP, TEMPLATES } from "../src/index";
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
