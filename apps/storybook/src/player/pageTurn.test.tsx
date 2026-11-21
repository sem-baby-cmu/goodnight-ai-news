import { expect, it } from "vitest";
import { turnKeyframes } from "./pageTurn";

// The values of DESIGN.md 12.4 (page turn) and section 5 (reduced motion),
// written out here, not imported.
type Part = { part: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions };
const KINDS = ["forward", "backward", "fade"] as const;
const parts = (kind: (typeof KINDS)[number]): Part[] => turnKeyframes(kind);

const TURN = { duration: 500, easing: "cubic-bezier(0.4, 0.1, 0.5, 1)", fill: "forwards" };
const SHADE = { duration: 500, easing: "linear", fill: "forwards" };
const FADE = { duration: 200, easing: "linear", fill: "forwards" };

it("turnKeyframes follow DESIGN.md 12.4", () => {
  // Forward: the leaving sheet turns away and fades after 85 %; the
  // arriving sheet lies below it and does not move.
  expect(parts("forward")).toEqual([
    {
      part: "leavingSheet",
      keyframes: [
        { transform: "rotateY(0deg)", opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.85 },
        { transform: "rotateY(-100deg)", opacity: 0, offset: 1 },
      ],
      options: TURN,
    },
    { part: "leavingShade", keyframes: [{ opacity: 0 }, { opacity: 0.28 }], options: SHADE },
    { part: "arrivingShade", keyframes: [{ opacity: 0.22 }, { opacity: 0 }], options: SHADE },
  ]);

  // Backward: the arriving sheet turns back over the leaving one and fades
  // in during the first 15 %; the leaving sheet does not move.
  expect(parts("backward")).toEqual([
    {
      part: "arrivingSheet",
      keyframes: [
        { transform: "rotateY(-100deg)", opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: "rotateY(0deg)", opacity: 1, offset: 1 },
      ],
      options: TURN,
    },
    { part: "arrivingShade", keyframes: [{ opacity: 0.28 }, { opacity: 0 }], options: SHADE },
    { part: "leavingShade", keyframes: [{ opacity: 0 }, { opacity: 0.22 }], options: SHADE },
  ]);

  // Reduced motion and "Read again": a 200 ms cross-fade, no shade.
  expect(parts("fade")).toEqual([
    { part: "leavingSheet", keyframes: [{ opacity: 1 }, { opacity: 0 }], options: FADE },
    { part: "arrivingSheet", keyframes: [{ opacity: 0 }, { opacity: 1 }], options: FADE },
  ]);
});

it("every keyframe names only transform, opacity and offset", () => {
  const allowed = ["transform", "opacity", "offset"];
  for (const kind of KINDS) {
    const list = parts(kind);
    expect(list.length, kind).toBeGreaterThan(0);
    for (const { part, keyframes } of list) {
      for (const frame of keyframes) {
        const other = Object.keys(frame).filter((key) => !allowed.includes(key));
        expect(other, `${kind} ${part}`).toEqual([]);
      }
    }
  }
});
