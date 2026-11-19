// Review sheets for the owner gate. Build output: never tracked.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { CropMap } from "./crops";
import { measureImage, type Point, type Rect } from "./image";
import { boardPath } from "./io";
import type { CutResult } from "./pipeline";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function label(fig: CropMap["figures"][number], index: number): string {
  return `${index} ${fig.key ?? "?"}/${fig.pose}/${fig.expression ?? "-"}`;
}

const rect = (r: Rect, colour: string, width: number) =>
  `<rect x="${r.x + 0.5}" y="${r.y + 0.5}" width="${r.w - 1}" height="${r.h - 1}" fill="none" stroke="${colour}" stroke-width="${width}"/>`;

const text = (x: number, y: number, body: string) =>
  `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(body)}</text>`;

// `<reviewDir>/<board>.png`: the board with boxes (blue), faces (green), a red
// cross at each foot, magenta dots at seeds, hollow orange circles at hole
// candidates that are not applied, ignored boxes in grey, and a label per box.
// `<reviewDir>/<board>-cutouts.png`: every cut-out on #ff00ff, in a grid.
export async function writeReviewSheets(
  board: string,
  data: { map: CropMap; results: CutResult[]; reviewDir: string },
): Promise<{ overlay: string; cutouts: string }> {
  const { map, results, reviewDir } = data;
  mkdirSync(reviewDir, { recursive: true });
  const meta = await sharp(boardPath(board)).metadata();
  const width = meta.width!;
  const height = meta.height!;

  const feet = new Map<number, Point>();
  for (const r of results) {
    const m = measureImage(r.cut, { origin: r.cut.origin, face: null, foot: r.figure.foot });
    feet.set(r.index, { x: r.cut.origin.x + m.foot.x, y: r.cut.origin.y + m.foot.y });
  }

  const parts: string[] = [];
  map.figures.forEach((fig, index) => {
    if (fig.ignore) {
      parts.push(rect(fig.box, "#888", 2), text(fig.box.x + 4, fig.box.y + 16, `${index} ignored`));
      return;
    }
    parts.push(rect(fig.box, "#1e5bff", 2));
    if (fig.face) parts.push(rect(fig.face, "#00a650", 2));
    const foot = feet.get(index);
    if (foot) {
      parts.push(
        `<path d="M${foot.x - 8} ${foot.y}H${foot.x + 8}M${foot.x} ${foot.y - 8}V${foot.y + 8}" stroke="#ff0000" stroke-width="2"/>`,
      );
    }
    for (const s of fig.holes) parts.push(`<circle cx="${s.x + 0.5}" cy="${s.y + 0.5}" r="4" fill="#ff00ff"/>`);
    for (const s of fig.holeCandidates) {
      parts.push(`<circle cx="${s.x + 0.5}" cy="${s.y + 0.5}" r="5" fill="none" stroke="#ff8a00" stroke-width="2"/>`);
    }
    parts.push(text(fig.box.x + 4, fig.box.y + 16, label(fig, index)));
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join("")}</svg>`;
  const overlay = join(reviewDir, `${board}.png`);
  await sharp(boardPath(board))
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(overlay);

  const cols = 6;
  const pad = 16;
  const labelH = 22;
  const cellW = Math.max(1, ...results.map((r) => r.cut.width)) + pad * 2;
  const cellH = Math.max(1, ...results.map((r) => r.cut.height)) + pad * 2 + labelH;
  const rows = Math.max(1, Math.ceil(results.length / cols));
  const sheetW = cellW * Math.min(cols, Math.max(1, results.length));
  const sheetH = cellH * rows;
  const labels: string[] = [];
  const layers = results.map((r, i) => {
    const left = (i % cols) * cellW + pad;
    const top = Math.floor(i / cols) * cellH + pad + labelH;
    labels.push(text(left, top - 6, label(r.figure, r.index)));
    return {
      input: Buffer.from(r.cut.data.buffer, r.cut.data.byteOffset, r.cut.data.length),
      raw: { width: r.cut.width, height: r.cut.height, channels: 4 as const },
      left,
      top,
    };
  });
  const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">${labels.join("")}</svg>`;
  const cutouts = join(reviewDir, `${board}-cutouts.png`);
  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: "#ff00ff" } })
    .composite([...layers, { input: Buffer.from(labelSvg), top: 0, left: 0 }])
    .png()
    .toFile(cutouts);
  return { overlay, cutouts };
}
