import type { LayoutTemplate } from "@storybook/dsl";

type Slot = LayoutTemplate["slots"][number];

// `width` is set on scenery slots only (#127); character and prop slots pass
// undefined (#85).
function slot(
  id: string,
  accepts: Slot["accepts"],
  footX: number,
  footY: number,
  height: number,
  width: number | undefined,
  minScale: number,
  z: number,
  poses?: string[],
  refs?: string[],
): Slot {
  const out: Slot = { id, accepts, footX, footY, height, minScale, z };
  if (width !== undefined) out.width = width;
  if (poses) out.poses = poses;
  if (refs) out.refs = refs;
  return out;
}

function template(id: string, slots: Slot[]): LayoutTemplate {
  return { id, stage: { width: 1600, height: 1200 }, slots };
}

// The scenery keys that a sky slot accepts (D4 ruling of #131). Ground slots
// accept every scenery key.
export const SKY_SCENERY = ["burst", "clouds", "raindrops", "stars", "sun", "wind"];

// The 8 MVP templates (design "4. Layout engine"; values from the #13
// refinement). Characters are above props and scenery in z, except the front
// object of `circle-around-object`. Only `bust` is a reserved pose: it has its
// own slot in `solo-center` (owner decision 2026-11-19, R35). The scenery slot
// widths are the D1 ruling of #127: each one is at most 2 · min(footX, 1600 − footX).
export const TEMPLATES: LayoutTemplate[] = [
  template("solo-center", [
    slot("hero", "character", 800, 1090, 640, undefined, 0.8, 50),
    slot("bust", "character", 800, 1200, 900, undefined, 0.85, 45, ["bust"]),
    slot("prop-left", "prop", 360, 1100, 260, undefined, 0.7, 40),
    slot("prop-right", "prop", 1240, 1100, 260, undefined, 0.7, 41),
    slot("back-left", "scenery", 300, 880, 560, 480, 0.7, 10),
    slot("back-right", "scenery", 1300, 880, 560, 480, 0.7, 11),
    slot("sky-1", "scenery", 1250, 330, 220, 700, 0.7, 5, undefined, SKY_SCENERY),
  ]),
  template("two-friends", [
    slot("left", "character", 520, 1080, 600, undefined, 0.8, 50),
    slot("right", "character", 1080, 1080, 600, undefined, 0.8, 51),
    slot("prop-center", "prop", 800, 1110, 220, undefined, 0.7, 52),
    slot("back-left", "scenery", 300, 880, 560, 480, 0.7, 10),
    slot("back-right", "scenery", 1300, 880, 560, 480, 0.7, 11),
    slot("sky-1", "scenery", 800, 300, 200, 1600, 0.7, 5, undefined, SKY_SCENERY),
  ]),
  template("three-friends", [
    slot("center", "character", 800, 1100, 600, undefined, 0.8, 52),
    slot("left", "character", 380, 1010, 480, undefined, 0.8, 50),
    slot("right", "character", 1220, 1010, 480, undefined, 0.8, 51),
    slot("back-left", "scenery", 260, 820, 480, 410, 0.7, 10),
    slot("back-right", "scenery", 1340, 820, 480, 410, 0.7, 11),
    slot("sky-1", "scenery", 800, 260, 200, 1600, 0.7, 5, undefined, SKY_SCENERY),
  ]),
  template("hero-and-object", [
    slot("hero", "character", 520, 1090, 620, undefined, 0.8, 50),
    slot("object", "prop", 1120, 1090, 520, undefined, 0.7, 40),
    slot("back-left", "scenery", 230, 860, 520, 440, 0.7, 10),
    slot("back-right", "scenery", 1360, 820, 520, 440, 0.7, 11),
    slot("sky-1", "scenery", 300, 300, 200, 600, 0.7, 5, undefined, SKY_SCENERY),
  ]),
  template("circle-around-object", [
    slot("object", "prop", 800, 1150, 260, undefined, 0.7, 60),
    slot("left", "character", 360, 1060, 520, undefined, 0.8, 50),
    slot("back", "character", 800, 960, 460, undefined, 0.8, 45),
    slot("right", "character", 1240, 1060, 520, undefined, 0.8, 51),
    slot("back-left", "scenery", 230, 760, 440, 370, 0.7, 10),
    slot("back-right", "scenery", 1370, 760, 440, 370, 0.7, 11),
  ]),
  template("big-sky", [
    slot("hero", "character", 800, 1100, 520, undefined, 0.8, 50),
    slot("friend", "character", 1220, 1100, 460, undefined, 0.8, 49),
    slot("hill", "scenery", 800, 1000, 360, 720, 0.7, 10),
    slot("sky-1", "scenery", 420, 420, 300, 840, 0.7, 5, undefined, SKY_SCENERY),
    slot("sky-2", "scenery", 1200, 300, 180, 800, 0.7, 6, undefined, SKY_SCENERY),
    slot("sky-3", "scenery", 800, 220, 140, 1600, 0.7, 7, undefined, SKY_SCENERY),
  ]),
  template("landscape", [
    slot("place", "scenery", 1050, 1000, 760, 900, 0.7, 10),
    slot("hero", "character", 420, 1100, 440, undefined, 0.8, 50),
    slot("side", "scenery", 180, 1000, 360, 310, 0.7, 11),
    slot("sky-1", "scenery", 400, 300, 200, 800, 0.7, 5, undefined, SKY_SCENERY),
    slot("prop-front", "prop", 1350, 1140, 200, undefined, 0.7, 40),
  ]),
  template("line-up", [
    slot("pos-1", "character", 250, 1080, 480, undefined, 0.8, 50),
    slot("pos-2", "character", 617, 1080, 480, undefined, 0.8, 51),
    slot("pos-3", "character", 983, 1080, 480, undefined, 0.8, 52),
    slot("pos-4", "character", 1350, 1080, 480, undefined, 0.8, 53),
    slot("back-1", "scenery", 800, 820, 520, 640, 0.7, 10),
    slot("sky-1", "scenery", 1300, 280, 180, 600, 0.7, 5, undefined, SKY_SCENERY),
  ]),
];

// One sentence per template, for the scene prompt (#18).
export const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  "solo-center":
    "One character in the middle, as a full figure in `hero` or as a close-up bust in `bust`, with a prop on each side.",
  "two-friends": "Two characters side by side, with a small prop between them.",
  "three-friends": "One character in front in the middle, two friends behind on each side.",
  "hero-and-object": "One character on the left next to a large object on the right.",
  "circle-around-object": "Three characters around an object on the ground in front.",
  "big-sky": "One or two characters low on the page under a large sky with up to three sky objects.",
  landscape: "A large place or building with a small character in front of it.",
  "line-up": "Up to four characters standing in a row.",
};
