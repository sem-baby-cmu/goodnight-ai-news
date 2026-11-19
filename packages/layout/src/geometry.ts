import type { PoseEntry, Rect } from "@storybook/dsl";

// A rectangle in stage units (1600 × 1200), origin at the top left.
export type StageRect = { x: number; y: number; w: number; h: number };

type At = { x: number; y: number; scale: number };

// The stage boxes of a layer. `at` is the stage position of the pose's foot
// point. A flipped layer is mirrored around the foot point.
export function layerBoxes(
  entry: Pick<PoseEntry, "foot" | "box" | "face">,
  at: At,
  flip: boolean | undefined,
): { box: StageRect; face?: StageRect } {
  const s = at.scale;
  const { foot } = entry;
  const place = (r: Rect): StageRect => ({
    x: flip === true ? at.x - (r.x + r.w - foot.x) * s : at.x + (r.x - foot.x) * s,
    y: at.y + (r.y - foot.y) * s,
    w: r.w * s,
    h: r.h * s,
  });
  const box = place(entry.box);
  return entry.face ? { box, face: place(entry.face) } : { box };
}

// Width or height is zero or negative when the rectangles do not overlap.
export function intersect(a: StageRect, b: StageRect): StageRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
}

export function area(r: StageRect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

// The area of the union of `rects`, clipped to `clip`. Coordinate compression:
// a grid cell counts once when its centre is inside at least one rect.
export function unionArea(clip: StageRect, rects: StageRect[]): number {
  const parts = rects.map((r) => intersect(r, clip)).filter((r) => area(r) > 0);
  if (parts.length === 0) return 0;
  const edges = (pick: (r: StageRect) => [number, number]) =>
    [...new Set(parts.flatMap(pick))].sort((a, b) => a - b);
  const xs = edges((r) => [r.x, r.x + r.w]);
  const ys = edges((r) => [r.y, r.y + r.h]);
  let total = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const cx = (xs[i]! + xs[i + 1]!) / 2;
    for (let j = 0; j + 1 < ys.length; j++) {
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      if (parts.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) {
        total += (xs[i + 1]! - xs[i]!) * (ys[j + 1]! - ys[j]!);
      }
    }
  }
  return total;
}
