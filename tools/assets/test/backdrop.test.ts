// Backdrops in the asset pipeline (#67, ADR 0016): the code-made `meadow`,
// the review sheet with the slot envelopes of all templates, and the approval.
// Expected values come from ADR 0016, design "8. Asset pipeline", and the
// DESIGN.md sky palette table. Approvals go to temporary folders only.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { manifestFiles, type PageScene, type PoseEntry, type RegistrySnapshot, SKY_PALETTES } from "@storybook/dsl";
import { layerBoxes, layoutScene, TEMPLATES } from "@storybook/layout";
import { SPIKE_REGISTRY_FIXTURE } from "../../../apps/storybook/src/spike/registry.fixture";
import { templatesDigest } from "../src/approval";
import { type SlotEnvelope, slotEnvelopes } from "../src/backdrop-review";
import { type AssetBuild, AssetBuildSchema } from "../src/build";
import { main } from "../src/cli";
import { MEADOW_COLOURS, writeMeadowBuild } from "../src/meadow";
import { REPO_ROOT, REVIEWS_DIR } from "../src/paths";
import { runPublish } from "../src/publish";
import { checkSvg, sanitizeSvg } from "../src/svg";
import { fakeWrangler, isPut } from "./fake-wrangler";

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const tmp = (prefix = "assets-backdrop-") => mkdtempSync(join(tmpdir(), prefix));
const quiet = () => {
  const lines: string[] = [];
  return { lines, log: (l: string) => lines.push(l), error: (l: string) => lines.push(l) };
};

// "Exact changes" item 5 of the #67 refinement.
const MEADOW_BUILD = {
  key: "meadow",
  kind: "backdrop",
  name: "Meadow",
  version: 1,
  renderer: "svg",
  manifest: {
    kind: "backdrop",
    description: "an open meadow with soft hills",
    size: { width: 2400, height: 1200 },
    variants: [
      { sky: "day", file: "day.svg" },
      { sky: "cloudy", file: "cloudy.svg" },
      { sky: "dusk", file: "dusk.svg" },
      { sky: "night", file: "night.svg" },
    ],
  },
};

// DESIGN.md, Sky palettes.
const DESIGN_COLOURS = {
  day: { sky: "#CFE6EE", far: "#C9DE9E", mid: "#A3CB6E", near: "#8DBC5C" },
  cloudy: { sky: "#DCE3E6", far: "#C3D3A0", mid: "#9EBC74", near: "#8AAD62" },
  dusk: { sky: "#F2D3B0", far: "#D1C98E", mid: "#AABA6A", near: "#93A85A" },
  night: { sky: "#2F4066", far: "#3D5A5E", mid: "#344E4B", near: "#2D443F" },
} as const;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// Points in the ground band (y 740 to 1200, the whole width) and in the open sky.
const NEAR_POINTS = [
  [0, 745],
  [400, 900],
  [1200, 741],
  [2000, 1000],
  [2399, 1199],
] as const;
const SKY_POINTS = [
  [1200, 100],
  [200, 300],
] as const;

// The synthetic layer builds: one character with poses `front` and `bust`,
// one prop, one scenery. The face box keeps layoutScene free of
// `layout.face-missing`; it does not change the envelope.
const FRONT: PoseEntry = { id: "front", file: "front.webp", foot: { x: 30, y: 200 }, box: { x: 0, y: 0, w: 100, h: 200 }, face: { x: 20, y: 20, w: 60, h: 60 } };
const BUST: PoseEntry = { id: "bust", file: "bust.webp", foot: { x: 75, y: 300 }, box: { x: 0, y: 0, w: 150, h: 300 }, face: { x: 30, y: 30, w: 90, h: 90 } };
const DEFAULT: PoseEntry = { id: "default", file: "default.webp", foot: { x: 50, y: 100 }, box: { x: 0, y: 0, w: 100, h: 100 } };
function layer(key: string, kind: "character" | "prop" | "scenery", poses: PoseEntry[], version = 1): AssetBuild {
  return { key, kind, name: key, version, renderer: "webp", manifest: { kind, poses, expressions: [], legal: [], flippable: true } };
}
const synthetic = (): AssetBuild[] => [layer("kit", "character", [FRONT, BUST]), layer("crate", "prop", [DEFAULT]), layer("tree", "scenery", [DEFAULT])];

// Writes `build` to <out>/<key>/v<n>/ with placeholder bytes for each file (as in publish.test.ts).
function writeBuild(out: string, build: AssetBuild, files: Record<string, string | Buffer> = {}): void {
  const dir = join(out, build.key, `v${build.version}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "asset.json"), JSON.stringify(build));
  for (const name of manifestFiles(build.manifest)) writeFileSync(join(dir, name), files[name] ?? `bytes of ${build.key} v${build.version} ${name}`);
}
// The SHA-256 of every variant file of <out>/meadow/v1/, by file name.
const meadowDigests = (out: string) => Object.fromEntries(MEADOW_BUILD.manifest.variants.map((v) => v.file).sort().map((f) => [f, sha(readFileSync(join(out, "meadow/v1", f)))]));
const envelopeOf = (envelopes: SlotEnvelope[], template: string, slot: string): SlotEnvelope => {
  const e = envelopes.find((x) => x.template === template && x.slot === slot);
  if (!e) throw new Error(`no envelope for ${template}/${slot}`);
  return e;
};

describe("meadow", () => {
  it("REG-02.S6 the code-made backdrop has all four palettes", async () => {
    const out = tmp();
    const reviews = tmp("assets-reviews-");
    const io = quiet();
    expect(await main(["meadow", "--out", out], io)).toBe(0);
    for (const b of synthetic()) writeBuild(out, b);
    // apps/storybook/scripts/make-texture.ts writes the spike texture here.
    mkdirSync(join(out, "spike"), { recursive: true });
    writeFileSync(join(out, "spike/texture.webp"), "texture bytes");
    expect(await main(["review", "meadow", "--version", "1", "--out", out], io)).toBe(0);
    expect(await main(["approve", "meadow", "--version", "1", "--out", out, "--reviews", reviews], io)).toBe(0);
    const fake = fakeWrangler();
    expect(await runPublish({ mode: "local", outDir: out, reviewsDir: reviews }, { runWrangler: fake.runWrangler, ...quiet() })).toBe(0);
    const rows = fake.db
      .prepare("SELECT a.kind AS kind, v.version AS version, v.renderer AS renderer, v.active AS active, v.manifest AS manifest FROM asset a JOIN asset_version v ON v.asset_id = a.id WHERE a.key = 'meadow'")
      .all() as Array<{ kind: string; version: number; renderer: string; active: number; manifest: string }>;
    expect(rows.map((r) => [r.kind, r.version, r.renderer, r.active])).toEqual([["backdrop", 1, "svg", 1]]);
    const manifest = JSON.parse(rows[0]!.manifest) as { variants: Array<{ sky: string }>; size: unknown };
    expect(manifest.variants.map((v) => v.sky)).toEqual(["day", "cloudy", "dusk", "night"]);
    expect(manifest.size).toEqual({ width: 2400, height: 1200 });
    const puts = fake.calls.filter(isPut);
    for (const sky of SKY_PALETTES) {
      const key = `storybook-mvp/assets/meadow/v1/${sky}.svg`;
      expect(fake.objects.has(key), key).toBe(true);
      const put = puts.find((c) => c[3] === key);
      expect(put?.[put.indexOf("--content-type") + 1], key).toBe("image/svg+xml");
    }
  }, 60_000);

  it("meadow writes one sanitised 2400 x 1200 SVG per sky palette with the DESIGN.md colours", async () => {
    const out = tmp();
    expect(await main(["meadow", "--out", out], quiet())).toBe(0);
    const text = readFileSync(join(out, "meadow/v1/asset.json"), "utf8");
    const build = AssetBuildSchema.parse(JSON.parse(text));
    expect(build).toEqual(MEADOW_BUILD);
    expect(text).toBe(`${JSON.stringify(build, null, 2)}\n`);
    for (const sky of SKY_PALETTES) {
      const file = `${sky}.svg`;
      const path = join(out, "meadow/v1", file);
      const svg = readFileSync(path, "utf8");
      expect(sanitizeSvg(svg), sky).toBe(svg);
      expect(checkSvg(svg, build, file), sky).toEqual([]);
      expect(/<svg\b[^>]*\sviewBox="([^"]*)"/.exec(svg)?.[1], sky).toBe("0 0 2400 1200");
      const { data, info } = await sharp(path, { density: 72 }).raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height], sky).toEqual([2400, 1200]);
      const pixel = (x: number, y: number) => {
        const i = (y * info.width + x) * info.channels;
        return [data[i], data[i + 1], data[i + 2]];
      };
      for (const [x, y] of NEAR_POINTS) expect(pixel(x, y), `${sky} near ground at (${x}, ${y})`).toEqual(rgb(DESIGN_COLOURS[sky].near));
      for (const [x, y] of SKY_POINTS) expect(pixel(x, y), `${sky} sky at (${x}, ${y})`).toEqual(rgb(DESIGN_COLOURS[sky].sky));
    }
  }, 60_000);

  it("two meadow runs write byte-identical files", async () => {
    const [a, b] = [tmp(), tmp()];
    expect(await main(["meadow", "--out", a], quiet())).toBe(0);
    expect(await main(["meadow", "--out", b], quiet())).toBe(0);
    const files = readdirSync(join(a, "meadow/v1")).sort();
    expect(files).toEqual(["asset.json", "cloudy.svg", "day.svg", "dusk.svg", "night.svg"]);
    expect(readdirSync(join(b, "meadow/v1")).sort()).toEqual(files);
    for (const f of files) expect(readFileSync(join(a, "meadow/v1", f)).equals(readFileSync(join(b, "meadow/v1", f))), f).toBe(true);
  });

  it("MEADOW_COLOURS holds the DESIGN.md sky palette values, and writeMeadowBuild returns the build", () => {
    const lower = (c: Record<string, string>) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.toLowerCase()]));
    expect(Object.keys(MEADOW_COLOURS)).toEqual([...SKY_PALETTES]);
    for (const sky of SKY_PALETTES) expect(lower(MEADOW_COLOURS[sky]), sky).toEqual(lower(DESIGN_COLOURS[sky]));
    expect(writeMeadowBuild(tmp())).toEqual(MEADOW_BUILD);
  });

  it("the spike fixture entry of meadow is the meadow build", () => {
    const b = writeMeadowBuild(tmp());
    expect(SPIKE_REGISTRY_FIXTURE.assets.meadow).toEqual({ kind: b.kind, renderer: b.renderer, version: b.version, manifest: b.manifest });
  });

  it("REVIEWS_DIR is the tracked folder tools/assets/reviews", () => {
    expect(REVIEWS_DIR).toBe(join(REPO_ROOT, "tools/assets/reviews"));
  });
});

describe("slotEnvelopes", () => {
  it("slotEnvelopes places each pose at the slot target height, with and without flip, in frame units", () => {
    // two-friends/left: footX 520, footY 1080, height 600 -> scale 3; frame x = stage x + 400.
    // `kit` has several poses, so the foot of `front` stays on footX (#141):
    // stage x 520 - 30 * 3 = 430, flipped 520 - 70 * 3 = 310.
    expect(envelopeOf(slotEnvelopes(synthetic(), TEMPLATES), "two-friends", "left")).toEqual({
      template: "two-friends",
      slot: "left",
      accepts: "character",
      boxes: [
        { x: 710, y: 480, w: 300, h: 600 },
        { x: 830, y: 480, w: 300, h: 600 },
      ],
    });
  });

  it("slotEnvelopes uses only the highest local version of a key", () => {
    const front2: PoseEntry = { id: "front", file: "front.webp", foot: { x: 25, y: 100 }, box: { x: 0, y: 0, w: 50, h: 100 } };
    const builds = [layer("kit", "character", [FRONT, BUST], 1), layer("kit", "character", [front2, BUST], 2), ...synthetic().slice(1)];
    // Version 2: scale 6; both boxes are x 370 on the stage, so one box remains.
    expect(envelopeOf(slotEnvelopes(builds, TEMPLATES), "two-friends", "left").boxes).toEqual([{ x: 770, y: 480, w: 300, h: 600 }]);
  });

  it("slotEnvelopes gives a slot only the poses it can hold", () => {
    const envelopes = slotEnvelopes(synthetic(), TEMPLATES);
    // solo-center/bust: footX 800, footY 1200, height 900 lists `bust`: scale 3.
    expect(envelopeOf(envelopes, "solo-center", "bust").boxes).toEqual([{ x: 975, y: 300, w: 450, h: 900 }]);
    // solo-center/hero: footX 800, footY 1090, height 640: only `front`, scale 3.2, foot on footX (#141):
    // stage x 800 - 30 * 3.2 = 704, flipped 800 - 70 * 3.2 = 576; no `bust` box.
    expect(envelopeOf(envelopes, "solo-center", "hero").boxes).toEqual([
      { x: 976, y: 450, w: 320, h: 640 },
      { x: 1104, y: 450, w: 320, h: 640 },
    ]);
  });

  it("slotEnvelopes has one entry per slot of every template, in TEMPLATES order", () => {
    const envelopes = slotEnvelopes(synthetic(), TEMPLATES);
    expect(envelopes).toHaveLength(47);
    expect(envelopes.map((e) => [e.template, e.slot, e.accepts])).toEqual(TEMPLATES.flatMap((t) => t.slots.map((s) => [t.id, s.id, s.accepts])));
  });

  it("slotEnvelopes fails on a kind with no build and on a slot with no box", () => {
    expect(() => slotEnvelopes([synthetic()[0]!, synthetic()[2]!], TEMPLATES)).toThrow("no local prop build; run cut and measure first");
    expect(() => slotEnvelopes([layer("kit", "character", [FRONT]), ...synthetic().slice(1)], TEMPLATES)).toThrow("no active character has a pose for solo-center/bust");
  });

  it("the envelope box of a slot is the box that layoutScene places at full size", () => {
    const kit = synthetic()[0]!;
    const registry: RegistrySnapshot = { assets: { kit: { kind: kit.kind, renderer: kit.renderer, version: kit.version, manifest: kit.manifest } } };
    const scene: PageScene = {
      templateId: "two-friends",
      backdrop: "meadow",
      sky: "day",
      layers: [{ instanceId: "01900000-0000-7000-8000-000000000001", ref: "kit", kind: "character", slot: "left" }],
      animations: [],
      interactions: [],
    };
    const placed = layoutScene(scene, { registry, templates: TEMPLATES });
    expect(placed.issues).toEqual([]);
    const box = layerBoxes(FRONT, placed.scene.layers[0]!.at!, false).box;
    expect(envelopeOf(slotEnvelopes(synthetic(), TEMPLATES), "two-friends", "left").boxes).toContainEqual({ ...box, x: box.x + 400 });
  });

  it("slotEnvelopes draws every other pose of a key at the at of each starting pose (#127)", () => {
    // The runtime keeps the starting pose's `at` on set_pose and pins the shown
    // pose's foot at at.x. two-friends/left: footX 520, height 600 -> scale 3.
    // `kit` has several poses, so every starting pose has its foot on footX
    // (#141): at.x 520 with and without flip, and the envelope is the boxes of
    // each pose at its own foot.
    const a: PoseEntry = { id: "walk-a", file: "a.webp", foot: { x: 30, y: 200 }, box: { x: 0, y: 0, w: 100, h: 200 }, face: { x: 20, y: 20, w: 60, h: 60 } };
    const b: PoseEntry = { id: "walk-b", file: "b.webp", foot: { x: 80, y: 200 }, box: { x: 0, y: 0, w: 100, h: 200 }, face: { x: 20, y: 20, w: 60, h: 60 } };
    const builds = [layer("kit", "character", [a, b, BUST]), ...synthetic().slice(1)];
    // Stage x: `b` 520 - 80 * 3 = 280; `a` flipped 520 - 70 * 3 = 310;
    // `a` 520 - 30 * 3 = 430; `b` flipped 520 - 20 * 3 = 460.
    expect(envelopeOf(slotEnvelopes(builds, TEMPLATES), "two-friends", "left").boxes).toEqual([
      { x: 680, y: 480, w: 300, h: 600 },
      { x: 710, y: 480, w: 300, h: 600 },
      { x: 830, y: 480, w: 300, h: 600 },
      { x: 860, y: 480, w: 300, h: 600 },
    ]);
  });

  it("the envelope box of a scenery slot is the box that layoutScene places (#127)", () => {
    // A wide scenery pose with its foot near the right edge, as fence: the slot width decides the scale.
    const fence: PoseEntry = { id: "default", file: "default.webp", foot: { x: 350, y: 100 }, box: { x: 0, y: 0, w: 400, h: 100 } };
    const builds = [...synthetic().slice(0, 2), layer("fence", "scenery", [fence])];
    const f = builds[2]!;
    const registry: RegistrySnapshot = { assets: { fence: { kind: f.kind, renderer: f.renderer, version: f.version, manifest: f.manifest } } };
    const placedBox = (flip: boolean) => {
      const scene: PageScene = {
        templateId: "two-friends",
        backdrop: "meadow",
        sky: "day",
        layers: [{ instanceId: "01900000-0000-7000-8000-000000000001", ref: "fence", kind: "scenery", slot: "back-left", flip }],
        animations: [],
        interactions: [],
      };
      const placed = layoutScene(scene, { registry, templates: TEMPLATES });
      expect(placed.issues).toEqual([]);
      const box = layerBoxes(fence, placed.scene.layers[0]!.at!, flip).box;
      return { ...box, x: box.x + 400 };
    };
    expect(placedBox(true)).toEqual(placedBox(false));
    expect(envelopeOf(slotEnvelopes(builds, TEMPLATES), "two-friends", "back-left").boxes).toEqual([placedBox(false)]);
  });
});

describe("review", () => {
  it("review writes a 2400 x 1200 sheet per variant, the envelopes JSON, and the HTML page", async () => {
    const out = tmp();
    expect(await main(["meadow", "--out", out], quiet())).toBe(0);
    for (const b of synthetic()) writeBuild(out, b);
    expect(await main(["review", "meadow", "--version", "1", "--out", out], quiet())).toBe(0);
    for (const sky of SKY_PALETTES) {
      const meta = await sharp(join(out, `review/meadow-v1-${sky}.png`)).metadata();
      expect([meta.format, meta.width, meta.height], sky).toEqual(["png", 2400, 1200]);
    }
    const sheet = JSON.parse(readFileSync(join(out, "review/meadow-v1-envelopes.json"), "utf8")) as { key: string; version: number; templates: string; files: Record<string, string> };
    expect([sheet.key, sheet.version]).toEqual(["meadow", 1]);
    expect(sheet.templates).toBe(templatesDigest());
    expect(sheet.files).toEqual(meadowDigests(out));
    const html = readFileSync(join(out, "review/meadow-v1.html"), "utf8");
    for (const sky of SKY_PALETTES) expect(html).toContain(`meadow-v1-${sky}.png`);
  }, 60_000);

  it("review checks the size of a webp backdrop variant", async () => {
    const lake = (): AssetBuild => ({
      key: "lake",
      kind: "backdrop",
      name: "Lake",
      version: 1,
      renderer: "webp",
      manifest: { kind: "backdrop", description: "a lake", size: { width: 2400, height: 1200 }, variants: [{ sky: "day", file: "day.webp" }] },
    });
    const flat = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#cfe6ee" } }).webp().toBuffer();
    const small = tmp();
    for (const b of synthetic()) writeBuild(small, b);
    writeBuild(small, lake(), { "day.webp": await flat(1200, 600) });
    const io = quiet();
    expect(await main(["review", "lake", "--version", "1", "--out", small], io)).toBe(1);
    expect(io.lines.join("\n")).toContain("lake v1 day: the variant is 1200 x 600; expected 2400 x 1200");
    const full = tmp();
    for (const b of synthetic()) writeBuild(full, b);
    writeBuild(full, lake(), { "day.webp": await flat(2400, 1200) });
    expect(await main(["review", "lake", "--version", "1", "--out", full], quiet())).toBe(0);
    expect(existsSync(join(full, "review/lake-v1-day.png"))).toBe(true);
  }, 60_000);
});

describe("approve", () => {
  it("templatesDigest is the SHA-256 of JSON.stringify(TEMPLATES)", () => {
    expect(templatesDigest()).toBe(sha(JSON.stringify(TEMPLATES)));
    expect(templatesDigest(TEMPLATES.slice(1))).not.toBe(templatesDigest());
  });

  it("approve needs current review sheets and writes the digests of the variant files and the templates", async () => {
    const out = tmp();
    const reviews = tmp("assets-reviews-");
    const approve = ["approve", "meadow", "--version", "1", "--out", out, "--reviews", reviews];
    expect(await main(["meadow", "--out", out], quiet())).toBe(0);
    for (const b of synthetic()) writeBuild(out, b);
    const before = quiet();
    expect(await main(approve, before)).toBe(1);
    expect(before.lines.join("\n")).toContain("run review first");
    expect(await main(["review", "meadow", "--version", "1", "--out", out], quiet())).toBe(0);
    const sheetPath = join(out, "review/meadow-v1-envelopes.json");
    const sheet = readFileSync(sheetPath, "utf8");
    writeFileSync(sheetPath, JSON.stringify({ ...JSON.parse(sheet), templates: sha("other templates") }));
    const stale = quiet();
    expect(await main(approve, stale)).toBe(1);
    expect(stale.lines.join("\n")).toContain("out of date");
    expect(existsSync(join(reviews, "meadow-v1.json"))).toBe(false);
    expect(await main(["review", "meadow", "--version", "1", "--out", out], quiet())).toBe(0);
    expect(await main(approve, quiet())).toBe(0);
    const record = readFileSync(join(reviews, "meadow-v1.json"), "utf8");
    expect(JSON.parse(record)).toEqual({ key: "meadow", version: 1, templates: templatesDigest(), files: meadowDigests(out) });
    expect(record).toBe(`${JSON.stringify(JSON.parse(record), null, 2)}\n`);
  }, 60_000);
});
