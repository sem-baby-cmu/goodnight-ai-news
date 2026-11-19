// Pixel algorithms over raw buffers (design "8. Asset pipeline"). No I/O here.
import type { Point, Rect } from "@storybook/dsl";

// A decoded image. Boards are RGB (`channels` 3).
export type Raw = { data: Uint8Array; width: number; height: number; channels: number };
export type RGB = [number, number, number];

// Detection threshold: a pixel further than this from the background is ink.
const INK = 20;
const MIN_FIGURE_AREA = 400;
const BOX_MARGIN = 8;

// Max channel distance of pixel `i` (pixel index, not byte index) from `bg`.
export function dist(raw: Raw, i: number, bg: RGB): number {
  const o = i * raw.channels;
  const d = raw.data;
  return Math.max(Math.abs(d[o]! - bg[0]), Math.abs(d[o + 1]! - bg[1]), Math.abs(d[o + 2]! - bg[2]));
}

// Per-channel median of the outermost rows and columns. For an even count, the
// upper middle value (implementation decision).
export function boardBackground(raw: Raw): RGB {
  const { width, height } = raw;
  const ring: number[] = [];
  for (let x = 0; x < width; x++) ring.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) ring.push(y * width, y * width + width - 1);
  const median = (c: number) => {
    const values = ring.map((i) => raw.data[i * raw.channels + c]!).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)]!;
  };
  return [median(0), median(1), median(2)];
}

// Inclusive pixel bounds of a component.
type Bounds = { x0: number; y0: number; x1: number; y1: number; area: number };

const toRect = (b: Bounds): Rect => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 });

// 4-connected components of `mask` (1 = member) inside a width × height grid.
// Calls `visit` for each pixel of a component; returns the bounds per component.
export function components(
  mask: Uint8Array,
  width: number,
  height: number,
  visit?: (component: number, pixel: number) => void,
): Bounds[] {
  const label = new Int32Array(width * height).fill(-1);
  const stack = new Int32Array(width * height);
  const out: Bounds[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    const id = out.length;
    const b: Bounds = { x0: width, y0: height, x1: -1, y1: -1, area: 0 };
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    while (top > 0) {
      const p = stack[--top]!;
      const x = p % width;
      const y = (p - x) / width;
      b.area++;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      visit?.(id, p);
      const push = (q: number) => {
        if (mask[q] && label[q] === -1) {
          label[q] = id;
          stack[top++] = q;
        }
      };
      if (x > 0) push(p - 1);
      if (x < width - 1) push(p + 1);
      if (y > 0) push(p - width);
      if (y < height - 1) push(p + width);
    }
    out.push(b);
  }
  return out;
}

const contains = (a: Bounds, b: Bounds) => a.x0 <= b.x0 && a.y0 <= b.y0 && a.x1 >= b.x1 && a.y1 >= b.y1;
const sameBox = (a: Bounds, b: Bounds) => a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;

function grownIntersect(a: Bounds, b: Bounds, gap: number): boolean {
  return a.x0 - gap <= b.x1 + gap && b.x0 - gap <= a.x1 + gap && a.y0 - gap <= b.y1 + gap && b.y0 - gap <= a.y1 + gap;
}

export type Detected = { box: Rect; bounds: Rect };

// Finds the figures of a board, in reading order: rows top to bottom, then left
// to right. `box` is the component bounds grown by 8 px and clamped to the board.
export function detectFigures(raw: Raw, bg: RGB, kind: "character" | "prop", mergeGap = 0): Detected[][] {
  const { width, height } = raw;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = dist(raw, i, bg) > INK ? 1 : 0;
  let found = components(mask, width, height).filter((c) => c.area >= MIN_FIGURE_AREA);

  if (kind === "character") {
    // A component inside another component's box joins that figure.
    found = found.filter((c, i) => !found.some((o, j) => j !== i && contains(o, c) && (!sameBox(o, c) || j < i)));
  } else {
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < found.length; i++) {
        for (let j = i + 1; j < found.length; j++) {
          const a = found[i]!;
          const b = found[j]!;
          if (!grownIntersect(a, b, mergeGap)) continue;
          found[i] = {
            x0: Math.min(a.x0, b.x0),
            y0: Math.min(a.y0, b.y0),
            x1: Math.max(a.x1, b.x1),
            y1: Math.max(a.y1, b.y1),
            area: a.area + b.area,
          };
          found.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  const rows: Bounds[][] = [];
  let lowest = -1;
  for (const c of [...found].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    if (rows.length > 0 && c.y0 <= lowest) {
      rows[rows.length - 1]!.push(c);
      lowest = Math.max(lowest, c.y1);
    } else {
      rows.push([c]);
      lowest = c.y1;
    }
  }
  return rows.map((row) =>
    row
      .sort((a, b) => a.x0 - b.x0)
      .map((c) => {
        const x0 = Math.max(0, c.x0 - BOX_MARGIN);
        const y0 = Math.max(0, c.y0 - BOX_MARGIN);
        const x1 = Math.min(width, c.x1 + 1 + BOX_MARGIN);
        const y1 = Math.min(height, c.y1 + 1 + BOX_MARGIN);
        return { box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, bounds: toRect(c) };
      }),
  );
}

export type { Point, Rect };

// ---- Cut-out (design "8. Asset pipeline", Cut out).

const MIN_HOLE_AREA = 200;

// Paper pixels (dist <= tolerance) of `box`, box-local.
function paperMask(raw: Raw, box: Rect, bg: RGB, tolerance: number): Uint8Array {
  const mask = new Uint8Array(box.w * box.h);
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      mask[y * box.w + x] = dist(raw, (box.y + y) * raw.width + box.x + x, bg) <= tolerance ? 1 : 0;
    }
  }
  return mask;
}

// 4-connected flood fill over `paper` from `seeds` (box-local pixel indexes). Marks `filled`.
function floodFill(paper: Uint8Array, w: number, h: number, seeds: number[], filled: Uint8Array): void {
  const stack: number[] = [];
  for (const s of seeds) {
    if (paper[s] && !filled[s]) {
      filled[s] = 1;
      stack.push(s);
    }
  }
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % w;
    const go = (q: number) => {
      if (paper[q] && !filled[q]) {
        filled[q] = 1;
        stack.push(q);
      }
    };
    if (x > 0) go(p - 1);
    if (x < w - 1) go(p + 1);
    if (p >= w) go(p - w);
    if (p < (h - 1) * w) go(p + w);
  }
}

function edgePixels(w: number, h: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) out.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) out.push(y * w, y * w + w - 1);
  return out;
}

// Paper fill of a box from its edge: the background that the cut removes.
function edgeFill(raw: Raw, box: Rect, bg: RGB, tolerance: number) {
  const paper = paperMask(raw, box, bg, tolerance);
  const filled = new Uint8Array(box.w * box.h);
  floodFill(paper, box.w, box.h, edgePixels(box.w, box.h), filled);
  return { paper, filled };
}

// Enclosed paper-coloured regions of 200 px or more that the edge fill does
// not reach. One point per region (its first pixel in row-major order), in
// board coordinates. Code cannot tell eye whites from gaps (invariant 2).
export function findHoleCandidates(raw: Raw, box: Rect, bg: RGB, tolerance: number): Point[] {
  const { paper, filled } = edgeFill(raw, box, bg, tolerance);
  const enclosed = new Uint8Array(paper.length);
  for (let i = 0; i < paper.length; i++) enclosed[i] = paper[i] && !filled[i] ? 1 : 0;
  const first: number[] = [];
  const regions = components(enclosed, box.w, box.h, (id, p) => {
    if (first[id] === undefined || p < first[id]!) first[id] = p;
  });
  return regions.flatMap((r, id) =>
    r.area >= MIN_HOLE_AREA ? [{ x: box.x + (first[id]! % box.w), y: box.y + Math.floor(first[id]! / box.w) }] : [],
  );
}

export type CutFigureInput = { index: number; key: string; pose: string; box: Rect; holes: Point[]; tolerance: number };
// Largest dropped edge piece, as a share of the kept opaque area (R62).
export const MAX_DROP_SHARE = 0.05;

export type Cut = { data: Uint8Array; width: number; height: number; origin: Point; dropped: Array<{ area: number; box: Rect }> };

// Cuts one figure out of a board: RGBA, trimmed to alpha > 0, with a 2 px
// feather that never grows the edge. Throws instead of guessing.
export function cutFigure(raw: Raw, bg: RGB, fig: CutFigureInput, log: (line: string) => void = console.log): Cut {
  const { box } = fig;
  const name = `figure ${fig.index} (${fig.key}/${fig.pose})`;
  const { w, h } = box;
  const { paper, filled } = edgeFill(raw, box, bg, fig.tolerance);
  for (const seed of fig.holes) {
    const x = seed.x - box.x;
    const y = seed.y - box.y;
    if (x < 0 || y < 0 || x >= w || y >= h) throw new Error(`${name}: hole seed (${seed.x}, ${seed.y}) is outside the box`);
    if (!paper[y * w + x]) {
      const d = dist(raw, seed.y * raw.width + seed.x, bg);
      throw new Error(`${name}: hole seed (${seed.x}, ${seed.y}) is not paper-coloured (dist ${d} > ${fig.tolerance})`);
    }
    floodFill(paper, w, h, [y * w + x], filled);
  }

  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = filled[i] ? 0 : 255;

  // Drop opaque pieces that touch the box edge: parts of a neighbour (invariant 4).
  const members: number[][] = [];
  const parts = components(alpha, w, h, (id, p) => (members[id] ??= []).push(p));
  const dropped: Cut["dropped"] = [];
  parts.forEach((c, id) => {
    if (c.x0 > 0 && c.y0 > 0 && c.x1 < w - 1 && c.y1 < h - 1) return;
    for (const p of members[id]!) alpha[p] = 0;
    const where = { x: box.x + c.x0, y: box.y + c.y0, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1 };
    dropped.push({ area: c.area, box: where });
    log(`${name}: dropped a piece that touches the box edge at (${where.x}, ${where.y}, ${where.w} × ${where.h}), area ${c.area}`);
  });
  if (!alpha.some((a) => a > 0)) throw new Error(`${name} is empty`);
  // A large dropped piece means a wrong box or tolerance, not a neighbour's ear:
  // fail instead of cutting away part of the figure (R62, implementation decision).
  const kept = alpha.reduce((n, a) => n + (a > 0 ? 1 : 0), 0);
  for (const d of dropped) {
    if (d.area > kept * MAX_DROP_SHARE) {
      throw new Error(`${name}: a dropped edge piece at (${d.box.x}, ${d.box.y}, ${d.box.w} × ${d.box.h}), area ${d.area}, is larger than 5 % of the kept area ${kept}`);
    }
  }

  const soft = feather(alpha, w, h);

  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!soft[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const data = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const src = ((box.y + y0 + y) * raw.width + box.x + x0 + x) * raw.channels;
      const dst = (y * tw + x) * 4;
      data[dst] = raw.data[src]!;
      data[dst + 1] = raw.data[src + 1]!;
      data[dst + 2] = raw.data[src + 2]!;
      data[dst + 3] = soft[(y0 + y) * w + x0 + x]!;
    }
  }
  return { data, width: tw, height: th, origin: { x: box.x + x0, y: box.y + y0 }, dropped };
}

// New alpha = min(alpha, floor(mean of the 5 × 5 square)), with transparent
// pixels outside the image. A pixel more than 2 px from every transparent pixel
// keeps its alpha; the edge only softens inward (invariant 5, R27). `floor`
// keeps the result at or below the mean (implementation decision).
export function feather(alpha: Uint8Array, w: number, h: number): Uint8Array {
  // Summed-area table with a zero first row and column.
  const W = w + 1;
  const sat = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += alpha[y * w + x]!;
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1]! + row;
    }
  }
  const out = new Uint8Array(alpha.length);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - 2);
    const yb = Math.min(h, y + 3);
    for (let x = 0; x < w; x++) {
      const a = alpha[y * w + x]!;
      if (a === 0) continue;
      const xa = Math.max(0, x - 2);
      const xb = Math.min(w, x + 3);
      const sum = sat[yb * W + xb]! - sat[ya * W + xb]! - sat[yb * W + xa]! + sat[ya * W + xa]!;
      out[y * w + x] = Math.min(a, Math.floor(sum / 25));
    }
  }
  return out;
}

// ---- Measure (design "8. Asset pipeline", Measure). "Opaque" is alpha >= 128.

export type Measured = { box: Rect; foot: Point; face?: Rect };

export function measureImage(
  img: { data: Uint8Array; width: number; height: number },
  opts: { origin: Point; face: Rect | null; foot: Point | null },
): Measured {
  const { width, height } = img;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (img.data[(y * width + x) * 4 + 3]! < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("image has no opaque pixel");
  let foot: Point;
  if (opts.foot) {
    foot = { x: opts.foot.x - opts.origin.x, y: opts.foot.y - opts.origin.y };
  } else {
    let min = width;
    let max = -1;
    for (let x = 0; x < width; x++) {
      if (img.data[(y1 * width + x) * 4 + 3]! < 128) continue;
      if (x < min) min = x;
      if (x > max) max = x;
    }
    foot = { x: Math.round((min + max) / 2), y: y1 + 1 };
  }
  const out: Measured = { box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, foot };
  if (opts.face) {
    const fx0 = Math.max(0, opts.face.x - opts.origin.x);
    const fy0 = Math.max(0, opts.face.y - opts.origin.y);
    const fx1 = Math.min(width, opts.face.x + opts.face.w - opts.origin.x);
    const fy1 = Math.min(height, opts.face.y + opts.face.h - opts.origin.y);
    out.face = { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 };
  }
  return out;
}
