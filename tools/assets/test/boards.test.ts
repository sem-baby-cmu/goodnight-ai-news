import { describe, expect, it } from "vitest";
import { CHARACTER_BOARDS, MERGE_GAP, PROP_BOARDS, PROP_KEYS, proposeCropMap } from "../src/crops";
import { boardBackground, cutFigure, detectFigures } from "../src/image";
import { readBoard } from "../src/io";
import { loadCropMap } from "../src/pipeline";

// These tests read the real Producer boards in `modules/material/00_storybook_design/`.

describe("real boards", () => {
  it("lists 13 character boards and 5 prop boards", () => {
    expect(CHARACTER_BOARDS).toHaveLength(13);
    expect(PROP_BOARDS).toEqual(Object.keys(PROP_KEYS));
  });

  it("detectFigures finds rows [4,6,4,6] on every character board", async () => {
    const counts: Record<string, number[]> = {};
    for (const board of CHARACTER_BOARDS) {
      const raw = await readBoard(board);
      counts[board] = detectFigures(raw, boardBackground(raw), "character").map((row) => row.length);
    }
    expect(counts).toEqual(Object.fromEntries(CHARACTER_BOARDS.map((b) => [b, [4, 6, 4, 6]])));
  }, 120_000);

  it("detectFigures count equals PROP_KEYS length on every prop board", async () => {
    const counts: Record<string, number> = {};
    for (const board of PROP_BOARDS) {
      const raw = await readBoard(board);
      counts[board] = detectFigures(raw, boardBackground(raw), "prop", MERGE_GAP[board] ?? 0).flat().length;
    }
    expect(counts).toEqual(Object.fromEntries(PROP_BOARDS.map((b) => [b, PROP_KEYS[b]!.length])));
  }, 120_000);

  it("Pip's angry and surprised busts keep their body (tolerance 12)", async () => {
    // Their ears are 1 px from the neighbours' ears. At T = 10 the body joins a
    // neighbour piece that touches the box edge and is dropped (planner decision:
    // per-figure tolerance 12 on figures 6 and 7 only).
    const board = "character-board-00-robot";
    const map = loadCropMap(board);
    const raw = await readBoard(board);
    const area = (i: number) => {
      const f = map.figures[i]!;
      const cut = cutFigure(raw, map.background, { index: i, key: f.key!, pose: f.pose, box: f.box, holes: f.holes, tolerance: f.tolerance ?? map.tolerance }, () => {});
      let opaque = 0;
      for (let p = 3; p < cut.data.length; p += 4) if (cut.data[p]! >= 128) opaque++;
      return opaque;
    };
    const busts = [4, 5, 6, 7, 8, 9];
    expect(busts.map((i) => map.figures[i]!.pose)).toEqual(["bust", "bust", "bust", "bust", "bust", "bust"]);
    const areas = busts.map(area);
    const sorted = [...areas].sort((a, b) => a - b);
    const median = (sorted[2]! + sorted[3]!) / 2;
    for (const i of [6, 7]) {
      expect(map.figures[i]!.tolerance, `figure ${i}`).toBe(12);
      expect(Math.abs(areas[busts.indexOf(i)]! - median) / median, `figure ${i} area ${areas[busts.indexOf(i)]} median ${median}`).toBeLessThanOrEqual(0.05);
    }
    // Every other figure on the board stays at the board tolerance.
    expect(map.figures.filter((f, i) => i !== 6 && i !== 7 && f.tolerance !== null)).toEqual([]);
  }, 60_000);

  it("proposeCropMap on character-board-00-robot names 14 figures and ignores 6", async () => {
    const map = await proposeCropMap("character-board-00-robot");
    expect(map.board).toBe("character-board-00-robot.png");
    expect(map.tolerance).toBe(10);
    expect(map.assets).toEqual({ pip: { kind: "character", name: "Pip", version: 1, flippable: true } });
    expect(map.figures).toHaveLength(20);
    expect(map.figures.filter((f) => !f.ignore)).toHaveLength(14);
    expect(map.figures.filter((f) => f.ignore)).toHaveLength(6);
    const label = (i: number) => `${map.figures[i]!.key}/${map.figures[i]!.pose}/${map.figures[i]!.expression}`;
    expect(label(0)).toBe("pip/front/happy");
    expect(label(4)).toBe("pip/bust/happy");
    expect(label(9)).toBe("pip/bust/thinking");
    expect(label(13)).toBe("pip/read/happy");
    // The back view has no face box; the other named figures have a draft.
    expect(map.figures[3]!.face).toBeNull();
    expect(map.figures[0]!.face).not.toBeNull();
    // Character boards record hole candidates but apply none.
    expect(map.figures.every((f) => f.holes.length === 0)).toBe(true);
  }, 60_000);
});
