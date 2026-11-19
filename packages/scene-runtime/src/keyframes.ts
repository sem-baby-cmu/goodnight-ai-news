import { PRIMITIVES, type PrimitiveId } from "@storybook/dsl";

export const STAGE_W = 1600;
export const STAGE_H = 1200;

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const r2 = (v: number) => Math.round(v * 100) / 100;

export type KeyframeTarget = "loop" | "once" | "part-eyes" | "part-arm-right";

export type KeyframeSpec = {
  element: KeyframeTarget;
  keyframes: Keyframe[] | PropertyIndexedKeyframes;
  options: KeyframeAnimationOptions;
};

// Only these primitives may loop (implementation decision R5).
const LOOPABLE: ReadonlySet<PrimitiveId> = new Set<PrimitiveId>(["float", "sway", "blink"]);

export function isLoopable(primitive: PrimitiveId): boolean {
  return LOOPABLE.has(primitive);
}

// Keyframes for one primitive. Missing params come from the DSL defaults
// (implementation decision R3). "loop" on a one-shot primitive runs once and
// warns; validateScene rejects that case first (`loop_not_allowed`).
export function keyframesFor(primitive: PrimitiveId, params: Record<string, number>, mode: "loop" | "once"): KeyframeSpec {
  const p: Record<string, number> = { ...PRIMITIVES[primitive].defaults, ...params };
  let loop = mode === "loop";
  if (loop && !LOOPABLE.has(primitive)) {
    console.warn(`scene-runtime: primitive "${primitive}" cannot loop; it runs once`);
    loop = false;
  }
  const iterations = loop ? Infinity : 1;
  const wrapper = loop ? "loop" : "once";
  switch (primitive) {
    case "float": {
      const a = r2(p.amplitude * STAGE_H);
      return {
        element: wrapper,
        keyframes: { translate: ["0px 0px", `0px -${a}px`, "0px 0px"] },
        options: { duration: p.period * 1000, easing: "ease-in-out", iterations },
      };
    }
    case "sway": {
      const a = p.angle;
      return {
        element: wrapper,
        keyframes: { rotate: ["0deg", `${a}deg`, "0deg", `-${a}deg`, "0deg"] },
        options: { duration: p.period * 1000, easing: "ease-in-out", iterations },
      };
    }
    case "bounce": {
      const b = r2(p.height * STAGE_H);
      return {
        element: "once",
        keyframes: { translate: ["0px 0px", `0px -${b}px`, "0px 0px"], offset: [0, 0.4, 1] },
        options: { duration: 700, easing: EASE, iterations: p.count },
      };
    }
    case "pop":
      return {
        element: "once",
        keyframes: { scale: ["1", `${p.scale}`, "1"], offset: [0, 0.4, 1] },
        options: { duration: 700, easing: EASE, iterations: 1 },
      };
    case "fade-in":
      return {
        element: "once",
        keyframes: { opacity: ["0", "1"] },
        options: { duration: 600, delay: p.delay * 1000, easing: "ease-out", fill: "backwards", iterations: 1 },
      };
    case "blink": {
      if (!loop) {
        return {
          element: "part-eyes",
          keyframes: [{ transform: "scaleY(1)" }, { transform: "scaleY(0.1)" }, { transform: "scaleY(1)" }],
          options: { duration: 160, iterations: 1 },
        };
      }
      const d = p.interval * 1000;
      return {
        element: "part-eyes",
        keyframes: [
          { transform: "scaleY(1)", offset: 0 },
          { transform: "scaleY(1)", offset: 1 - 160 / d },
          { transform: "scaleY(0.1)", offset: 1 - 80 / d },
          { transform: "scaleY(1)", offset: 1 },
        ],
        options: { duration: d, iterations: Infinity },
      };
    }
    case "wave":
      return {
        element: "part-arm-right",
        keyframes: [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-20deg)" },
          { transform: "rotate(10deg)" },
          { transform: "rotate(-20deg)" },
          { transform: "rotate(0deg)" },
        ],
        options: { duration: 900, easing: "ease-in-out", iterations: p.count },
      };
    default: {
      const never: never = primitive;
      throw new Error(`unknown primitive ${String(never)}`);
    }
  }
}
