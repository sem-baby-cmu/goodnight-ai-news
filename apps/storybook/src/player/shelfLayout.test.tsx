import { expect, it } from "vitest";
import type { LayoutName } from "./layout";
import { shelfLayout } from "./shelfLayout";

// Rows of DESIGN.md 12.1, with the boxes of the approved shelf mock (#77,
// planner comment "Mock approved", table "shelfLayout(w, h) values").
// [w, h, layout, boards, per board, book w, book h, window w, window h,
//  shelf w, shelf h, shelf x, shelf y, previous x, previous y, next x, next y]
type Row = [
  number, number, LayoutName, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];
const ROWS: Row[] = [
  [1194, 834, "wide", 2, 3, 180, 224, 151, 148, 660, 532, 267, 175, 16, 409, 1114, 409],
  [900, 600, "wide", 2, 3, 175, 218, 146.81, 142.61, 645, 520, 127.5, 64, 16, 292, 820, 292],
  [390, 844, "narrow", 2, 2, 163, 203, 136.74, 129.08, 390, 490, 0, 159, 16, 768, 310, 768],
  [375, 553, "narrow", 1, 2, 155, 193, 130.03, 120.06, 374, 249, 0.5, 134, 16, 477, 295, 477],
  [320, 480, "narrow", 1, 2, 128, 159, 107.38, 89.36, 320, 215, 0, 114.5, 16, 404, 240, 404],
  [667, 375, "short", 1, 3, 139, 173, 116.61, 102.01, 489, 229, 89, 97, 12, 299, 591, 299],
  [568, 320, "short", 1, 2, 147, 183, 123.32, 111.03, 354, 239, 107, 64.5, 12, 244, 492, 244],
];

const near = (actual: number, expected: number, name: string) =>
  expect(Math.abs(actual - expected), `${name} ${actual}`).toBeLessThanOrEqual(1);

it("shelf sizes match the rows of DESIGN.md 12.1", () => {
  for (const [w, h, layout, boards, perBoard, bw, bh, ww, wh, sw, sh, sx, sy, px, py, nx, ny] of ROWS) {
    const name = `${w} x ${h}`;
    const s = shelfLayout(w, h);
    expect(s.layout, `${name} layout`).toBe(layout);
    expect(s.boards, `${name} boards`).toBe(boards);
    expect(s.perBoard, `${name} perBoard`).toBe(perBoard);
    expect(s.perPage, `${name} perPage`).toBe(boards * perBoard);
    expect(s.slots, `${name} slots`).toHaveLength(boards * perBoard);
    expect(s.fits, `${name} fits`).toBe(true);
    near(s.book.w, bw, `${name} book w`);
    near(s.book.h, bh, `${name} book h`);
    near(s.window.w, ww, `${name} window w`);
    near(s.window.h, wh, `${name} window h`);
    near(s.shelf.w, sw, `${name} shelf w`);
    near(s.shelf.h, sh, `${name} shelf h`);
    near(s.shelf.x, sx, `${name} shelf x`);
    near(s.shelf.y, sy, `${name} shelf y`);
    near(s.previous.x, px, `${name} previous x`);
    near(s.previous.y, py, `${name} previous y`);
    near(s.next.x, nx, `${name} next x`);
    near(s.next.y, ny, `${name} next y`);
  }
});

it("the window of a 180 px book is 151 x 148", () => {
  const s = shelfLayout(1194, 834);
  expect(s.book).toEqual({ w: 180, h: 224 });
  expect(s.window.w).toBeCloseTo(151, 5);
  expect(s.window.h).toBeCloseTo(148, 5);
});

it("a Narrow board under 320 px wide holds 1 book", () => {
  const s = shelfLayout(319, 480);
  expect(s.layout).toBe("narrow");
  expect(s.boards).toBe(1);
  expect(s.perBoard).toBe(1);
  expect(s.perPage).toBe(1);
  expect(s.fits).toBe(true);
});

it("240 x 200 cannot hold one book", () => {
  const s = shelfLayout(240, 200);
  expect(s.fits).toBe(false);
  // The shelf still draws at the smallest book width (Exact changes 3).
  expect(s.book.w).toBe(128);
});
