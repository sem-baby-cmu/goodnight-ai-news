import { describe, expect, it } from "vitest";
import { ACTIONS, PRIMITIVES, SKY_PALETTES } from "./primitives";

const n = (min: number, max: number) => ({ min, max, integer: false });
const i = (min: number, max: number) => ({ min, max, integer: true });

describe("primitives", () => {
  it("PRIMITIVES bounds match design 5", () => {
    expect(PRIMITIVES).toEqual({
      float: { renderers: "all", params: { amplitude: n(0.005, 0.03), period: n(2, 6) }, defaults: { amplitude: 0.007, period: 4 } },
      sway: { renderers: "all", params: { angle: n(1, 8), period: n(2, 6) }, defaults: { angle: 3, period: 4 } },
      bounce: { renderers: "all", params: { height: n(0.01, 0.05), count: i(1, 3) }, defaults: { height: 0.03, count: 1 } },
      pop: { renderers: "all", params: { scale: n(1.05, 1.25) }, defaults: { scale: 1.15 } },
      "fade-in": { renderers: "all", params: { delay: n(0, 3) }, defaults: { delay: 0 } },
      blink: { renderers: ["svg-rig"], params: { interval: n(2, 6) }, defaults: { interval: 4 } },
      wave: { renderers: ["svg-rig"], params: { count: i(1, 3) }, defaults: { count: 2 } },
    });
  });

  it("PRIMITIVES defaults are inside their bounds", () => {
    for (const [id, p] of Object.entries(PRIMITIVES)) {
      const params = p.params as Record<string, { min: number; max: number; integer: boolean }>;
      const defaults = p.defaults as Record<string, number>;
      expect(Object.keys(defaults).sort(), id).toEqual(Object.keys(params).sort());
      for (const [key, b] of Object.entries(params)) {
        const v = defaults[key]!;
        expect(v, `${id}.${key}`).toBeGreaterThanOrEqual(b.min);
        expect(v, `${id}.${key}`).toBeLessThanOrEqual(b.max);
        if (b.integer) expect(Number.isInteger(v), `${id}.${key}`).toBe(true);
      }
    }
  });

  it("ACTIONS match the design action table", () => {
    const visual = ["character", "prop", "scenery"];
    expect(ACTIONS).toEqual({
      play_animation: { targetKinds: visual },
      play_sfx: { targetKinds: [] },
      show_bubble: { targetKinds: visual, maxTextLength: 60 },
      set_expression: { targetKinds: ["character"] },
      set_pose: { targetKinds: ["character"] },
    });
  });

  it("SKY_PALETTES lists the four palettes", () => {
    expect(SKY_PALETTES).toEqual(["day", "cloudy", "dusk", "night"]);
  });
});
