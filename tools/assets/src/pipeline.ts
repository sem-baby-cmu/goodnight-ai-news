// The `cut` and `measure` steps for one board. The CLI and the tests call these.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PoseEntry } from "@storybook/dsl";
import { type AssetBuild, AssetBuildSchema } from "./build";
import { type CropFigure, type CropMap, CropMapSchema, EXPRESSIONS } from "./crops";
import { type Cut, cutFigure, measureImage, type Raw } from "./image";
import { decodeRgba, encodeWebp } from "./io";
import { CROPS_DIR } from "./paths";
import { writeReviewSheets } from "./review";

export function cropMapPath(board: string): string {
  return join(CROPS_DIR, `${board}.json`);
}

export function loadCropMap(board: string): CropMap {
  const file = cropMapPath(board);
  if (!existsSync(file)) throw new Error(`no crop map for ${board}: run "cut ${board} --propose" first`);
  return CropMapSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

// `<pose>-<expression>.webp` for characters, `default.webp` for props and scenery.
export function fileName(map: CropMap, fig: CropFigure, index: number): string {
  const asset = map.assets[fig.key!]!;
  if (asset.kind !== "character") return "default.webp";
  if (fig.expression === null) throw new Error(`figure ${index} (${fig.key}/${fig.pose}) has no expression`);
  return `${fig.pose}-${fig.expression}.webp`;
}

function assetOf(map: CropMap, fig: CropFigure, index: number) {
  if (fig.key === null) throw new Error(`figure ${index} has no key: finish the crop map first`);
  const asset = map.assets[fig.key];
  if (!asset) throw new Error(`figure ${index}: asset "${fig.key}" is not in "assets"`);
  return asset;
}

export type CutResult = { index: number; figure: CropFigure; file: string; cut: Cut };

// Cuts every figure with `ignore: false` and writes the WebP files, their trim
// origins, and (unless `review` is false) the review sheets.
export async function cutBoard(
  map: CropMap,
  raw: Raw,
  opts: { outDir: string; review?: boolean; log: (line: string) => void },
): Promise<CutResult[]> {
  const results: CutResult[] = [];
  const written = new Set<string>();
  for (const [index, fig] of map.figures.entries()) {
    if (fig.ignore) continue;
    const asset = assetOf(map, fig, index);
    const file = fileName(map, fig, index);
    const dir = join(opts.outDir, fig.key!, `v${asset.version}`);
    if (written.has(join(dir, file))) throw new Error(`figure ${index}: ${fig.key}/${file} is cut twice`);
    written.add(join(dir, file));
    let cut: Cut;
    try {
      cut = cutFigure(
        raw,
        map.background,
        { index, key: fig.key!, pose: fig.pose, box: fig.box, holes: fig.holes, tolerance: fig.tolerance ?? map.tolerance },
        opts.log,
      );
    } catch (e) {
      throw new Error(`${map.board.replace(/\.png$/, "")}: ${(e as Error).message}`);
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), await encodeWebp(cut));
    writeFileSync(join(dir, `${file}.trim.json`), `${JSON.stringify(cut.origin)}\n`);
    results.push({ index, figure: fig, file, cut });
  }
  if (opts.review !== false) await writeReviewSheets(map.board.replace(/\.png$/, ""), { map, results, reviewDir: join(opts.outDir, "review") });
  return results;
}

// Measures every cut figure and writes one `asset.json` per asset key.
export async function measureBoard(map: CropMap, opts: { outDir: string }): Promise<AssetBuild[]> {
  const entries = new Map<string, Array<PoseEntry & { expression?: string }>>();
  for (const [index, fig] of map.figures.entries()) {
    if (fig.ignore) continue;
    const asset = assetOf(map, fig, index);
    const file = fileName(map, fig, index);
    const dir = join(opts.outDir, fig.key!, `v${asset.version}`);
    const img = await decodeRgba(join(dir, file));
    const origin = JSON.parse(readFileSync(join(dir, `${file}.trim.json`), "utf8")) as { x: number; y: number };
    const m = measureImage(img, { origin, face: fig.face, foot: fig.foot });
    const entry: PoseEntry = { id: fig.pose, file, foot: m.foot, box: m.box };
    if (m.face) entry.face = m.face;
    if (asset.kind === "character") entry.expression = fig.expression!;
    entries.set(fig.key!, [...(entries.get(fig.key!) ?? []), entry]);
  }
  const builds: AssetBuild[] = [];
  for (const [key, poses] of entries) {
    const asset = map.assets[key]!;
    const character = asset.kind === "character";
    const expressions = character ? EXPRESSIONS.filter((e) => poses.some((p) => p.expression === e)) : [];
    const build = {
      key,
      kind: asset.kind,
      name: asset.name,
      version: asset.version,
      renderer: "webp",
      manifest: {
        kind: asset.kind,
        poses,
        expressions,
        legal: character ? poses.map((p) => ({ pose: p.id, expression: p.expression! })) : [],
        flippable: asset.flippable,
      },
    };
    const parsed = AssetBuildSchema.safeParse(build);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`${key}: asset.json does not validate: ${issues}`);
    }
    writeFileSync(join(opts.outDir, key, `v${asset.version}`, "asset.json"), `${JSON.stringify(parsed.data, null, 2)}\n`);
    builds.push(parsed.data);
  }
  return builds;
}
