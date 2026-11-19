import { area, intersect, type StageRect, unionArea } from "./geometry";

// Limits of design "4. Layout engine". A ratio equal to its limit passes.
export const CHECK_LIMITS = { faceCovered: 0.3, overlap: 0.15, bounds: 0.1 } as const;

const EPSILON = 1e-9;
const STAGE: StageRect = { x: 0, y: 0, w: 1600, h: 1200 };

// A placed layer: `index` is its index in `scene.layers`. `face` is set only
// on characters whose pose entry has a face box.
export type PlacedLayer = {
  index: number;
  kind: "character" | "prop" | "scenery";
  z: number;
  box: StageRect;
  face?: StageRect;
};

export type FailureCode = "layout.face-outside" | "layout.face-covered" | "layout.overlap" | "layout.bounds";

// `layers` are indexes into `scene.layers`.
export type Failure = { code: FailureCode; layers: number[]; ratio?: number };

const fails = (ratio: number, limit: number) => ratio > limit + EPSILON;

// Runs the checks in a fixed order: face outside, face covered, overlap, bounds.
// Within a check, results are in layer order (pairs by (i, j) with i < j).
export function runChecks(placed: PlacedLayer[]): Failure[] {
  const layers = [...placed].sort((a, b) => a.index - b.index);
  const faced = layers.filter((l): l is PlacedLayer & { face: StageRect } => l.kind === "character" && !!l.face);
  const characters = layers.filter((l) => l.kind === "character");
  const failures: Failure[] = [];

  for (const c of faced) {
    const f = c.face;
    if (f.x < -EPSILON || f.y < -EPSILON || f.x + f.w > STAGE.w + EPSILON || f.y + f.h > STAGE.h + EPSILON) {
      failures.push({ code: "layout.face-outside", layers: [c.index] });
    }
  }

  for (const c of faced) {
    const covers = layers.filter((l) => l.z > c.z && area(intersect(l.box, c.face)) > 0);
    if (covers.length === 0) continue;
    const ratio = unionArea(c.face, covers.map((l) => l.box)) / area(c.face);
    if (fails(ratio, CHECK_LIMITS.faceCovered)) {
      failures.push({ code: "layout.face-covered", layers: [c.index, ...covers.map((l) => l.index)], ratio });
    }
  }

  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const a = characters[i]!;
      const b = characters[j]!;
      const ratio = area(intersect(a.box, b.box)) / Math.min(area(a.box), area(b.box));
      if (fails(ratio, CHECK_LIMITS.overlap)) {
        failures.push({ code: "layout.overlap", layers: [a.index, b.index], ratio });
      }
    }
  }

  for (const l of layers) {
    const ratio = 1 - area(intersect(l.box, STAGE)) / area(l.box);
    if (fails(ratio, CHECK_LIMITS.bounds)) failures.push({ code: "layout.bounds", layers: [l.index], ratio });
  }

  return failures;
}
