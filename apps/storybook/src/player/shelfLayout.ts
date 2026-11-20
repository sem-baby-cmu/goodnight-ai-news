// The shelf sizes of DESIGN.md 12.1. A pure function of the viewport in
// CSS px; no DOM. `x`, `y` are from the top left of the viewport; `slots`
// are relative to the shelf box, in reading order (board 1 left to right,
// then board 2).
import { type LayoutName, layoutFor } from "./layout";

export type ShelfLayout = {
  layout: LayoutName;
  boards: number;
  perBoard: number;
  perPage: number;
  book: { w: number; h: number };
  window: { w: number; h: number };
  shelf: { x: number; y: number; w: number; h: number };
  slots: { x: number; y: number }[];
  previous: { x: number; y: number };
  next: { x: number; y: number };
  // False when the viewport cannot hold one book of 128 px (#91 reads it).
  fits: boolean;
};

// The name band at the top of the screen.
const NAME_BAND = 64;
const MIN_BOOK = 128;
const MAX_BOOK = 180;

// The widest book of `n` per board, at least MIN_BOOK, with fewer books
// when a board cannot hold `n`.
function fitBooks(start: number, width: (n: number) => number): { n: number; bw: number; fits: boolean } {
  for (let n = start; ; n--) {
    const bw = Math.floor(width(n));
    if (bw >= MIN_BOOK) return { n, bw, fits: true };
    if (n === 1) return { n: 1, bw: MIN_BOOK, fits: false };
  }
}

export function shelfLayout(w: number, h: number): ShelfLayout {
  const layout = layoutFor(w, h);
  let boards: number;
  let n: number;
  let bw: number;
  let B: number;
  let fits = true;
  let side: number;
  let toSide: number;
  let gap: number;
  let shelfW: number;
  let place: (shelfH: number) => { x: number; y: number; previous: { x: number; y: number }; next: { x: number; y: number } };

  if (layout === "wide") {
    boards = 2;
    n = 3;
    B = Math.min(224, Math.floor((h - 164) / 2));
    bw = Math.round((B * 180) / 224);
    side = 16;
    toSide = 20;
    gap = 24;
    shelfW = 3 * bw + 120;
    place = (shelfH) => {
      const y = NAME_BAND + (h - 80 - shelfH) / 2;
      const arrowY = y + shelfH / 2 - 32;
      return { x: 96 + (w - 192 - shelfW) / 2, y, previous: { x: 16, y: arrowY }, next: { x: w - 80, y: arrowY } };
    };
  } else if (layout === "narrow") {
    boards = h >= 700 ? 2 : 1;
    const fixed = boards === 2 ? 248 : 220;
    side = 12;
    toSide = 12;
    gap = 16;
    const fit = fitBooks(2, (k) => Math.min(MAX_BOOK, (w - 48 - 16 * (k - 1)) / k, (((h - fixed) / boards) * 180) / 224));
    ({ n, bw, fits } = fit);
    B = Math.round((bw * 224) / 180);
    shelfW = n * bw + 48 + 16 * (n - 1);
    place = (shelfH) => ({
      x: (w - shelfW) / 2,
      y: NAME_BAND + (h - NAME_BAND - 100 - shelfH) / 2,
      previous: { x: 16, y: h - 76 },
      next: { x: w - 80, y: h - 76 },
    });
  } else {
    boards = 1;
    side = 12;
    toSide = 12;
    gap = 12;
    const fit = fitBooks(3, (k) => Math.min(MAX_BOOK, (w - 176 - 48 - 12 * (k - 1)) / k, ((h - 136) * 180) / 224));
    ({ n, bw, fits } = fit);
    B = Math.round((bw * 224) / 180);
    shelfW = n * bw + 48 + 12 * (n - 1);
    place = (shelfH) => ({
      x: 88 + (w - 176 - shelfW) / 2,
      y: NAME_BAND + (h - 80 - shelfH) / 2,
      previous: { x: 12, y: h - 76 },
      next: { x: w - 76, y: h - 76 },
    });
  }

  // A top board of 16; for each board 12 px free space, the book, a board
  // of 16; feet of 12.
  const shelfH = 16 + boards * (B + 28) + 12;
  const { x, y, previous, next } = place(shelfH);
  const s = bw / 180;
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < boards; r++) {
    for (let c = 0; c < n; c++) slots.push({ x: side + toSide + c * (bw + gap), y: 16 + r * (B + 28) + 12 });
  }
  return {
    layout,
    boards,
    perBoard: n,
    perPage: boards * n,
    book: { w: bw, h: B },
    // The cloth parts 8 s + 6 s + 8 s, the plate 52 and its 2 px edge.
    window: { w: 151 * s, h: B - 54 - 22 * s },
    shelf: { x, y, w: shelfW, h: shelfH },
    slots,
    previous,
    next,
    fits,
  };
}
