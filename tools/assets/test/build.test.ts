import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { AssetBuildSchema } from "../src/build";
import { main } from "../src/cli";
import { buildSql, loadLocalBuilds, planPublish } from "../src/publish";
import { v7 } from "uuid";
import { migratedDb } from "./fake-wrangler";

// Runs cut and measure for every tracked board into a temporary directory, so
// the test does not need the untracked tools/assets/out/ (implementation decision R50).
// REG-01.S1 (#21) reuses this output, so CI cuts the boards once (implementation decision).
let out = "";

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "assets-build-"));
  const quiet = { log: () => {} };
  expect(await main(["cut", "--all", "--out", out, "--no-review"], quiet)).toBe(0);
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

describe("registry", () => {
  it("REG-01.S1 the registry holds every Producer character", () => {
    const local = loadLocalBuilds({ outDir: out });
    const plan = planPublish(local, []);
    expect(plan.errors).toEqual([]);
    const db = migratedDb();
    db.exec(buildSql(plan, new Date().toISOString(), v7));
    const assets = db.prepare("SELECT key, kind FROM asset").all() as Array<{ key: string; kind: string }>;
    expect(assets).toHaveLength(55);
    expect(new Set(assets.map((a) => a.key)).size).toBe(assets.length);
    const characters = assets.filter((a) => a.kind === "character").map((a) => a.key);
    expect(new Set(characters).size).toBe(13);
    const active = db
      .prepare("SELECT a.key AS key, a.kind AS kind, COUNT(*) AS n, MAX(v.manifest) AS manifest FROM asset a JOIN asset_version v ON v.asset_id = a.id AND v.active = 1 GROUP BY a.id")
      .all() as Array<{ key: string; kind: string; n: number; manifest: string }>;
    expect(active).toHaveLength(assets.length);
    for (const row of active) {
      expect(row.n, row.key).toBe(1);
      if (row.kind !== "character") continue;
      const manifest = JSON.parse(row.manifest) as { poses: unknown[]; expressions: unknown[] };
      expect(manifest.poses.length, row.key).toBeGreaterThan(0);
      expect(manifest.expressions.length, row.key).toBeGreaterThan(0);
    }
  });
});
