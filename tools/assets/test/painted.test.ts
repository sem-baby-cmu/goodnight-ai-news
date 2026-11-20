// Painted backdrops (#74, ADR 0016 section 1 and Decisions A and D, design
// "8. Asset pipeline"): the source paintings come from R2 into an untracked
// cache, are checked against the tracked SHA-256 source list, and become one
// 2400 x 1200 WebP per variant within the file budget. The paintings are
// synthetic (sharp), R2 is the fake, and every folder is temporary. No test
// hard-codes a digest or a byte size.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { manifestFiles, type PoseEntry } from "@storybook/dsl";
import type { AssetBuild } from "../src/build";
import { AssetBuildSchema } from "../src/build";
import { main } from "../src/cli";
import { buildPaintedBackdrop, MAX_BACKDROP_WEBP_BYTES, SourceListSchema } from "../src/painted";
import { CACHE_DIR, PAINTINGS_DIR, REPO_ROOT } from "../src/paths";
import { runPublish } from "../src/publish";
import { mulberry32 } from "../src/sfx/synth";
import { fakeWrangler, isPut } from "./fake-wrangler";

// `main` imports the real runWrangler; this file replaces it with the fake of
// the running test, so no test can start the real wrangler.
const wrangler = vi.hoisted(() => ({ current: undefined as undefined | ((args: string[]) => Promise<string>) }));
vi.mock("../src/wrangler", () => ({
  runWrangler: (args: string[]) => {
    if (!wrangler.current) throw new Error(`no fake wrangler for: ${args.join(" ")}`);
    return wrangler.current(args);
  },
}));

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));
const quiet = () => {
  const lines: string[] = [];
  return { lines, log: (l: string) => lines.push(l), error: (l: string) => lines.push(l) };
};

// ADR 0016 Decision A.
const RIVERBANK = "a grassy bank by a wide, slow river";
const SKIES = ["day", "dusk", "night"] as const;
const PREFIX = "storybook-mvp/sources/backdrops/riverbank/v1/";

// A deterministic smooth gradient, opaque RGB; `blue` differs per sky.
function gradient(width: number, height: number, blue: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      data[i] = Math.round((255 * x) / (width - 1));
      data[i + 1] = Math.round((255 * y) / (height - 1));
      data[i + 2] = blue;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

// The gradient with alpha, and one pixel fully transparent.
function withHole(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++) data[i * 4] = Math.round((255 * (i % width)) / (width - 1));
  data[(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4 + 3] = 0;
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

// Full-range RGB noise from a seeded mulberry32: its WebP is over the budget.
function noise(width: number, height: number, seed: number): Promise<Buffer> {
  const next = mulberry32(seed);
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(next() * 256);
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

type Variant = { sky: string; source: string; bytes: Buffer };
type SourceList = { key: string; version: number; name: string; description: string; variants: Array<{ sky: string; source: string; sha256: string }> };

// Temporary out, paintings, cache and reviews folders; the fake R2 holds each
// variant under sources/backdrops/riverbank/v1/; the source list names the
// digest of each generated file.
function setup(variants: Variant[], change: (list: SourceList) => void = () => {}) {
  const root = tmp("assets-painted-");
  const out = join(root, "out");
  const paintings = join(root, "paintings");
  const cache = join(root, "cache");
  const reviews = join(root, "reviews");
  mkdirSync(paintings, { recursive: true });
  const fake = fakeWrangler();
  wrangler.current = fake.runWrangler;
  for (const v of variants) fake.objects.set(`${PREFIX}${v.source}`, v.bytes);
  const list: SourceList = {
    key: "riverbank",
    version: 1,
    name: "Riverbank",
    description: RIVERBANK,
    variants: variants.map((v) => ({ sky: v.sky, source: v.source, sha256: sha(v.bytes) })),
  };
  change(list);
  writeFileSync(join(paintings, "riverbank-v1.json"), `${JSON.stringify(list, null, 2)}\n`);
  const argv = (o = out) => ["backdrop", "riverbank", "--version", "1", "--local", "--out", o, "--paintings", paintings, "--cache", cache];
  return { root, out, paintings, cache, reviews, fake, list, argv };
}
const gets = (calls: string[][]) => calls.filter((c) => c[0] === "r2" && c[1] === "object" && c[2] === "get");
const webp = (out: string, sky: string) => readFileSync(join(out, "riverbank/v1", `${sky}.webp`));

// The synthetic layer builds of backdrop.test.ts: the review sheet needs a
// character, a prop, and a scenery.
const FRONT: PoseEntry = { id: "front", file: "front.webp", foot: { x: 30, y: 200 }, box: { x: 0, y: 0, w: 100, h: 200 }, face: { x: 20, y: 20, w: 60, h: 60 } };
// The template slot "bust" holds only the pose `bust` (packages/layout templates).
const BUST: PoseEntry = { id: "bust", file: "bust.webp", foot: { x: 75, y: 300 }, box: { x: 0, y: 0, w: 150, h: 300 }, face: { x: 30, y: 30, w: 90, h: 90 } };
const DEFAULT: PoseEntry = { id: "default", file: "default.webp", foot: { x: 50, y: 100 }, box: { x: 0, y: 0, w: 100, h: 100 } };
function layer(key: string, kind: "character" | "prop" | "scenery", poses: PoseEntry[]): AssetBuild {
  return { key, kind, name: key, version: 1, renderer: "webp", manifest: { kind, poses, expressions: [], legal: [], flippable: true } };
}
function writeBuild(out: string, build: AssetBuild): void {
  const dir = join(out, build.key, `v${build.version}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "asset.json"), JSON.stringify(build));
  for (const name of manifestFiles(build.manifest)) writeFileSync(join(dir, name), `bytes of ${build.key} v${build.version} ${name}`);
}

let paintings: Variant[] = [];
let smallValid: Buffer;
beforeAll(async () => {
  paintings = await Promise.all(SKIES.map(async (sky, i) => ({ sky, source: `${sky}.png`, bytes: await gradient(4800, 2400, 200 - i * 80) })));
  smallValid = await gradient(2400, 1200, 90);
}, 60_000);

describe("painted backdrop", () => {
  it("REG-02.S7 a painted backdrop is scaled, compressed, and reviewed", async () => {
    const s = setup(paintings);
    const io = quiet();
    expect(await main(s.argv(), io), io.lines.join("\n")).toBe(0);
    for (const sky of SKIES) {
      const bytes = webp(s.out, sky);
      const meta = await sharp(bytes).metadata();
      expect([meta.format, meta.width, meta.height], sky).toEqual(["webp", 2400, 1200]);
      expect(bytes.length, sky).toBeLessThanOrEqual(MAX_BACKDROP_WEBP_BYTES);
    }
    const build = AssetBuildSchema.parse(JSON.parse(readFileSync(join(s.out, "riverbank/v1/asset.json"), "utf8")));
    expect(build.kind).toBe("backdrop");
    expect(build.renderer).toBe("webp");
    if (build.manifest.kind !== "backdrop") throw new Error("not a backdrop manifest");
    expect(build.manifest.description).toBe(RIVERBANK);
    expect(build.manifest.variants).toEqual(SKIES.map((sky) => ({ sky, file: `${sky}.webp` })));

    for (const b of [layer("kit", "character", [FRONT, BUST]), layer("crate", "prop", [DEFAULT]), layer("tree", "scenery", [DEFAULT])]) writeBuild(s.out, b);
    expect(await main(["review", "riverbank", "--version", "1", "--out", s.out], io), io.lines.join("\n")).toBe(0);
    for (const sky of SKIES) {
      const meta = await sharp(join(s.out, "review", `riverbank-v1-${sky}.png`)).metadata();
      expect([meta.format, meta.width, meta.height], sky).toEqual(["png", 2400, 1200]);
    }
    expect(await main(["approve", "riverbank", "--version", "1", "--out", s.out, "--reviews", s.reviews], io), io.lines.join("\n")).toBe(0);
    expect(existsSync(join(s.reviews, "riverbank-v1.json"))).toBe(true);
    const pub = quiet();
    expect(await runPublish({ mode: "local", outDir: s.out, reviewsDir: s.reviews }, { runWrangler: s.fake.runWrangler, ...pub }), pub.lines.join("\n")).toBe(0);
    const puts = s.fake.calls.filter(isPut);
    for (const sky of SKIES) {
      const key = `storybook-mvp/assets/riverbank/v1/${sky}.webp`;
      expect(s.fake.objects.get(key), key).toEqual(webp(s.out, sky));
      const put = puts.find((c) => c[3] === key);
      expect(put?.[put.indexOf("--content-type") + 1], key).toBe("image/webp");
    }
  }, 120_000);

  it("a second run with the same cache makes no r2 object get call and writes byte-identical WebP files", async () => {
    const s = setup(paintings);
    expect(await main(s.argv(), quiet())).toBe(0);
    expect(gets(s.fake.calls).map((c) => c[3])).toEqual(SKIES.map((sky) => `${PREFIX}${sky}.png`));
    const before = s.fake.calls.length;
    const second = join(s.root, "out2");
    expect(await main(s.argv(second), quiet())).toBe(0);
    expect(gets(s.fake.calls.slice(before))).toEqual([]);
    for (const sky of SKIES) expect(webp(second, sky).equals(webp(s.out, sky)), sky).toBe(true);
  }, 120_000);

  it("a cached file with other bytes is downloaded again", async () => {
    const s = setup(paintings);
    expect(await main(s.argv(), quiet())).toBe(0);
    const cached = join(s.cache, "riverbank/v1/day.png");
    writeFileSync(cached, "other bytes");
    const before = s.fake.calls.length;
    const io = quiet();
    expect(await main(s.argv(join(s.root, "out2")), io), io.lines.join("\n")).toBe(0);
    expect(gets(s.fake.calls.slice(before)).map((c) => c[3])).toEqual([`${PREFIX}day.png`]);
    expect(sha(readFileSync(cached))).toBe(s.list.variants[0]!.sha256);
  }, 120_000);

  it("an R2 object with other bytes than the source list fails and writes nothing", async () => {
    const s = setup([{ sky: "day", source: "day.png", bytes: smallValid }]);
    s.fake.objects.set(`${PREFIX}day.png`, await gradient(2400, 1200, 10));
    const io = quiet();
    expect(await main(s.argv(), io)).toBe(1);
    expect(io.lines.join("\n")).toContain("day.png");
    expect(io.lines.join("\n")).toContain("does not match the source list");
    expect(existsSync(join(s.out, "riverbank"))).toBe(false);
  }, 60_000);

  it("a missing R2 object fails and writes nothing", async () => {
    const s = setup([{ sky: "day", source: "day.png", bytes: smallValid }]);
    s.fake.objects.delete(`${PREFIX}day.png`);
    const io = quiet();
    expect(await main(s.argv(), io)).toBe(1);
    expect(io.lines.join("\n")).toContain("day.png");
    expect(existsSync(join(s.out, "riverbank"))).toBe(false);
  }, 60_000);

  it.each([
    ["3000 x 1200", () => gradient(3000, 1200, 90), "exactly 2:1"],
    ["2000 x 1000", () => gradient(2000, 1000, 90), "at least 2400 x 1200"],
    ["one transparent pixel", () => withHole(2400, 1200), "transparent pixels"],
  ])("a painting of %s fails and writes nothing", async (_name, make, message) => {
    const s = setup([{ sky: "day", source: "day.png", bytes: await make() }]);
    const io = quiet();
    expect(await main(s.argv(), io)).toBe(1);
    expect(io.lines.join("\n")).toContain(message);
    expect(existsSync(join(s.out, "riverbank"))).toBe(false);
  }, 60_000);

  it("a painting whose WebP is over the budget fails, names the byte count, and writes nothing", async () => {
    const s = setup([{ sky: "day", source: "day.png", bytes: await noise(2400, 1200, 7) }]);
    const io = quiet();
    expect(await main(s.argv(), io)).toBe(1);
    const line = io.lines.find((l) => l.includes(`bytes; the budget is ${MAX_BACKDROP_WEBP_BYTES}`));
    expect(line, io.lines.join("\n")).toBeDefined();
    const bytes = Number(/(\d+) bytes;/.exec(line!)?.[1]);
    expect(bytes).toBeGreaterThan(MAX_BACKDROP_WEBP_BYTES);
    expect(existsSync(join(s.out, "riverbank"))).toBe(false);
  }, 60_000);

  it("a source list with two day variants fails", async () => {
    const s = setup([{ sky: "day", source: "day.png", bytes: smallValid }], (list) => {
      list.variants.push({ ...list.variants[0]!, source: "day-2.png" });
    });
    expect(SourceListSchema.safeParse(s.list).success).toBe(false);
    expect(await main(s.argv(), quiet())).toBe(1);
    expect(gets(s.fake.calls)).toEqual([]);
    expect(existsSync(join(s.out, "riverbank"))).toBe(false);
  });

  it("a source list whose key differs from its file name fails", async () => {
    const s = setup([{ sky: "day", source: "day.png", bytes: smallValid }], (list) => {
      list.key = "village-square";
    });
    expect(SourceListSchema.safeParse(s.list).success).toBe(true);
    expect(await main(s.argv(), quiet())).toBe(1);
    expect(gets(s.fake.calls)).toEqual([]);
    expect(existsSync(join(s.out, "riverbank"))).toBe(false);
  });

  it("backdrop needs exactly one of --local and --remote", async () => {
    const s = setup([{ sky: "day", source: "day.png", bytes: smallValid }]);
    const paths = ["--out", s.out, "--paintings", s.paintings, "--cache", s.cache];
    for (const flags of [[], ["--local", "--remote"]]) {
      const io = quiet();
      expect(await main(["backdrop", "riverbank", "--version", "1", ...flags, ...paths], io), flags.join(" ")).toBe(1);
      expect(io.lines.join("\n")).toContain("backdrop: pass exactly one of --local and --remote");
    }
    expect(s.fake.calls).toEqual([]);
  });

  it("buildPaintedBackdrop takes the paths and wrangler as parameters", async () => {
    const s = setup([{ sky: "day", source: "day.png", bytes: smallValid }]);
    wrangler.current = undefined;
    const io = quiet();
    const code = await buildPaintedBackdrop(
      { key: "riverbank", version: 1, mode: "remote", outDir: s.out, paintingsDir: s.paintings, cacheDir: s.cache },
      { runWrangler: s.fake.runWrangler, ...io },
    );
    expect(code, io.lines.join("\n")).toBe(0);
    expect(gets(s.fake.calls).map((c) => c.at(-1))).toEqual(["--remote"]);
    expect(statSync(join(s.out, "riverbank/v1/day.webp")).size).toBeLessThanOrEqual(MAX_BACKDROP_WEBP_BYTES);
  }, 60_000);

  it("PAINTINGS_DIR is tools/assets/paintings and CACHE_DIR is tools/assets/cache", () => {
    expect(PAINTINGS_DIR).toBe(join(REPO_ROOT, "tools/assets/paintings"));
    expect(CACHE_DIR).toBe(join(REPO_ROOT, "tools/assets/cache"));
  });
});
