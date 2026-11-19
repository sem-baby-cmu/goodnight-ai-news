import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type AssetBuild, AssetBuildSchema } from "../src/build";
import { main } from "../src/cli";
import { SOURCES_DIR } from "../src/paths";
import { buildSql, type ExistingRow, loadLocalBuilds, type Plan, planPublish, runPublish } from "../src/publish";
import { sanitizeSvg } from "../src/svg";
import { fakeWrangler, isFile, isPut, migratedDb } from "./fake-wrangler";

const NOW = "2026-11-19T12:00:00.000Z";
// Unique across the file, as UUID v7 IDs are.
let idCount = 0;
const ids = () => () => `0193a000-0000-7000-8000-${String(++idCount).padStart(12, "0")}`;

const POSE = { id: "front", file: "front-happy.webp", foot: { x: 50, y: 100 }, box: { x: 0, y: 0, w: 100, h: 100 }, expression: "happy" };
function webp(key = "pip", version = 1, files = [POSE.file]): AssetBuild {
  return {
    key,
    kind: "character",
    name: "Pip",
    version,
    renderer: "webp",
    manifest: {
      kind: "character",
      poses: files.map((file, i) => ({ ...POSE, id: i === 0 ? "front" : `pose-${i}`, file })),
      expressions: ["happy"],
      legal: files.map((_, i) => ({ pose: i === 0 ? "front" : `pose-${i}`, expression: "happy" })),
      flippable: true,
    },
  };
}
function sfx(key = "sfx-pop"): AssetBuild {
  return { key, kind: "sfx", name: "Pop", version: 1, renderer: "audio", manifest: { kind: "sfx", file: `${key}.wav`, durationMs: 120 } };
}
const pipV2 = (): AssetBuild => AssetBuildSchema.parse(JSON.parse(readFileSync(join(SOURCES_DIR, "pip/v2/asset.json"), "utf8")));
const pipSvg = () => readFileSync(join(SOURCES_DIR, "pip/v2/pip.svg"), "utf8");

// Writes `build` to <out>/<folder>/ with one file per name in its manifest.
function writeBuild(out: string, build: AssetBuild, files: Record<string, string | Buffer> = {}, folder = `${build.key}/v${build.version}`): void {
  const dir = join(out, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "asset.json"), JSON.stringify(build));
  const names = build.manifest.kind === "sfx" ? [build.manifest.file] : build.manifest.poses.map((p) => p.file);
  for (const name of names) writeFileSync(join(dir, name), files[name] ?? `bytes of ${build.key} v${build.version} ${name}`);
}
const tmpOut = () => mkdtempSync(join(tmpdir(), "assets-publish-"));
const existingOf = (builds: AssetBuild[]): ExistingRow[] => builds.map((b) => ({ key: b.key, kind: b.kind, version: b.version, manifest: b.manifest }));
const quiet = () => {
  const lines: string[] = [];
  return { lines, log: (l: string) => lines.push(l), error: (l: string) => lines.push(l) };
};
type Row = { key: string; version: number; renderer: string; active: number; asset_id: string; r2_prefix: string };
const rows = (db: ReturnType<typeof migratedDb>) =>
  db
    .prepare("SELECT a.key AS key, v.version AS version, v.renderer AS renderer, v.active AS active, v.asset_id AS asset_id, v.r2_prefix AS r2_prefix FROM asset a JOIN asset_version v ON v.asset_id = a.id ORDER BY a.key, v.version")
    .all() as unknown as Row[];
const seed = (db: ReturnType<typeof migratedDb>, builds: AssetBuild[]) => db.exec(buildSql({ skip: [], create: builds, errors: [] }, NOW, ids()));

describe("planPublish", () => {
  it("planPublish skips an existing equal version", () => {
    const v1 = webp();
    expect(planPublish([v1], existingOf([webp()]))).toEqual({ skip: [v1], create: [], errors: [] });
  });

  it("planPublish errors on an existing version with a different manifest and writes nothing", async () => {
    const out = tmpOut();
    const changed = webp();
    if (changed.manifest.kind === "sfx") throw new Error("not sfx");
    changed.manifest.flippable = false;
    writeBuild(out, changed);
    const fake = fakeWrangler();
    seed(fake.db, [webp()]);
    const io = quiet();
    expect(await runPublish({ mode: "local", outDir: out }, { runWrangler: fake.runWrangler, ...io })).toBe(1);
    expect(io.lines.join("\n")).toContain("pip v1 differs from the published version; bump the version");
    expect(fake.calls.filter((c) => isPut(c) || isFile(c))).toEqual([]);
    expect(fake.objects.size).toBe(0);
  });

  it("planPublish errors on a kind change", () => {
    const plan = planPublish([webp("pip", 2)], [{ key: "pip", kind: "prop", version: 1, manifest: webp().manifest }]);
    expect(plan.create).toEqual([]);
    expect(plan.errors.join(" ")).toMatch(/pip.*prop.*character/);
  });

  it("planPublish creates a key with no row and a key with an asset row but no version", () => {
    const plan = planPublish([webp(), sfx()], [{ key: "sfx-pop", kind: "sfx", version: null, manifest: null }]);
    expect(plan).toEqual({ skip: [], create: [webp(), sfx()], errors: [] });
  });

  it("REG-02.S4 planPublish creates an svg-rig version of a key whose active version is webp", () => {
    const v1 = webp();
    const v2 = pipV2();
    const plan = planPublish([v1, v2], existingOf([webp()]));
    expect(plan).toEqual({ skip: [v1], create: [v2], errors: [] });
    const db = migratedDb();
    seed(db, [webp()]);
    db.exec(buildSql(plan, NOW, ids()));
    const pip = rows(db);
    expect(pip.map((r) => [r.version, r.renderer, r.active])).toEqual([
      [1, "webp", 0],
      [2, "svg-rig", 1],
    ]);
    expect(new Set(pip.map((r) => r.asset_id)).size).toBe(1);
  });
});

describe("buildSql", () => {
  it("buildSql escapes a single quote in name and manifest", () => {
    const build = webp("pip", 1, ["it's.webp"]);
    build.name = "Pip's friend";
    const sql = buildSql({ skip: [], create: [build], errors: [] }, NOW, ids());
    expect(sql).toContain("'Pip''s friend'");
    expect(sql).toContain("it''s.webp");
    const db = migratedDb();
    db.exec(sql);
    const row = db.prepare("SELECT a.name AS name, v.manifest AS manifest FROM asset a JOIN asset_version v ON v.asset_id = a.id").get() as { name: string; manifest: string };
    expect(row.name).toBe("Pip's friend");
    expect(JSON.parse(row.manifest)).toEqual(build.manifest);
  });

  it("REG-01.S2 buildSql writes r2_prefix assets/<key>/v<n>/ with ON CONFLICT DO NOTHING inserts, then per key one UPDATE to active = 0 and one UPDATE to active = 1, after all INSERTs", () => {
    const db = migratedDb();
    seed(db, [webp()]);
    const plan: Plan = { skip: [webp()], create: [webp("pip", 2), sfx()], errors: [] };
    const sql = buildSql(plan, NOW, ids());
    const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
    const inserts = statements.filter((s) => s.startsWith("INSERT"));
    const updates = statements.filter((s) => s.startsWith("UPDATE"));
    expect(inserts).toHaveLength(4);
    expect(statements.slice(0, 4)).toEqual(inserts);
    for (const s of inserts) expect(s).toMatch(/ON CONFLICT\((key|asset_id, version)\) DO NOTHING$/);
    expect(sql).toContain("'assets/pip/v2/'");
    expect(sql).toContain("'assets/sfx-pop/v1/'");
    expect(sql).toContain(`'${NOW}'`);
    expect(sql).not.toMatch(/BEGIN|COMMIT/);
    // One pair per local key, in plan order: first active = 0, then active = 1.
    expect(updates.map((s) => [/key = '([^']+)'/.exec(s)?.[1], /SET active = (\d)/.exec(s)?.[1]])).toEqual([
      ["pip", "0"],
      ["pip", "1"],
      ["sfx-pop", "0"],
      ["sfx-pop", "1"],
    ]);
    // The SQL runs on the #16 schema, and a second run changes nothing.
    db.exec(sql);
    const once = rows(db);
    db.exec(buildSql(plan, NOW, ids()));
    expect(rows(db)).toEqual(once);
    expect(once.map((r) => [r.key, r.version, r.active, r.r2_prefix])).toEqual([
      ["pip", 1, 0, "assets/pip/v1/"],
      ["pip", 2, 1, "assets/pip/v2/"],
      ["sfx-pop", 1, 1, "assets/sfx-pop/v1/"],
    ]);
  });

  it("buildSql emits activation updates when all versions are skipped", () => {
    const sql = buildSql({ skip: [webp(), sfx()], create: [], errors: [] }, NOW, ids());
    expect(sql).not.toContain("INSERT");
    expect(sql.match(/UPDATE asset_version SET active = 0/g)).toHaveLength(2);
    expect(sql.match(/UPDATE asset_version SET active = 1/g)).toHaveLength(2);
    expect(sql).toContain("key = 'pip'");
    expect(sql).toContain("key = 'sfx-pop'");
  });

  it("buildSql activation repairs a key with two active-flag errors", () => {
    const db = migratedDb();
    seed(db, [webp(), webp("pip", 2)]);
    db.exec("UPDATE asset_version SET active = 0");
    db.exec(buildSql({ skip: [webp(), webp("pip", 2)], create: [], errors: [] }, NOW, ids()));
    expect(rows(db).map((r) => [r.version, r.active])).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });
});

describe("loadLocalBuilds", () => {
  it("loadLocalBuilds rejects an svg that sanitizeSvg would change", () => {
    const out = tmpOut();
    writeBuild(out, pipV2(), { "pip.svg": pipSvg() });
    expect(() => loadLocalBuilds({ outDir: out })).toThrow(/pip v2: pip\.svg .*sanitizeSvg/);
    writeBuild(out, pipV2(), { "pip.svg": sanitizeSvg(pipSvg()) });
    expect(loadLocalBuilds({ outDir: out })).toEqual([pipV2()]);
  });

  it("loadLocalBuilds rejects a folder name that does not match key and version", () => {
    const wrongVersion = tmpOut();
    writeBuild(wrongVersion, webp(), {}, "pip/v2");
    expect(() => loadLocalBuilds({ outDir: wrongVersion })).toThrow(/pip\/v2.*pip v1/);
    const wrongKey = tmpOut();
    writeBuild(wrongKey, webp(), {}, "pop/v1");
    expect(() => loadLocalBuilds({ outDir: wrongKey })).toThrow(/pop\/v1.*pip v1/);
  });

  it("loadLocalBuilds rejects a missing file, a bad kind and renderer pair, a checkSvg issue and a bad asset.json, and lists every error", () => {
    const out = tmpOut();
    // A build whose manifest names a file that is not in its folder.
    const ghost = webp("ghost");
    mkdirSync(join(out, "ghost/v1"), { recursive: true });
    writeFileSync(join(out, "ghost/v1/asset.json"), JSON.stringify(ghost));
    writeBuild(out, { ...sfx("sfx-pop"), renderer: "webp" });
    const badRig = pipV2();
    if (badRig.manifest.kind === "sfx") throw new Error("not sfx");
    badRig.manifest.expressions.push("sleepy");
    writeBuild(out, badRig, { "pip.svg": sanitizeSvg(pipSvg()) });
    mkdirSync(join(out, "broken/v1"), { recursive: true });
    writeFileSync(join(out, "broken/v1/asset.json"), JSON.stringify({ key: "broken" }));
    let message = "";
    try {
      loadLocalBuilds({ outDir: out });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/ghost v1: front-happy\.webp is missing/);
    expect(message).toMatch(/sfx-pop v1: kind sfx with renderer webp/);
    expect(message).toMatch(/pip v2: pip\.svg: .*svg_expression_missing/);
    expect(message).toMatch(/broken\/v1\/asset\.json/);
  });

  it("loadLocalBuilds --only limits the set and rejects an entry with no build", () => {
    const out = tmpOut();
    writeBuild(out, webp());
    writeBuild(out, sfx());
    expect(loadLocalBuilds({ outDir: out, only: ["sfx-pop@1"] })).toEqual([sfx()]);
    expect(() => loadLocalBuilds({ outDir: out, only: ["sfx-pop@1", "pip@3"] })).toThrow(/pip@3/);
    expect(() => loadLocalBuilds({ outDir: out, only: ["pip"] })).toThrow(/<key>@<n>/);
  });
});

describe("runPublish", () => {
  it("runPublish uploads every file before the d1 --file call", async () => {
    const out = tmpOut();
    writeBuild(out, webp("pip", 1, ["front-happy.webp", "side-sad.webp"]));
    writeBuild(out, sfx());
    const fake = fakeWrangler();
    const io = quiet();
    expect(await runPublish({ mode: "local", outDir: out }, { runWrangler: fake.runWrangler, ...io, newId: ids() })).toBe(0);
    const puts = fake.calls.map((c, i) => [c, i] as const).filter(([c]) => isPut(c));
    const file = fake.calls.findIndex(isFile);
    expect(puts.map(([c]) => c[3]).sort()).toEqual([
      "storybook-mvp/assets/pip/v1/front-happy.webp",
      "storybook-mvp/assets/pip/v1/side-sad.webp",
      "storybook-mvp/assets/sfx-pop/v1/sfx-pop.wav",
    ]);
    expect(file).toBeGreaterThan(Math.max(...puts.map(([, i]) => i)));
    const types = Object.fromEntries(puts.map(([c]) => [c[3], c[c.indexOf("--content-type") + 1]]));
    expect(types["storybook-mvp/assets/pip/v1/side-sad.webp"]).toBe("image/webp");
    expect(types["storybook-mvp/assets/sfx-pop/v1/sfx-pop.wav"]).toBe("audio/wav");
    for (const [key, bytes] of fake.objects) {
      const local = join(out, key.replace("storybook-mvp/assets/", ""));
      expect(bytes.equals(readFileSync(local)), key).toBe(true);
    }
    for (const c of fake.calls) {
      expect(c.filter((a) => a === "--local"), c.join(" ")).toHaveLength(1);
      expect(c).not.toContain("--remote");
    }
    expect(rows(fake.db).map((r) => [r.key, r.version, r.active])).toEqual([
      ["pip", 1, 1],
      ["sfx-pop", 1, 1],
    ]);
  });

  it("runPublish stops after a failed upload, before the d1 --file call", async () => {
    const out = tmpOut();
    writeBuild(out, webp("pip", 1, ["a.webp", "b.webp"]));
    const fake = fakeWrangler({ failOn: (c) => isPut(c) && c[3]!.endsWith("b.webp") });
    const io = quiet();
    expect(await runPublish({ mode: "local", outDir: out }, { runWrangler: fake.runWrangler, ...io })).toBe(1);
    expect(fake.calls.some(isFile)).toBe(false);
    expect(rows(fake.db)).toEqual([]);
  });

  it("runPublish twice: the second run skips every version, makes no put call, and still runs the activation file", async () => {
    const out = tmpOut();
    writeBuild(out, webp());
    writeBuild(out, sfx());
    const fake = fakeWrangler();
    expect(await runPublish({ mode: "local", outDir: out }, { runWrangler: fake.runWrangler, ...quiet() })).toBe(0);
    fake.calls.length = 0;
    const io = quiet();
    expect(await runPublish({ mode: "local", outDir: out }, { runWrangler: fake.runWrangler, ...io })).toBe(0);
    expect(fake.calls.filter(isPut)).toEqual([]);
    expect(fake.calls.filter(isFile)).toHaveLength(1);
    expect(io.lines.filter((l) => /^skip /.test(l)).sort()).toEqual(["skip pip v1 (exists)", "skip sfx-pop v1 (exists)"]);
    expect(io.lines.some((l) => /^put /.test(l))).toBe(false);
  });

  it("runPublish fails when a created version is missing after the d1 --file call", async () => {
    const out = tmpOut();
    writeBuild(out, webp());
    const fake = fakeWrangler({ ignoreFile: true });
    const io = quiet();
    expect(await runPublish({ mode: "local", outDir: out }, { runWrangler: fake.runWrangler, ...io })).toBe(1);
    expect(io.lines.join("\n")).toMatch(/pip v1 is missing/);
  });

  it("runPublish rejects an unexpected d1 output shape before any write", async () => {
    const out = tmpOut();
    writeBuild(out, webp());
    const calls: string[][] = [];
    const runWrangler = async (args: string[]) => {
      calls.push(args);
      return JSON.stringify({ results: [] });
    };
    const io = quiet();
    expect(await runPublish({ mode: "local", outDir: out }, { runWrangler, ...io })).toBe(1);
    expect(io.lines.join("\n")).toMatch(/unexpected output/);
    expect(calls).toHaveLength(1);
  });

  it("publish needs exactly one of --local and --remote", async () => {
    for (const args of [["publish"], ["publish", "--local", "--remote"]]) {
      const io = quiet();
      expect(await main([...args, "--out", tmpOut()], io), args.join(" ")).toBe(1);
      expect(io.lines.join(" ")).toMatch(/exactly one of --local and --remote/);
    }
  });
});
