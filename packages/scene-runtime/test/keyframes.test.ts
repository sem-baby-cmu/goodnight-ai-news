import { PRIMITIVES, type PrimitiveId } from "@storybook/dsl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keyframesFor } from "../src/keyframes";

// Expected values come from #14, Exact change 1 (stage height 1200).
const E = "cubic-bezier(0.2, 0.8, 0.2, 1)";

afterEach(() => {
  vi.restoreAllMocks();
});

function offsets(keyframes: Keyframe[] | PropertyIndexedKeyframes): number[] {
  if (Array.isArray(keyframes)) return keyframes.map((k) => k.offset as number);
  return keyframes.offset as number[];
}

describe("keyframesFor", () => {
  it("float loop: amplitude 0.01 period 4", () => {
    const out = keyframesFor("float", { amplitude: 0.01, period: 4 }, "loop");
    expect(out.element).toBe("loop");
    expect(out.keyframes).toEqual({ translate: ["0px 0px", "0px -12px", "0px 0px"] });
    expect(out.options).toEqual({ duration: 4000, easing: "ease-in-out", iterations: Infinity });
  });

  it("sway loop: angle 5", () => {
    const out = keyframesFor("sway", { angle: 5, period: 4 }, "loop");
    expect(out.element).toBe("loop");
    expect(out.keyframes).toEqual({ rotate: ["0deg", "5deg", "0deg", "-5deg", "0deg"] });
    expect(out.options).toEqual({ duration: 4000, easing: "ease-in-out", iterations: Infinity });
  });

  it("bounce: height 0.05 count 2", () => {
    const out = keyframesFor("bounce", { height: 0.05, count: 2 }, "once");
    expect(out.element).toBe("once");
    expect(out.keyframes).toEqual({ translate: ["0px 0px", "0px -60px", "0px 0px"], offset: [0, 0.4, 1] });
    expect(out.options).toEqual({ duration: 700, easing: E, iterations: 2 });
  });

  it("pop: scale 1.2", () => {
    const out = keyframesFor("pop", { scale: 1.2 }, "once");
    expect(out.element).toBe("once");
    expect(out.keyframes).toEqual({ scale: ["1", "1.2", "1"], offset: [0, 0.4, 1] });
    expect(out.options).toEqual({ duration: 700, easing: E, iterations: 1 });
  });

  it("fade-in: delay 1.5", () => {
    const out = keyframesFor("fade-in", { delay: 1.5 }, "once");
    expect(out.element).toBe("once");
    expect(out.keyframes).toEqual({ opacity: ["0", "1"] });
    expect(out.options).toEqual({ duration: 600, delay: 1500, easing: "ease-out", fill: "backwards", iterations: 1 });
  });

  it("blink loop: interval 4", () => {
    const out = keyframesFor("blink", { interval: 4 }, "loop");
    expect(out.element).toBe("part-eyes");
    expect(out.options).toEqual({ duration: 4000, iterations: Infinity });
    const got = offsets(out.keyframes);
    const want = [0, 0.96, 0.98, 1];
    expect(got).toHaveLength(want.length);
    want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 10));
    // Review item 8: `scale` on the Y axis, not `transform`.
    expect((out.keyframes as Keyframe[]).map((k) => k.scale)).toEqual(["1 1", "1 1", "1 0.1", "1 1"]);
  });

  it("blink once", () => {
    const out = keyframesFor("blink", { interval: 4 }, "once");
    expect(out.element).toBe("part-eyes");
    expect(out.keyframes).toEqual([{ scale: "1 1" }, { scale: "1 0.1" }, { scale: "1 1" }]);
    expect(out.options).toEqual({ duration: 160, iterations: 1 });
  });

  it("wave: count 3", () => {
    const out = keyframesFor("wave", { count: 3 }, "once");
    expect(out.element).toBe("part-arm-right");
    // Review item 8: `rotate`, not `transform`.
    expect(out.keyframes).toEqual([
      { rotate: "0deg" },
      { rotate: "-20deg" },
      { rotate: "10deg" },
      { rotate: "-20deg" },
      { rotate: "0deg" },
    ]);
    expect(out.options).toEqual({ duration: 900, easing: "ease-in-out", iterations: 3 });
  });

  it("loop on pop runs once and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = keyframesFor("pop", { scale: 1.2 }, "loop");
    expect(out.element).toBe("once");
    expect(out.options.iterations).toBe(1);
    expect(warn).toHaveBeenCalled();
  });

  it("every PRIMITIVES name has a keyframes mapping", () => {
    const elements = ["loop", "once", "part-eyes", "part-arm-right"];
    for (const name of Object.keys(PRIMITIVES) as PrimitiveId[]) {
      const out = keyframesFor(name, {}, "once");
      expect(elements, name).toContain(out.element);
      expect(out.keyframes, name).toBeTruthy();
      expect(out.options.duration, name).toBeGreaterThan(0);
    }
  });

  // Review item 8: design section 5 and invariant 3. A `transform` keyframe
  // would overwrite an authored `transform` attribute on a part.
  it("keyframes use only translate, rotate, scale and opacity in both modes", () => {
    const allowed = ["translate", "rotate", "scale", "opacity"];
    const timing = ["offset", "easing", "composite"];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const name of Object.keys(PRIMITIVES) as PrimitiveId[]) {
      for (const mode of ["loop", "once"] as const) {
        const { keyframes } = keyframesFor(name, {}, mode);
        const frames = Array.isArray(keyframes) ? keyframes : [keyframes];
        const props = new Set(frames.flatMap((f) => Object.keys(f)).filter((k) => !timing.includes(k)));
        for (const p of props) expect(allowed, `${name} ${mode}: ${p}`).toContain(p);
      }
    }
  });

  // Extra: `play_animation` has no params, so missing params use the
  // defaults of `@storybook/dsl` (implementation decision R3).
  it("missing params use PRIMITIVES defaults", () => {
    // float default amplitude 0.007 -> 8.4 px; period 4 s.
    const float = keyframesFor("float", {}, "once");
    expect(float.element).toBe("once");
    expect(float.keyframes).toEqual({ translate: ["0px 0px", "0px -8.4px", "0px 0px"] });
    expect(float.options).toEqual({ duration: 4000, easing: "ease-in-out", iterations: 1 });
    // wave default count 2.
    expect(keyframesFor("wave", {}, "once").options.iterations).toBe(PRIMITIVES.wave.defaults.count);
  });
});
