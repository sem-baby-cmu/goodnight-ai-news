// Painted backdrops (#74, ADR 0016 section 1 and Decision A, design "8. Asset
// pipeline"): one painting per variant from the Producer. The paintings live
// in R2 under SOURCE_PREFIX; the tracked source list
// <paintingsDir>/<key>-v<n>.json holds their SHA-256 digests. The build
// downloads them to an untracked cache, checks them, and writes one
// 2400 x 1200 WebP per variant within the file budget, then asset.json.
// Invariants (#74 refinement): every source is in the cache and matches the
// source list before the first WebP is encoded; the build writes all files or
// none; it never crops, pads, upscales, or flattens a painting; one fixed
// quality for every variant, never lowered to fit the budget.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { SKY_PALETTES } from "@storybook/dsl";
import { AssetBuildSchema } from "./build";
import { ASSET_KEY } from "./crops";
import { BUCKET, type Mode } from "./publish";

// Implementation decisions (#74 refinement). No route of the Worker serves
// `sources/`. The quality and the budget are provisional until the owner's
// compression test on 2 or 3 real paintings; "250 KB" is read as 250,000 bytes.
export const SOURCE_PREFIX = "sources/backdrops/";
export const PAINTED_WEBP = { quality: 80, effort: 6 } as const;
export const MAX_BACKDROP_WEBP_BYTES = 250_000;
const WIDTH = 2400;
const HEIGHT = 1200;

export const SourceListSchema = z.strictObject({
  key: z.string().regex(ASSET_KEY),
  version: z.number().int().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  variants: z
    .array(
      z.strictObject({
        sky: z.enum(SKY_PALETTES),
        source: z.string().regex(/^[a-z0-9][a-z0-9-]*\.(png|jpg|jpeg|tif|tiff|webp)$/),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .min(1)
    .refine((variants) => new Set(variants.map((v) => v.sky)).size === variants.length, {
      message: "Each sky palette has at most one variant.",
    }),
});

export type SourceList = z.infer<typeof SourceListSchema>;
type Deps = { runWrangler: (args: string[]) => Promise<string>; log: (line: string) => void; error: (line: string) => void };

// The lower-case SHA-256 hex of a file, or undefined if there is no file.
function digestOf(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return undefined;
  }
}

const messageOf = (e: unknown) =>
  e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") : (e as Error).message;

// Returns 0 when it wrote <outDir>/<key>/v<n>/<sky>.webp for every variant and
// asset.json; otherwise prints every error, writes nothing to outDir, and returns 1.
export async function buildPaintedBackdrop(
  opts: { key: string; version: number; mode: Mode; outDir: string; paintingsDir: string; cacheDir: string },
  deps: Deps,
): Promise<number> {
  const { key, version } = opts;
  const name = `${key} v${version}`;
  const fail = (errors: string[]) => {
    for (const e of errors) deps.error(e);
    return 1;
  };
  if (!ASSET_KEY.test(key) || !Number.isInteger(version) || version < 1) return fail([`backdrop: "${key}" v${version} is not an asset key and version`]);

  // 1. The source list.
  const listPath = join(opts.paintingsDir, `${key}-v${version}.json`);
  let list: SourceList;
  try {
    list = SourceListSchema.parse(JSON.parse(readFileSync(listPath, "utf8")));
  } catch (e) {
    return fail([`${listPath}: ${messageOf(e)}`]);
  }
  if (list.key !== key || list.version !== version) return fail([`${listPath}: the source list names ${list.key} v${list.version}; the file name names ${name}`]);

  // 2. Every source in the cache, with the digest of the source list. The
  // real wrangler runs in apps/storybook, so the cache path is absolute.
  const cacheDir = resolve(opts.cacheDir, key, `v${version}`);
  const errors: string[] = [];
  for (const { sky, source, sha256 } of list.variants) {
    const cachePath = join(cacheDir, source);
    if (digestOf(cachePath) === sha256) continue;
    try {
      mkdirSync(cacheDir, { recursive: true });
      await deps.runWrangler(["r2", "object", "get", `${BUCKET}/${SOURCE_PREFIX}${key}/v${version}/${source}`, "--file", cachePath, `--${opts.mode}`]);
    } catch (e) {
      errors.push(`${name} ${sky}: ${source}: ${messageOf(e)}`);
      continue;
    }
    if (digestOf(cachePath) !== sha256) errors.push(`${name} ${sky}: ${source} in R2 does not match the source list`);
  }
  if (errors.length > 0) return fail(errors);

  // 3. Shape, size, and opacity. Never fixed here.
  for (const { sky, source } of list.variants) {
    const where = `${name} ${sky}: ${source}`;
    try {
      const path = join(cacheDir, source);
      const meta = await sharp(path).metadata();
      const { isOpaque } = await sharp(path).stats();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w !== 2 * h) errors.push(`${where} is ${w} x ${h}; a painting is exactly 2:1`);
      if (w < WIDTH) errors.push(`${where} is ${w} x ${h}; a painting is at least ${WIDTH} x ${HEIGHT}`);
      if (!isOpaque) errors.push(`${where} has transparent pixels; a painting is opaque`);
    } catch (e) {
      errors.push(`${where}: ${messageOf(e)}`);
    }
  }
  if (errors.length > 0) return fail(errors);

  // 4. Encode with the fixed settings. `fit: "fill"` cannot distort: step 3
  // made the shape exactly 2:1.
  const encoded = new Map<string, Buffer>();
  for (const { sky, source } of list.variants) {
    try {
      const bytes = await sharp(join(cacheDir, source)).resize(WIDTH, HEIGHT, { fit: "fill", kernel: "lanczos3" }).removeAlpha().webp(PAINTED_WEBP).toBuffer();
      if (bytes.length > MAX_BACKDROP_WEBP_BYTES) errors.push(`${name} ${sky}: ${bytes.length} bytes; the budget is ${MAX_BACKDROP_WEBP_BYTES}`);
      encoded.set(sky, bytes);
    } catch (e) {
      errors.push(`${name} ${sky}: ${source}: ${messageOf(e)}`);
    }
  }
  if (errors.length > 0) return fail(errors);

  // 5. All checks passed: the WebP files, then asset.json.
  const build = AssetBuildSchema.parse({
    key,
    kind: "backdrop",
    name: list.name,
    version,
    renderer: "webp",
    manifest: {
      kind: "backdrop",
      description: list.description,
      size: { width: WIDTH, height: HEIGHT },
      variants: SKY_PALETTES.filter((sky) => encoded.has(sky)).map((sky) => ({ sky, file: `${sky}.webp` })),
    },
  });
  const dir = join(opts.outDir, key, `v${version}`);
  mkdirSync(dir, { recursive: true });
  for (const sky of SKY_PALETTES) {
    const bytes = encoded.get(sky);
    if (!bytes) continue;
    writeFileSync(join(dir, `${sky}.webp`), bytes);
    deps.log(`${name}: ${sky}.webp ${bytes.length} bytes`);
  }
  writeFileSync(join(dir, "asset.json"), `${JSON.stringify(build, null, 2)}\n`);
  deps.log(`${name}: wrote ${encoded.size} WebP file(s) and asset.json to ${dir}`);
  deps.log(`next: cli review ${key} --version ${version}`);
  return 0;
}
