// The tracked crop map of a board, and the draft generator (`cut <board> --propose`).
import { z } from "zod";
import { boardBackground, type Detected, detectFigures, findHoleCandidates, type Rect } from "./image";
import { readBoard } from "./io";

export const POSES = ["front", "three-quarter", "side", "back", "bust", "walk", "run", "sit", "read", "default"] as const;
// Canonical order.
export const EXPRESSIONS = ["happy", "sad", "angry", "surprised", "worried", "thinking"] as const;

export const ASSET_KEY = /^[a-z][a-z0-9-]{1,31}$/;
export const DEFAULT_TOLERANCE = 10;

const int = z.number().int();
const PointSchema = z.strictObject({ x: int, y: int });
const RectSchema = z.strictObject({ x: int.min(0), y: int.min(0), w: int.positive(), h: int.positive() });
const Key = z.string().regex(ASSET_KEY);

export const CropMapSchema = z.strictObject({
  board: z.string().regex(/\.png$/),
  background: z.tuple([int.min(0).max(255), int.min(0).max(255), int.min(0).max(255)]),
  tolerance: int.min(0).max(255),
  assets: z.record(
    Key,
    z.strictObject({
      kind: z.enum(["character", "prop", "scenery"]),
      name: z.string().min(1),
      description: z.string().min(1).optional(),
      version: int.min(1),
      flippable: z.boolean(),
    }),
  ),
  figures: z.array(
    z.strictObject({
      key: Key.nullable(), // null only in an unfinished draft; `cut` refuses it
      pose: z.enum(POSES),
      expression: z.enum(EXPRESSIONS).nullable(), // null for props, scenery, and ignored figures
      box: RectSchema,
      face: RectSchema.nullable(),
      foot: PointSchema.nullable(), // manual override, normally null
      holes: z.array(PointSchema),
      holeCandidates: z.array(PointSchema),
      tolerance: int.min(0).max(255).nullable(), // per-figure override, normally null
      ignore: z.boolean(), // true for palette swatches
    }),
  ),
});

export type CropMap = z.infer<typeof CropMapSchema>;
export type CropFigure = CropMap["figures"][number];

export const CHARACTER_KEYS: Record<string, { key: string; name: string }> = {
  "00-robot": { key: "pip", name: "Pip" },
  "01-cow": { key: "cow", name: "Cow" },
  "02-pig": { key: "pig", name: "Pig" },
  "03-otter": { key: "bobo", name: "Bobo" },
  "04-red-panda": { key: "nori", name: "Nori" },
  "05-dog": { key: "dog", name: "Dog" },
  "06-cat": { key: "cat", name: "Cat" },
  "07-rabbit": { key: "rabbit", name: "Rabbit" },
  "08-moth": { key: "lumi", name: "Lumi" },
  "09-frog": { key: "kiki", name: "Kiki" },
  "10-tortoise": { key: "toma", name: "Toma" },
  "11-mole": { key: "puck", name: "Puck" },
  "12-sparrow": { key: "sola", name: "Sola" },
};

export const CHARACTER_BOARDS = [
  "character-board-00-robot",
  "character-board-01-cow-v1",
  "character-board-02-pig-v1",
  "character-board-03-otter-v1",
  "character-board-04-red-panda-v1",
  "character-board-05-dog-v1",
  "character-board-06-cat-v1",
  "character-board-07-rabbit-v1",
  "character-board-08-moth-v1",
  "character-board-09-frog-v1",
  "character-board-10-tortoise-v1",
  "character-board-11-mole-v1",
  "character-board-12-sparrow-v1",
];

// Reading order: rows top to bottom, then left to right.
export const PROP_KEYS: Record<string, string[]> = {
  "prop-board-01-nature-objects": ["tree", "bush", "grass", "flowers", "rocks", "log", "mushrooms", "pond", "clouds", "sun"],
  "prop-board-02-buildings-large-objects": ["cottage", "workshop", "barn", "tent", "bridge", "door", "window", "fence"],
  "prop-board-03-robot-story-objects": ["toolbox", "gears", "screws", "battery", "light-bulb", "robot-parts", "wagon", "machine"],
  "prop-board-04-everyday-interaction-props": ["ball", "book", "blocks", "backpack", "umbrella", "cup", "basket", "blanket"],
  "prop-board-05-ground-atmosphere-elements": ["grass-patch", "stone-patch", "ripples", "leaves", "stars", "raindrops", "wind", "burst"],
};

export const PROP_BOARDS = Object.keys(PROP_KEYS);
export const ALL_BOARDS = [...CHARACTER_BOARDS, ...PROP_BOARDS];

// Every other prop board merges with gap 0.
export const MERGE_GAP: Record<string, number> = { "prop-board-05-ground-atmosphere-elements": 12 };

const SCENERY_BOARDS = new Set([
  "prop-board-01-nature-objects",
  "prop-board-02-buildings-large-objects",
  "prop-board-05-ground-atmosphere-elements",
]);

const ROW_POSES: Array<Array<{ pose: CropFigure["pose"]; expression: CropFigure["expression"] }>> = [
  ["front", "three-quarter", "side", "back"].map((pose) => ({ pose: pose as CropFigure["pose"], expression: "happy" as const })),
  EXPRESSIONS.map((expression) => ({ pose: "bust" as const, expression })),
  ["walk", "run", "sit", "read"].map((pose) => ({ pose: pose as CropFigure["pose"], expression: "happy" as const })),
];

export function characterKey(board: string): { key: string; name: string } {
  const m = board.match(/^character-board-(\d\d-[a-z-]+?)(?:-v\d+)?$/);
  const entry = m ? CHARACTER_KEYS[m[1]!] : undefined;
  if (!entry) throw new Error(`no character key for board ${board}`);
  return entry;
}

const fraction = (b: Rect, f: { x: number; y: number; w: number; h: number }): Rect => ({
  x: Math.round(b.x + f.x * b.w),
  y: Math.round(b.y + f.y * b.h),
  w: Math.round(f.w * b.w),
  h: Math.round(f.h * b.h),
});

function faceDraft(pose: CropFigure["pose"], bounds: Rect): Rect | null {
  if (pose === "back") return null;
  if (pose === "bust") return fraction(bounds, { x: 0.1, y: 0.05, w: 0.8, h: 0.65 });
  return fraction(bounds, { x: 0.15, y: 0.08, w: 0.7, h: 0.4 });
}

function propName(key: string): string {
  const text = key.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The draft crop map of a board. Throws when the figures do not match the
// expected layout; the caller prints the message and exits 1.
export async function proposeCropMap(board: string): Promise<CropMap> {
  const raw = await readBoard(board);
  const bg = boardBackground(raw);
  const tolerance = DEFAULT_TOLERANCE;
  const base = { board: `${board}.png`, background: bg, tolerance };
  const blank = { foot: null, holes: [], holeCandidates: [], tolerance: null } as const;

  if (board.startsWith("character-board-")) {
    const { key, name } = characterKey(board);
    const rows = detectFigures(raw, bg, "character");
    const counts = rows.map((r) => r.length);
    if (counts.join(",") !== "4,6,4,6") throw new Error(`${board}: row counts are [${counts.join(", ")}], expected [4, 6, 4, 6]`);
    const figures: CropFigure[] = rows.flatMap((row, r) =>
      row.map((d: Detected, i) => {
        if (r === 3) {
          // Palette swatches: never cut (implementation decision: key of the board, pose `default`).
          return { ...blank, holes: [], holeCandidates: [], key, pose: "default" as const, expression: null, box: d.box, face: null, ignore: true };
        }
        const { pose, expression } = ROW_POSES[r]![i]!;
        return {
          ...blank,
          holes: [],
          key,
          pose,
          expression,
          box: d.box,
          face: faceDraft(pose, d.bounds),
          holeCandidates: findHoleCandidates(raw, d.box, bg, tolerance),
          ignore: false,
        };
      }),
    );
    return { ...base, assets: { [key]: { kind: "character", name, version: 1, flippable: true } }, figures };
  }

  const keys = PROP_KEYS[board];
  if (!keys) throw new Error(`unknown board ${board}`);
  const found = detectFigures(raw, bg, "prop", MERGE_GAP[board] ?? 0).flat();
  if (found.length !== keys.length) throw new Error(`${board}: found ${found.length} figures, expected ${keys.length}`);
  const kind = SCENERY_BOARDS.has(board) ? ("scenery" as const) : ("prop" as const);
  const assets: CropMap["assets"] = {};
  for (const key of keys) assets[key] = { kind, name: propName(key), version: 1, flippable: true };
  const figures: CropFigure[] = found.map((d, i) => ({
    ...blank,
    holeCandidates: [],
    key: keys[i]!,
    pose: "default",
    expression: null,
    box: d.box,
    face: null,
    // On prop boards every enclosed paper region is a true gap: apply it.
    holes: findHoleCandidates(raw, d.box, bg, tolerance),
    ignore: false,
  }));
  return { ...base, assets, figures };
}
