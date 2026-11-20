// S2 premise run driver (#26). It sends each input text once to the local
// Studio API, waits for the run to end, reads the stored rows from the local
// D1 and writes the fixture folder. It never retries a story.
//
//   pnpm --filter @storybook/app exec tsx scripts/s2-run.ts --base http://localhost:5173
//   ... --no-fixtures   (the comparison pass: no fixture files)
//
// It prints only IDs, counts, statuses and timings (AGENTS.md section 5).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { fixtureFiles, writeFixtures } from "./s2/fixtures";
import { type CallRow, type RevisionRow, type RunRow, type S2Rows, rowQueries, sqlId } from "./s2/rows";
import { type Summary, formatRate, summarize, verdict } from "./s2/summary";

export { rowQueries };

export type Input = { slug: string; url: string; retrievedAt: string; words: number; sha256: string };
type Answer = { status: number; body: unknown };

export interface Deps {
  readText(slug: string): string;
  post(text: string): Promise<Answer>;
  getRun(runId: string): Promise<Answer>;
  query(sql: string): Promise<unknown[]>;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(line: string): void;
}

export const POLL_MS = 5_000;
export const TIMEOUT_MS = 30 * 60 * 1000;
const TERMINAL = new Set(["draft_ready", "needs_review", "failed"]);

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// All texts are checked before the first request, so a changed text costs nothing.
export function checkInputs(inputs: Input[], readText: (slug: string) => string): void {
  for (const i of inputs) if (sha256(readText(i.slug)) !== i.sha256) throw new Error(`${i.slug}: SHA-256 mismatch`);
}

// A fixture folder is written once, by the run that it records. A second
// fixture run would overwrite it with a rerun, so it is refused before the
// first request. The comparison pass (`--no-fixtures`) writes no folder.
export function refuseExistingFixtures(inputs: Input[], root: string, fixtures: boolean): void {
  if (!fixtures) return;
  for (const i of inputs) {
    const dir = path.join(root, i.slug);
    if (existsSync(dir)) throw new Error(`${i.slug}: fixture folder ${dir} already exists; a fixture run records each text once`);
  }
}

export async function runOne(input: Input, deps: Deps): Promise<{ outcome: string; rows: S2Rows }> {
  const { slug } = input;
  const answer = await deps.post(deps.readText(slug));
  if (answer.status !== 202) throw new Error(`${slug}: POST /api/studio/stories answered ${answer.status}`);
  const body = answer.body as { runId?: unknown; storyId?: unknown };
  const runId = sqlId("runId", body.runId);
  const storyId = sqlId("storyId", body.storyId);
  deps.log(`${slug} run ${runId} story ${storyId}`);

  const start = deps.now();
  let status = "queued";
  let outcome = "timeout";
  while (deps.now() - start < TIMEOUT_MS) {
    await deps.sleep(POLL_MS);
    const run = await deps.getRun(runId);
    const seconds = Math.round((deps.now() - start) / 1000);
    if (run.status !== 200) {
      deps.log(`${slug} poll answered ${run.status} at ${seconds} s`);
      continue;
    }
    const next = (run.body as { run?: { status?: unknown } }).run?.status;
    if (typeof next === "string" && next !== status) {
      status = next;
      deps.log(`${slug} status ${status} at ${seconds} s`);
    }
    if (TERMINAL.has(status)) {
      outcome = status;
      break;
    }
  }
  if (outcome === "timeout") deps.log(`${slug} timeout after ${TIMEOUT_MS / 60_000} min`);

  const [callsSql, revisionsSql, runSql] = rowQueries(runId);
  const calls = (await deps.query(callsSql)) as CallRow[];
  const revisions = (await deps.query(revisionsSql)) as RevisionRow[];
  const [run] = (await deps.query(runSql)) as RunRow[];
  if (!run) throw new Error(`${slug}: no run row`);
  return { outcome, rows: { runId, storyId, run, calls, revisions } };
}

const APP = path.resolve(import.meta.dirname, "..");

function args(argv: string[]): { base: string; fixtures: boolean } {
  let base = "";
  let fixtures = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") base = argv[++i] ?? "";
    else if (argv[i] === "--no-fixtures") fixtures = false;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!/^https?:\/\//.test(base)) throw new Error("--base <url> is required");
  return { base: base.replace(/\/$/, ""), fixtures };
}

function realDeps(base: string): Deps {
  const run = promisify(execFile);
  const answer = async (res: Response): Promise<Answer> => ({ status: res.status, body: await res.json().catch(() => null) });
  return {
    readText: (slug) => readFileSync(path.join(APP, ".s2", `${slug}.txt`), "utf8"),
    post: async (text) =>
      answer(await fetch(`${base}/api/studio/stories`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })),
    getRun: async (runId) => answer(await fetch(`${base}/api/studio/runs/${runId}`)),
    query: async (sql) => {
      const cmd = ["wrangler", "d1", "execute", "storybook-mvp", "--local", "--json", "--command", sql];
      const { stdout } = await run("npx", cmd, { cwd: APP, maxBuffer: 256 * 1024 * 1024 });
      const [first] = JSON.parse(stdout) as Array<{ results?: unknown[] }>;
      return first?.results ?? [];
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    log: (line) => console.log(line),
  };
}

async function main(): Promise<void> {
  const opts = args(process.argv.slice(2));
  const root = path.join(APP, "test/model-contract/s2");
  const inputs = JSON.parse(readFileSync(path.join(root, "inputs.json"), "utf8")) as Input[];
  const deps = realDeps(opts.base);
  refuseExistingFixtures(inputs, root, opts.fixtures);
  checkInputs(inputs, deps.readText);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const local = (name: string) => path.join(APP, ".s2", `${name}-${stamp}.json`);
  mkdirSync(path.join(APP, ".s2"), { recursive: true });
  const summaries: Array<Summary & { slug: string; outcome: string; models: unknown }> = [];
  let errors = 0;
  for (const input of inputs) {
    const { outcome, rows } = await runOne(input, deps);
    // The raw rows stay in the ignored .s2/ folder first, so a writer error
    // after a paid run loses nothing and needs no rerun.
    writeFileSync(local(`rows-${input.slug}`), `${JSON.stringify(rows)}\n`);
    try {
      const files = fixtureFiles(rows);
      if (opts.fixtures) writeFixtures(path.join(root, input.slug), files);
      const summary = { slug: input.slug, outcome, models: (files["run.json"] as { models: unknown }).models, ...summarize(rows) };
      summaries.push(summary);
      const { runId: _runId, ...counts } = summary; // The run ID is logged once, above.
      console.log(JSON.stringify(counts));
    } catch (error) {
      errors++;
      console.log(`${input.slug} fixture error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const v = verdict(summaries);
  console.log(`pass rate ${formatRate(v.passes, v.pages)}, first try ${formatRate(v.firstTry, v.pages)}, verdict ${errors > 0 ? "incomplete" : v.verdict}`);
  writeFileSync(local("summary"), `${JSON.stringify({ fixtures: opts.fixtures, errors, summaries, ...v }, null, 2)}\n`);
  console.log(`summary file ${path.relative(APP, local("summary"))}`);
  if (errors > 0) process.exitCode = 1;
}

// Run only as the entry script, not when a test imports this file.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (entry === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
