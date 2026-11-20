// `spike:bundle` (issue #69, exact change 6). One `wrangler deploy --dry-run`
// per candidate and one for a baseline entry with no encoder. The delta of
// `Total Upload` against the baseline is the encoder's cost. Writes
// out/bundle.json. It deploys nothing.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CANDIDATES } from "../src/candidates";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRIES = ["baseline", ...CANDIDATES.filter((c) => !c.notUsable).map((c) => c.id)];

type Meta = { outputs: Record<string, { bytes: number; inputs: Record<string, { bytesInOutput: number }> }> };

function parseKiB(text: string, label: RegExp): number {
  const m = label.exec(text);
  if (!m) throw new Error(`no match for ${label} in wrangler output`);
  return Number(m[1]);
}

const rows: Record<string, unknown>[] = [];
for (const id of ENTRIES) {
  const outdir = `out/bundle-${id}`;
  const text = execFileSync(
    "pnpm",
    ["exec", "wrangler", "deploy", `worker/bundle/${id}.ts`, "--dry-run", "--outdir", outdir, "--metafile", `${outdir}/meta.json`],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );
  const totalKiB = parseKiB(text, /Total Upload: ([\d.]+) KiB/);
  const gzipKiB = parseKiB(text, /gzip: ([\d.]+) KiB/);
  // The five largest inputs in the bundle, from the esbuild metafile.
  const meta = JSON.parse(readFileSync(`${ROOT}${outdir}/meta.json`, "utf8")) as Meta;
  const inputs: Record<string, number> = {};
  for (const o of Object.values(meta.outputs)) {
    for (const [k, v] of Object.entries(o.inputs)) inputs[k] = (inputs[k] ?? 0) + v.bytesInOutput;
  }
  const top = Object.entries(inputs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([input, bytes]) => ({ input: input.replace(/.*node_modules\/\.pnpm\//, ""), bytes }));
  rows.push({ id, totalKiB, gzipKiB, top });
  console.log(`${id}: Total Upload ${totalKiB} KiB / gzip ${gzipKiB} KiB`);
}

const base = rows[0] as { totalKiB: number; gzipKiB: number };
for (const r of rows as { totalKiB: number; gzipKiB: number; deltaKiB?: number; deltaGzipKiB?: number }[]) {
  r.deltaKiB = Math.round((r.totalKiB - base.totalKiB) * 100) / 100;
  r.deltaGzipKiB = Math.round((r.gzipKiB - base.gzipKiB) * 100) / 100;
}
const wrangler = execFileSync("pnpm", ["exec", "wrangler", "--version"], { cwd: ROOT, encoding: "utf8" }).trim();
writeFileSync(
  `${ROOT}out/bundle.json`,
  `${JSON.stringify({ measuredAt: new Date().toISOString(), wrangler, rows }, null, 2)}\n`,
);
console.log("wrote out/bundle.json");
