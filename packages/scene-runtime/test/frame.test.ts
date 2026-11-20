import { describe, expect, it } from "vitest";
// Imported from the package entry (`src/index.ts`, #68 Exact changes 3), so a
// missing export fails the test that uses it, not the whole file.
import { BLEED, FRAME_H, FRAME_W, fitFrame, resolveBackdrop, SKY_COLORS } from "../src";
import type { AssetResolver } from "../src/types";
import { makeResolver } from "./fixtures";

// Expected values come from #68 "Implementation refinement" (invariant 3,
// Exact changes 1 and 3, Acceptance) and design "5. Scene runtime", "Fit".

describe("src/index.ts", () => {
  it("exports the frame constants, fitFrame, resolveBackdrop and SKY_COLORS", () => {
    expect(typeof fitFrame).toBe("function");
    expect(typeof resolveBackdrop).toBe("function");
    expect(FRAME_W).toBe(2400);
    expect(FRAME_H).toBe(1200);
    expect(BLEED).toBe(400);
    expect(SKY_COLORS).toEqual({ day: "#7EBDE6", cloudy: "#E3ECF6", dusk: "#F3ECDD", night: "#1B2440" });
  });
});

describe("fitFrame", () => {
  it("fitFrame contain gives the DESIGN.md picture-area sizes", () => {
    const a = fitFrame(1002, 578);
    expect(a.k * 1600).toBeCloseTo(770.7, 1);
    expect(a.y).toBeCloseTo(0, 6);
    expect(a.x).toBeCloseTo(-77.0, 1);

    const b = fitFrame(832, 394);
    expect(b.k * 1600).toBeCloseTo(525.3, 1);
    expect(b.k * 2400).toBeCloseTo(788.0, 1);
    expect(b.x).toBeCloseTo(22.0, 1);

    const c = fitFrame(390, 377);
    expect(c.k * 1600).toBeCloseTo(390, 6);
    expect(c.x).toBeCloseTo(-97.5, 6);
    expect(c.y).toBeCloseTo(42.25, 6);

    const d = fitFrame(800, 600);
    expect(d.x).toBeCloseTo(-200, 6);
    expect(d.y).toBeCloseTo(0, 6);

    expect(fitFrame(0, 0)).toEqual({ k: 0, x: 0, y: 0 });
  });

  it("fitFrame cover fills the box", () => {
    const shelf = fitFrame(151, 148, "cover");
    expect(shelf.k).toBeCloseTo(148 / 1200, 4);
    expect(Math.round(800 - 151 / (2 * shelf.k))).toBe(188);
    expect(Math.round(800 + 151 / (2 * shelf.k))).toBe(1412);
    expect(shelf.y).toBeCloseTo(0, 6);

    const stage = fitFrame(1600, 1200, "cover");
    expect(stage.k).toBeCloseTo(1, 6);
    expect(stage.x).toBeCloseTo(-400, 6);
    expect(stage.y).toBeCloseTo(0, 6);

    expect(fitFrame(2400, 1200, "cover")).toEqual({ k: 1, x: 0, y: 0 });

    const wide = fitFrame(3000, 1200, "cover");
    expect(wide.k).toBeCloseTo(1.25, 6);
    expect(wide.x).toBeCloseTo(0, 6);
    expect(wide.y).toBeCloseTo(-150, 6);

    expect(fitFrame(0, 0, "cover")).toEqual({ k: 0, x: 0, y: 0 });
  });

  // Exact changes 1: negative or non-finite input is treated as 0.
  it("fitFrame treats a negative or non-finite size as 0", () => {
    expect(fitFrame(-5, 600)).toEqual({ k: 0, x: 0, y: 300 });
    expect(fitFrame(Number.NaN, 600)).toEqual({ k: 0, x: 0, y: 300 });
    expect(fitFrame(800, Number.POSITIVE_INFINITY, "cover")).toEqual({ k: 0, x: 400, y: 0 });
  });
});

describe("resolveBackdrop", () => {
  it("resolveBackdrop", () => {
    const { resolver } = makeResolver();
    expect(resolveBackdrop(resolver, { backdrop: "meadow", sky: "night" })).toEqual({
      ok: true,
      renderer: "svg",
      file: "night.svg",
      url: "https://cdn.test/meadow/night.svg",
    });
    expect(resolveBackdrop(resolver, { backdrop: "pond", sky: "night" })).toEqual({
      ok: true,
      renderer: "webp",
      file: "night.webp",
      url: "https://cdn.test/pond/night.webp",
    });
    expect(resolveBackdrop(resolver, { backdrop: "pond", sky: "dusk" })).toEqual({
      ok: false,
      reason: 'backdrop "pond" has no variant for sky "dusk"',
    });
    expect(resolveBackdrop(resolver, { backdrop: "ghost", sky: "night" })).toEqual({
      ok: false,
      reason: 'backdrop "ghost" is not in the assets',
    });
    expect(resolveBackdrop(resolver, { backdrop: "tree", sky: "night" })).toEqual({
      ok: false,
      reason: 'asset "tree" is not a backdrop',
    });
  });

  it("resolveBackdrop refuses a renderer that is not svg or webp", () => {
    const { resolver } = makeResolver();
    const rig: AssetResolver = {
      ...resolver,
      get: (ref) => {
        const asset = resolver.get(ref);
        return asset && { ...asset, renderer: "svg-rig" };
      },
    };
    expect(resolveBackdrop(rig, { backdrop: "meadow", sky: "night" })).toEqual({
      ok: false,
      reason: 'backdrop "meadow" has renderer "svg-rig"',
    });
  });
});
