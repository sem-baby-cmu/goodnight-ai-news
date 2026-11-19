// The single CLI of the asset pipeline:
//
//   pnpm --filter @storybook/assets-tools run cli cut <board> --propose   # write the draft crop map
//   pnpm --filter @storybook/assets-tools run cli cut <board> | --all     # cut out WebP files
//   pnpm --filter @storybook/assets-tools run cli measure <board> | --all # write asset.json
//   pnpm --filter @storybook/assets-tools run cli svg <key> --version <n> # sanitise and check an SVG asset
//
// `--out <dir>` writes the build output (and `review/`) there instead of
// tools/assets/out. `--no-review` skips the review sheets.
// `publish` and `sfx` belong to #21.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { AssetBuildSchema } from "./build";
import { silhouetteIoU, writeCompareSheet } from "./compare";
import { ALL_BOARDS, CropMapSchema, proposeCropMap } from "./crops";
import { readBoard } from "./io";
import { cropMapPath, cutBoard, loadCropMap, measureBoard } from "./pipeline";
import { OUT_DIR, SOURCES_DIR } from "./paths";
import { checkSvg, sanitizeSvg } from "./svg";

type Io = { log: (line: string) => void; error?: (line: string) => void };

const LATER: Record<string, string> = { publish: "#21", sfx: "#21" };

export async function main(argv: string[], io: Io = { log: console.log, error: console.error }): Promise<number> {
  const error = io.error ?? io.log;
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        all: { type: "boolean", default: false },
        propose: { type: "boolean", default: false },
        out: { type: "string" },
        "no-review": { type: "boolean", default: false },
        version: { type: "string" },
        src: { type: "string" },
      },
    });
  } catch (e) {
    error((e as Error).message);
    return 1;
  }
  const { values, positionals } = parsed;
  const [command, board] = positionals;
  const outDir = values.out ?? OUT_DIR;

  if (command && LATER[command]) {
    error(`"${command}" is not implemented yet (${LATER[command]}).`);
    return 1;
  }
  if (command === "svg") {
    const version = Number(values.version);
    if (!board || !Number.isInteger(version) || version < 1) {
      error("usage: cli svg <key> --version <n> [--src <dir>] [--out <dir>]");
      return 1;
    }
    try {
      return await svgAsset(board, version, values.src ?? SOURCES_DIR, outDir, io.log, error);
    } catch (e) {
      error(`svg ${board} v${version}: ${(e as Error).message}`);
      return 1;
    }
  }
  if (command !== "cut" && command !== "measure") {
    error("usage: cli <cut|measure> <board> | --all [--propose] [--out <dir>] [--no-review]");
    error("       cli svg <key> --version <n> [--src <dir>] [--out <dir>]");
    return 1;
  }
  if (!values.all && !board) {
    error(`${command}: name a board or pass --all`);
    return 1;
  }
  const boards = values.all ? ALL_BOARDS : [board!];

  try {
    if (command === "cut" && values.propose) {
      for (const b of boards) {
        const file = cropMapPath(b);
        if (existsSync(file)) {
          error(`${file} exists; --propose never overwrites a crop map`);
          return 1;
        }
        // Parse before writing, so the keys are in schema order, the same order
        // that a later edit by script writes.
        const map = CropMapSchema.parse(await proposeCropMap(b));
        writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`);
        const named = map.figures.filter((f) => !f.ignore).length;
        io.log(`${b}: ${map.figures.length} figures (${named} named), wrote ${file}`);
      }
      return 0;
    }
    const started = Date.now();
    for (const b of boards) {
      const map = loadCropMap(b);
      if (command === "cut") {
        const results = await cutBoard(map, await readBoard(b), { outDir, review: !values["no-review"], log: io.log });
        io.log(`${b}: cut ${results.length} figures`);
      } else {
        const builds = await measureBoard(map, { outDir });
        io.log(`${b}: measured ${builds.length} assets`);
      }
    }
    io.log(`${command}: ${boards.length} boards in ${((Date.now() - started) / 1000).toFixed(1)} s, output in ${outDir}`);
    return 0;
  } catch (e) {
    error((e as Error).message);
    return 1;
  }
}

// Reads assets/<key>/v<n>/, sanitises and checks every pose file, and writes the
// sanitised text and asset.json to <out>/<key>/v<n>/. For `svg-rig` it also
// compares the first pose with the v1 board cut-out `<out>/<key>/v1/<pose>-happy.webp`
// (implementation decision: run `cut` for that board first), prints `IoU=`, and
// fails below MIN_IOU. The comparison needs a v1 board cut-out, so an `svg-rig`
// must be a character (MVP limit, PR #53 review). `--src` replaces `assets/`
// for tests (implementation decision).
const MIN_IOU = 0.9;
async function svgAsset(key: string, version: number, sources: string, outDir: string, log: (l: string) => void, error: (l: string) => void): Promise<number> {
  const src = join(sources, key, `v${version}`);
  const build = AssetBuildSchema.parse(JSON.parse(readFileSync(join(src, "asset.json"), "utf8")));
  if (build.key !== key || build.version !== version) throw new Error(`asset.json names ${build.key} v${build.version}`);
  if (build.renderer !== "svg" && build.renderer !== "svg-rig") throw new Error(`renderer ${build.renderer} is not an SVG renderer`);
  if (build.manifest.kind === "sfx") throw new Error("an sfx asset has no SVG");
  if (build.renderer === "svg-rig" && build.kind !== "character") throw new Error(`an svg-rig must be a character (the IoU check needs a v1 board cut-out); ${key} is a ${build.kind}`);
  const dest = join(outDir, key, `v${version}`);
  const texts = new Map<string, string>();
  let failed = false;
  for (const file of new Set(build.manifest.poses.map((p) => p.file))) {
    const clean = sanitizeSvg(readFileSync(join(src, file), "utf8"));
    const issues = checkSvg(clean, build, file);
    for (const i of issues) error(`${key}/v${version}/${file}: ${i.path}: ${i.code}: ${i.message}`);
    failed ||= issues.length > 0;
    texts.set(file, clean);
  }
  if (failed) return 1;
  mkdirSync(dest, { recursive: true });
  for (const [file, text] of texts) writeFileSync(join(dest, file), text);
  writeFileSync(join(dest, "asset.json"), `${JSON.stringify(AssetBuildSchema.parse(build), null, 2)}\n`);
  log(`${key} v${version}: wrote ${texts.size} SVG file(s) and asset.json to ${dest}`);
  if (build.renderer === "svg-rig") {
    const pose = build.manifest.poses[0]!;
    const reference = join(outDir, key, "v1", `${pose.id}-happy.webp`);
    if (!existsSync(reference)) throw new Error(`${reference} is missing; run cut for the board of ${key} first`);
    const svgPath = join(dest, pose.file);
    const reviewDir = join(outDir, "review");
    mkdirSync(reviewDir, { recursive: true });
    await writeCompareSheet({ svgPath, webpPath: reference, out: join(reviewDir, `${key}-v${version}-compare.png`) });
    const iou = await silhouetteIoU(svgPath, reference);
    log(`IoU=${iou.toFixed(4)}`);
    if (iou < MIN_IOU) {
      error(`${key} v${version}: IoU ${iou.toFixed(4)} is below ${MIN_IOU.toFixed(2)}`);
      return 1;
    }
  }
  return 0;
}

// Run only as the entry point, not when a test imports `main`. Real paths,
// because the worktree may sit behind a symbolic link.
const entry = process.argv[1];
if (entry && existsSync(entry) && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
