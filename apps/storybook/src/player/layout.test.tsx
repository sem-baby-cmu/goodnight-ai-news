import { expect, it } from "vitest";
import { layoutFor, NARRATION, panelHeight, pictureArea, type LayoutName } from "./layout";
import { REFERENCE_TEXT } from "./measure";

it("layoutFor follows the order of DESIGN.md 12.3", () => {
  const rows: [number, number, LayoutName][] = [
    [900, 600, "wide"],
    [899, 600, "narrow"],
    [640, 599, "short"],
    [568, 320, "short"],
    [900, 364, "short"],
    [390, 844, "narrow"],
  ];
  for (const [w, h, name] of rows) expect(layoutFor(w, h), `${w} x ${h}`).toBe(name);
});

it("panel and picture sizes match the arithmetic rows of DESIGN.md 12.3", () => {
  // [w, h, layout, lines, panel, picture w, picture h], DESIGN.md at c1fbff3.
  const rows: [number, number, LayoutName, number, number, number, number][] = [
    [1194, 834, "wide", 5, 255, 1002, 579],
    [900, 600, "wide", 5, 255, 708, 345],
    [390, 844, "narrow", 8, 299, 390, 377],
    [568, 320, "short", 6, 187, 392, 133],
    [844, 600, "narrow", 4, 197, 844, 235],
  ];
  for (const [w, h, layout, lines, panel, pw, ph] of rows) {
    const name = `${w} x ${h}`;
    expect(layoutFor(w, h), name).toBe(layout);
    const height = panelHeight(layout, w, lines, NARRATION[layout]);
    expect(Math.abs(height - panel), `${name} panel ${height}`).toBeLessThanOrEqual(1);
    const picture = pictureArea(layout, w, h, height);
    expect(Math.abs(picture.w - pw), `${name} picture w ${picture.w}`).toBeLessThanOrEqual(1);
    expect(Math.abs(picture.h - ph), `${name} picture h ${picture.h}`).toBeLessThanOrEqual(1);
  }
});

it("the reference text has 40 words and 240 characters", () => {
  expect(REFERENCE_TEXT.split(" ")).toHaveLength(40);
  expect(REFERENCE_TEXT).toHaveLength(240);
});
