import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { AssetBuildSchema } from "../src/build";
import { main } from "../src/cli";

// Runs cut and measure for every tracked board into a temporary directory, so
// the test does not need the untracked tools/assets/out/ (implementation decision R50).
let out = "";

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "assets-build-"));
  const quiet = { log: () => {} };
  expect(await main(["cut", "--all", "--out", out], quiet)).toBe(0);
  expect(await main(["measure", "--all", "--out", out], quiet)).toBe(0);
}, 600_000);

describe("build output", () => {
  it("measure output validates for all boards", () => {
    const keys = readdirSync(out).filter((d) => d !== "review" && existsSync(join(out, d, "v1", "asset.json")));
    expect(keys).toHaveLength(55);
    let characters = 0;
    for (const key of keys) {
      const build = AssetBuildSchema.parse(JSON.parse(readFileSync(join(out, key, "v1", "asset.json"), "utf8")));
      expect(build.key).toBe(key);
      expect(build.renderer).toBe("webp");
      const webps = readdirSync(join(out, key, "v1")).filter((f) => f.endsWith(".webp"));
      if (build.kind === "character") {
        characters++;
        expect(webps, key).toHaveLength(14);
      } else {
        expect(webps, key).toEqual(["default.webp"]);
      }
      if (build.manifest.kind === "sfx") throw new Error(`${key} is not a visual asset`);
      expect(build.manifest.poses.map((p) => p.file).sort(), key).toEqual([...webps].sort());
    }
    expect(characters).toBe(13);
  });
});
