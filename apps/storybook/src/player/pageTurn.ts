// The page turn of the Player (DESIGN.md 5, 12.4) as Web Animations. The
// tap handler starts them, in the tap, so the turn has its first frame
// without waiting for React or a CSS class.

export type TurnKind = "forward" | "backward" | "fade";

export const TURN_MS = 500;
export const FADE_MS = 200;
export const TURN_EASING = "cubic-bezier(0.4, 0.1, 0.5, 1)";
// The shade on the sheet that turns, and on the sheet that it uncovers.
export const SHADE_TURNING = 0.28;
export const SHADE_BELOW = 0.22;

export function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A page sheet and its shade (Frame: `page-sheet`, `sheet-shade`).
export type SheetParts = { sheet: HTMLElement; shade: HTMLElement };

type Part = "leavingSheet" | "arrivingSheet" | "leavingShade" | "arrivingShade";
export type TurnPart = { part: Part; keyframes: Keyframe[]; options: KeyframeAnimationOptions };

// Every animation keeps its last keyframe (`fill: "forwards"`): the leaving
// sheet stays turned away until React removes it.
const TURN: KeyframeAnimationOptions = { duration: TURN_MS, easing: TURN_EASING, fill: "forwards" };
const SHADE: KeyframeAnimationOptions = { duration: TURN_MS, easing: "linear", fill: "forwards" };
const FADE: KeyframeAnimationOptions = { duration: FADE_MS, easing: "linear", fill: "forwards" };

// The animations of one turn, in the order they start. Only `transform` and
// `opacity` change.
export function turnKeyframes(kind: TurnKind): TurnPart[] {
  if (kind === "forward") {
    // The leaving sheet turns away and fades after 85 %; the arriving sheet
    // lies below it and does not move.
    return [
      {
        part: "leavingSheet",
        keyframes: [
          { transform: "rotateY(0deg)", opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.85 },
          { transform: "rotateY(-100deg)", opacity: 0, offset: 1 },
        ],
        options: { ...TURN },
      },
      { part: "leavingShade", keyframes: [{ opacity: 0 }, { opacity: SHADE_TURNING }], options: { ...SHADE } },
      { part: "arrivingShade", keyframes: [{ opacity: SHADE_BELOW }, { opacity: 0 }], options: { ...SHADE } },
    ];
  }
  if (kind === "backward") {
    // The arriving sheet turns back over the leaving one and shows during
    // the first 15 %; the leaving sheet does not move.
    return [
      {
        part: "arrivingSheet",
        keyframes: [
          { transform: "rotateY(-100deg)", opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.15 },
          { transform: "rotateY(0deg)", opacity: 1, offset: 1 },
        ],
        options: { ...TURN },
      },
      { part: "arrivingShade", keyframes: [{ opacity: SHADE_TURNING }, { opacity: 0 }], options: { ...SHADE } },
      { part: "leavingShade", keyframes: [{ opacity: 0 }, { opacity: SHADE_BELOW }], options: { ...SHADE } },
    ];
  }
  // Reduced motion and "Read again": a cross-fade, no shade.
  return [
    { part: "leavingSheet", keyframes: [{ opacity: 1 }, { opacity: 0 }], options: { ...FADE } },
    { part: "arrivingSheet", keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { ...FADE } },
  ];
}

// Starts the animations of a turn on the two sheets and returns them.
export function startTurn(kind: TurnKind, leaving: SheetParts, arriving: SheetParts): Animation[] {
  const target: Record<Part, HTMLElement> = {
    leavingSheet: leaving.sheet,
    arrivingSheet: arriving.sheet,
    leavingShade: leaving.shade,
    arrivingShade: arriving.shade,
  };
  return turnKeyframes(kind).map(({ part, keyframes, options }) => target[part].animate(keyframes, options));
}

// The 200 ms fade of the panel text at "Start" (the panel swap of
// DESIGN.md 5). Nothing with reduced motion.
export function fadeIn(el: HTMLElement): Animation | null {
  if (prefersReducedMotion()) return null;
  return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-out" });
}
