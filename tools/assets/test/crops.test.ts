import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHARACTER_BOARDS, CropMapSchema, PROP_BOARDS } from "../src/crops";
import { CROPS_DIR } from "../src/paths";

function committedMaps() {
  return readdirSync(CROPS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, map: CropMapSchema.parse(JSON.parse(readFileSync(join(CROPS_DIR, file), "utf8"))) }));
}

describe("committed crop maps", () => {
  it("every committed crop map parses with CropMapSchema and has no null key", () => {
    const maps = committedMaps();
    expect(maps.map((m) => m.file)).toEqual([...CHARACTER_BOARDS, ...PROP_BOARDS].map((b) => `${b}.json`).sort());
    for (const { file, map } of maps) {
      expect(map.board, file).toBe(file.replace(/\.json$/, ".png"));
      expect(map.figures.filter((f) => f.key === null), file).toEqual([]);
      for (const f of map.figures) expect(map.assets[f.key!], `${file} ${f.key}`).toBeDefined();
    }
  });

  it("every asset key across the 18 crop maps is unique", () => {
    const keys = committedMaps().flatMap(({ map }) => Object.keys(map.assets));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(55);
  });

  it("every crop map asset has a one-line description and version 2, except pip on the robot board", () => {
    let described = 0;
    for (const file of readdirSync(CROPS_DIR).filter((f) => f.endsWith(".json")).sort()) {
      const raw = JSON.parse(readFileSync(join(CROPS_DIR, file), "utf8")) as {
        assets: Record<string, { description?: string; version: number }>;
      };
      for (const [key, asset] of Object.entries(raw.assets)) {
        if (file === "character-board-00-robot.json" && key === "pip") {
          expect(asset.description, `${file} ${key}`).toBeUndefined();
          expect(asset.version, `${file} ${key}`).toBe(1);
          continue;
        }
        expect(asset.description, `${file} ${key}`).toMatch(/^[a-z][^\n]{0,79}$/);
        expect(asset.description!.endsWith("."), `${file} ${key}`).toBe(false);
        expect(asset.version, `${file} ${key}`).toBe(2);
        if (asset.description !== undefined) described++;
      }
    }
    expect(described).toBe(54);
  });
});
