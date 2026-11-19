import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { CropMap } from "../src/crops";
import { cutFigure, measureImage, type RGB } from "../src/image";
import { encodeWebp } from "../src/io";
import { cutBoard } from "../src/pipeline";
import { alphaAt, blank, disk, PAPER, rect } from "./synthetic";

const T = 10;
const RED: RGB = [220, 40, 40];
const INK: RGB = [40, 60, 90];
// Background + 12 on every channel: a cream fill that a global key would delete.
const CREAM: RGB = [238, 234, 228];

function figure(box: { x: number; y: number; w: number; h: number }, holes: Array<{ x: number; y: number }> = []) {
  return { index: 0, key: "pip", pose: "front", box, holes, tolerance: T };
}

describe("cutFigure", () => {
  it("cutFigure removes paper-coloured background from the box edge", () => {
    const raw = disk(disk(blank(120, 120), 35, 60, 18, RED), 85, 60, 18, CREAM);
    const cut = cutFigure(raw, PAPER, figure({ x: 0, y: 0, w: 120, h: 120 }));
    const at = (x: number, y: number) => alphaAt(cut, x - cut.origin.x, y - cut.origin.y);
    expect(at(35, 60)).toBe(255);
    expect(at(85, 60)).toBe(255);
    // Paper between the disks is background: it is reached from the box edge.
    expect(at(60, 60)).toBe(0);
  });

  it("cutFigure keeps enclosed background without a seed and removes it with a seed", () => {
    const ring = () => disk(disk(blank(100, 100), 50, 50, 30, INK), 50, 50, 12, PAPER);
    const box = { x: 0, y: 0, w: 100, h: 100 };
    const kept = cutFigure(ring(), PAPER, figure(box));
    expect(alphaAt(kept, 50 - kept.origin.x, 50 - kept.origin.y)).toBe(255);
    const removed = cutFigure(ring(), PAPER, figure(box, [{ x: 50, y: 50 }]));
    expect(alphaAt(removed, 50 - removed.origin.x, 50 - removed.origin.y)).toBe(0);
  });

  it("cutFigure drops a neighbour component that touches the box edge", () => {
    // A disk in the middle and a piece of a neighbour that enters the box from the left.
    const raw = rect(disk(blank(140, 100), 80, 50, 20, RED), 0, 40, 12, 20, INK);
    const lines: string[] = [];
    const cut = cutFigure(raw, PAPER, figure({ x: 0, y: 0, w: 140, h: 100 }), (line) => lines.push(line));
    expect(cut.dropped).toEqual([{ area: 12 * 20, box: { x: 0, y: 40, w: 12, h: 20 } }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/dropped .*area 240/);
    // The trimmed image holds only the disk.
    expect(cut.origin).toEqual({ x: 60, y: 30 });
    expect([cut.width, cut.height]).toEqual([41, 41]);
  });

  it("cutFigure throws when a figure is empty", () => {
    const fig = { ...figure({ x: 0, y: 0, w: 50, h: 50 }), index: 3 };
    expect(() => cutFigure(blank(50, 50), PAPER, fig)).toThrow("figure 3 (pip/front) is empty");
  });

  it("cutFigure rejects a hole seed that is not paper-coloured", () => {
    const raw = disk(blank(100, 100), 50, 50, 30, RED);
    expect(() => cutFigure(raw, PAPER, figure({ x: 0, y: 0, w: 100, h: 100 }, [{ x: 50, y: 50 }]))).toThrow(
      /figure 0 \(pip\/front\).*seed \(50, 50\)/,
    );
  });

  it("cutFigure output is byte-identical across two runs", async () => {
    const make = () => disk(disk(blank(120, 120), 40, 60, 25, RED), 80, 60, 20, CREAM);
    const box = { x: 0, y: 0, w: 120, h: 120 };
    const a = await encodeWebp(cutFigure(make(), PAPER, figure(box)));
    const b = await encodeWebp(cutFigure(make(), PAPER, figure(box)));
    expect(a.equals(b)).toBe(true);
  });
});

describe("cut and measure", () => {
  it("REG-02.S1 each pose and expression becomes a transparent WebP", async () => {
    // Two 40 × 40 figures on one board.
    const raw = rect(rect(blank(200, 100), 30, 30, 40, 40, RED), 130, 30, 40, 40, INK);
    const map: CropMap = {
      board: "synthetic.png",
      background: PAPER,
      tolerance: T,
      assets: { pip: { kind: "character", name: "Pip", version: 1, flippable: true } },
      figures: [
        { key: "pip", pose: "front", expression: "happy", box: { x: 20, y: 20, w: 60, h: 60 }, face: null, foot: null, holes: [], holeCandidates: [], tolerance: null, ignore: false },
        { key: "pip", pose: "front", expression: "sad", box: { x: 120, y: 20, w: 60, h: 60 }, face: null, foot: null, holes: [], holeCandidates: [], tolerance: null, ignore: false },
      ],
    };
    const out = mkdtempSync(join(tmpdir(), "assets-s1-"));
    await cutBoard(map, raw, { outDir: out, review: false, log: () => {} });
    const dir = join(out, "pip", "v1");
    expect(readdirSync(dir).filter((f) => f.endsWith(".webp")).sort()).toEqual(["front-happy.webp", "front-sad.webp"]);
    for (const file of ["front-happy.webp", "front-sad.webp"]) {
      const { data, info } = await sharp(readFileSync(join(dir, file))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const img = { data: new Uint8Array(data), width: info.width };
      // Trimmed to the alpha bounds: 40 × 40, the square itself.
      expect([info.width, info.height]).toEqual([40, 40]);
      // Transparent where the paper was: the trimmed square has no paper, so check the trim origin instead.
      const origin = JSON.parse(readFileSync(join(dir, `${file}.trim.json`), "utf8"));
      expect(origin).toEqual(file === "front-happy.webp" ? { x: 30, y: 30 } : { x: 130, y: 30 });
      // 2 px feather: the outermost pixel is softened, a pixel 3 px inside is not.
      expect(alphaAt(img, 0, 20)).toBeLessThan(255);
      expect(alphaAt(img, 0, 20)).toBeGreaterThan(0);
      expect(alphaAt(img, 3, 20)).toBe(255);
      expect(alphaAt(img, 20, 20)).toBe(255);
    }
  });

  it("REG-02.S1 a figure with transparent corners keeps them transparent", async () => {
    const raw = disk(blank(100, 100), 50, 50, 30, RED);
    const cut = cutFigure(raw, PAPER, figure({ x: 0, y: 0, w: 100, h: 100 }));
    const { data, info } = await sharp(await encodeWebp(cut)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = { data: new Uint8Array(data), width: info.width };
    expect([info.width, info.height]).toEqual([61, 61]);
    for (const [x, y] of [[0, 0], [60, 0], [0, 60], [60, 60]] as const) expect(alphaAt(img, x, y)).toBe(0);
    expect(alphaAt(img, 30, 30)).toBe(255);
  });

  it("REG-02.S2 the manifest holds measured values", () => {
    // 30 × 40 RGBA image. Opaque: rows 5 to 34, columns 4 to 24; the lowest row spans 8 to 20.
    const width = 30;
    const height = 40;
    const data = new Uint8Array(width * height * 4);
    const set = (x: number, y: number, a: number) => (data[(y * width + x) * 4 + 3] = a);
    for (let y = 5; y <= 33; y++) for (let x = 4; x <= 24; x++) set(x, y, 255);
    for (let x = 8; x <= 20; x++) set(x, 34, 200);
    // Below the 128 threshold: not opaque, not part of the box or the foot row.
    set(14, 36, 100);
    const m = measureImage({ data, width, height }, { origin: { x: 100, y: 200 }, face: { x: 110, y: 210, w: 10, h: 8 }, foot: null });
    expect(m.box).toEqual({ x: 4, y: 5, w: 21, h: 30 });
    expect(m.foot).toEqual({ x: 14, y: 35 });
    expect(m.face).toEqual({ x: 10, y: 10, w: 10, h: 8 });
  });

  it("measureImage translates face by the trim origin and clamps it", () => {
    const width = 20;
    const height = 20;
    const data = new Uint8Array(width * height * 4).fill(255);
    const origin = { x: 50, y: 60 };
    const m = measureImage({ data, width, height }, { origin, face: { x: 45, y: 70, w: 10, h: 30 }, foot: { x: 58, y: 81 } });
    // x 45..55 becomes -5..5, clamped to 0..5; y 70..100 becomes 10..40, clamped to 10..20.
    expect(m.face).toEqual({ x: 0, y: 10, w: 5, h: 10 });
    // A manual foot is translated by the trim origin.
    expect(m.foot).toEqual({ x: 8, y: 21 });
    const none = measureImage({ data, width, height }, { origin, face: null, foot: null });
    expect(none.face).toBeUndefined();
    expect(none.foot).toEqual({ x: 10, y: 20 });
  });
});
