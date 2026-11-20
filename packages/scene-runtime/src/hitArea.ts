import { intersect, type StageRect } from "@storybook/layout";
import { STAGE_H, STAGE_W } from "./keyframes";

// CSS px values of ADR 0017 decision 10 and DESIGN.md 12.3 / 14, turned into
// stage units in one place (#68 invariant 13).
export const HIT_MIN_PX = 64;
// Two rings: 3 px gap, 3 px Ink, 3 px Sun yellow: 9 px past the box.
export const RING_GAP_PX = 3;
export const RING_WIDTH_PX = 3;
export const STAGE_RECT: StageRect = { x: 0, y: 0, w: STAGE_W, h: STAGE_H };

// The layout box cut at the stage edge; null when nothing of it is on stage.
export function drawnBox(box: StageRect): StageRect | null {
  const d = intersect(box, STAGE_RECT);
  return d.w > 0 && d.h > 0 ? d : null;
}

// On an axis where the drawn box is under 64 CSS px, the hit area is 64 CSS
// px centred on it; then it is cut at the stage edge, never moved.
export function hitArea(box: StageRect, k: number): StageRect | null {
  const d = drawnBox(box);
  if (!(k > 0) || !d) return null;
  const m = HIT_MIN_PX / k;
  const grow = (start: number, size: number): [number, number] =>
    size < m ? [start + size / 2 - m / 2, m] : [start, size];
  const [x, w] = grow(d.x, d.w);
  const [y, h] = grow(d.y, d.h);
  return intersect({ x, y, w, h }, STAGE_RECT);
}

// The outer edge of the focus ring: the drawn box grown by 9 CSS px, cut at
// the stage edge (the ring lies on the edge, inside it).
export function focusRingRect(box: StageRect, k: number): StageRect | null {
  const d = drawnBox(box);
  if (!(k > 0) || !d) return null;
  const g = (RING_GAP_PX + 2 * RING_WIDTH_PX) / k;
  return intersect({ x: d.x - g, y: d.y - g, w: d.w + 2 * g, h: d.h + 2 * g }, STAGE_RECT);
}
