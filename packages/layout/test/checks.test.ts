import { describe, expect, it } from "vitest";
import { CHECK_LIMITS, layerBoxes, layoutScene } from "../src/index";
import { codes, type LayerSpec, registryOf, sceneOf, type TestAsset, testTemplate } from "./helpers";

// Shared test assets of the refinement.
const sq100: TestAsset = {
  kind: "character",
  entry: { box: { x: 0, y: 0, w: 100, h: 100 }, foot: { x: 50, y: 100 }, face: { x: 0, y: 0, w: 100, h: 30 } },
};
const pp100: TestAsset = { kind: "prop", entry: { box: { x: 0, y: 0, w: 100, h: 100 }, foot: { x: 50, y: 100 } } };

const registry = registryOf({ sq100, pp100 });

type Placed = { ref: "sq100" | "pp100"; x: number; y: number; z: number };

// One slot per layer, at the layer's foot point. Scale is 1 and no shrink happens.
function run(placed: Placed[]) {
  const template = testTemplate(
    placed.map((p, i) => ({
      id: `s${i}`,
      accepts: p.ref === "sq100" ? "character" : "prop",
      footX: p.x,
      footY: p.y,
      z: p.z,
    })),
  );
  const specs: LayerSpec[] = placed.map((p, i) => ({
    ref: p.ref,
    kind: p.ref === "sq100" ? "character" : "prop",
    slot: `s${i}`,
  }));
  return layoutScene(sceneOf("test", specs), { registry, templates: [template] });
}

describe("checks", () => {
  it("uses the limits of the refinement", () => {
    expect(CHECK_LIMITS).toEqual({ faceCovered: 0.3, overlap: 0.15, bounds: 0.1 });
  });

  it("face-outside: face on the top edge passes", () => {
    expect(run([{ ref: "sq100", x: 800, y: 100, z: 1 }]).issues).toEqual([]);
  });

  it("face-outside: one unit above fails", () => {
    expect(codes(run([{ ref: "sq100", x: 800, y: 99, z: 1 }]).issues)).toEqual(["layout.face-outside"]);
  });

  it("RUN-04.S2 face-covered: 30% passes, 33% fails", () => {
    const pass = run([
      { ref: "sq100", x: 800, y: 600, z: 1 },
      { ref: "pp100", x: 800, y: 509, z: 2 },
    ]);
    expect(pass.issues).toEqual([]);
    const fail = run([
      { ref: "sq100", x: 800, y: 600, z: 1 },
      { ref: "pp100", x: 800, y: 510, z: 2 },
    ]);
    expect(codes(fail.issues)).toEqual(["layout.face-covered"]);
    expect(fail.issues[0]?.path).toBe("layers.0");
  });

  it("face-covered: a lower z never covers", () => {
    const result = run([
      { ref: "sq100", x: 800, y: 600, z: 1 },
      { ref: "pp100", x: 800, y: 600, z: 0 },
    ]);
    expect(result.issues).toEqual([]);
  });

  it("face-covered: two covers count once", () => {
    const result = run([
      { ref: "sq100", x: 800, y: 600, z: 1 },
      { ref: "pp100", x: 800, y: 509, z: 2 },
      { ref: "pp100", x: 800, y: 509, z: 3 },
    ]);
    expect(result.issues).toEqual([]);
  });

  it("RUN-04.S3 overlap: 15% passes, 16% fails", () => {
    const pass = run([
      { ref: "sq100", x: 500, y: 600, z: 1 },
      { ref: "sq100", x: 585, y: 600, z: 2 },
    ]);
    expect(pass.issues).toEqual([]);
    const fail = run([
      { ref: "sq100", x: 500, y: 600, z: 1 },
      { ref: "sq100", x: 584, y: 600, z: 2 },
    ]);
    expect(codes(fail.issues)).toEqual(["layout.overlap"]);
    expect(fail.issues[0]?.path).toBe("layers.0");
  });

  it("overlap: a prop over a character is not an overlap", () => {
    // The prop (z 2) covers the lower half of the character box (50%), but not
    // its face (y 500 to 530), so no face check fails either.
    const result = run([
      { ref: "sq100", x: 500, y: 600, z: 1 },
      { ref: "pp100", x: 500, y: 650, z: 2 },
    ]);
    expect(result.issues).toEqual([]);
  });

  it("RUN-04.S4 bounds: 10% outside passes, 11% fails", () => {
    expect(run([{ ref: "pp100", x: 40, y: 600, z: 1 }]).issues).toEqual([]);
    const fail = run([{ ref: "pp100", x: 39, y: 600, z: 1 }]);
    expect(codes(fail.issues)).toEqual(["layout.bounds"]);
    expect(fail.issues[0]?.path).toBe("layers.0");
  });

  it("flip mirrors the box around the foot point", () => {
    const entry = { id: "default", file: "default.svg", box: { x: 0, y: 0, w: 100, h: 100 }, foot: { x: 20, y: 100 } };
    const at = { x: 500, y: 600, scale: 1, z: 1 };
    expect(layerBoxes(entry, at, false).box).toEqual({ x: 480, y: 500, w: 100, h: 100 });
    expect(layerBoxes(entry, at, true).box).toEqual({ x: 420, y: 500, w: 100, h: 100 });
  });
});
