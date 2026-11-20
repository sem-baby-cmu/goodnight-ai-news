import { describe, expect, it } from "vitest";
// Imported from the package entry (#68 Exact changes 3), so a missing export
// fails the test that uses it, not the whole file.
import { focusRingRect, hitArea } from "../src";
import { drawnBox } from "../src/hitArea";

// Expected values come from #68 "Implementation refinement" (Exact changes 12,
// Acceptance) and ADR 0017 decision 10: 64 CSS px hit area, rings of 3 + 3 + 3
// CSS px, both cut at the stage edge and never moved. k = 0.5 here.

describe("hitArea", () => {
  it("PLY-01.S9 a hit area at the stage edge is cut, not moved", () => {
    // 30 x 30 CSS px at the left edge: 47 x 64 CSS px, from the edge.
    const area = hitArea({ x: 0, y: 500, w: 60, h: 60 }, 0.5);
    expect(area).toEqual({ x: 0, y: 466, w: 94, h: 128 });
    expect((area?.w ?? 0) * 0.5).toBe(47);
    expect((area?.h ?? 0) * 0.5).toBe(64);
  });

  it("PLY-01.S12 a box that is wider than the stage is cut at the stage edge", () => {
    const box = { x: -50, y: 400, w: 1700, h: 400 };
    expect(drawnBox(box)).toEqual({ x: 0, y: 400, w: 1600, h: 400 });
    expect(hitArea(box, 0.5)).toEqual({ x: 0, y: 400, w: 1600, h: 400 });
  });

  it("hitArea grows a small box to 64 CSS px, centred", () => {
    expect(hitArea({ x: 700, y: 500, w: 60, h: 80 }, 0.5)).toEqual({ x: 666, y: 476, w: 128, h: 128 });
    expect(hitArea({ x: 700, y: 500, w: 200, h: 200 }, 0.5)).toEqual({ x: 700, y: 500, w: 200, h: 200 });
    expect(hitArea({ x: 700, y: 500, w: 60, h: 80 }, 0)).toBeNull();
    expect(hitArea({ x: 1700, y: 500, w: 60, h: 80 }, 0.5)).toBeNull();
  });
});

describe("focusRingRect", () => {
  it("focusRingRect", () => {
    // 9 CSS px = 18 units on each side.
    expect(focusRingRect({ x: 700, y: 500, w: 100, h: 100 }, 0.5)).toEqual({ x: 682, y: 482, w: 136, h: 136 });
    const edge = focusRingRect({ x: 0, y: 500, w: 100, h: 100 }, 0.5);
    expect(edge?.x).toBe(0);
    expect(edge?.w).toBe(118);
    expect(focusRingRect({ x: 700, y: 500, w: 100, h: 100 }, 0)).toBeNull();
  });
});
