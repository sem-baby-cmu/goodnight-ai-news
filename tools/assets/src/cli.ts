// The single CLI of the asset pipeline:
//
//   pnpm --filter @storybook/assets-tools run cli cut <board> --propose   # write the draft crop map
//   pnpm --filter @storybook/assets-tools run cli cut <board> | --all     # cut out WebP files
//   pnpm --filter @storybook/assets-tools run cli measure <board> | --all # write asset.json
//
// `--out <dir>` writes the build output (and `review/`) there instead of
// tools/assets/out. `--no-review` skips the review sheets.
// `svg` belongs to #12; `publish` and `sfx` belong to #21.
import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ALL_BOARDS, CropMapSchema, proposeCropMap } from "./crops";
import { readBoard } from "./io";
import { cropMapPath, cutBoard, loadCropMap, measureBoard } from "./pipeline";
import { OUT_DIR } from "./paths";

type Io = { log: (line: string) => void; error?: (line: string) => void };

const LATER: Record<string, string> = { svg: "#12", publish: "#21", sfx: "#21" };

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
  if (command !== "cut" && command !== "measure") {
    error("usage: cli <cut|measure> <board> | --all [--propose] [--out <dir>] [--no-review]");
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

// Run only as the entry point, not when a test imports `main`. Real paths,
// because the worktree may sit behind a symbolic link.
const entry = process.argv[1];
if (entry && existsSync(entry) && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
