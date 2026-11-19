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
});
