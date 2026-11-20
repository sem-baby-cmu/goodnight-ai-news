// Tracer smoke of a deployed Worker (#25): create a story, run it, publish
// it, and read it back through the public routes, all by HTTP.
//
//   pnpm --filter @storybook/app exec tsx --env-file=.dev.vars scripts/smoke-tracer.ts [--base URL] [--run --text-file .s2/s2-1.txt]
//
// `pnpm exec` runs in apps/storybook, so `.dev.vars` and `.s2/` are relative to it.
// Without `--run` it only checks the Access token and the public shelf.
//
// `--run` with MODEL_MODE "real" on the Worker spends money (model and TTS calls).
// The Access service token (CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET) comes from `.dev.vars`.
// The usage line above has not been run yet.
//
// It prints only IDs, statuses, counts and timings (AGENTS.md section 5): no
// news text, no model output, no header value, and of a server body only the
// `error`, `reason`, `step` and `pageId` strings, each cut to 80 characters.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string; redirect?: "manual" };
type SmokeResponse = Pick<Response, "status" | "headers" | "json" | "text" | "arrayBuffer">;

export interface SmokeDeps {
  fetch(url: string, init?: FetchInit): Promise<SmokeResponse>;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(line: string): void;
}

export interface SmokeOptions {
  base: string; // e.g. https://lullabyte.ioenv.com (no trailing slash)
  auth: { clientId: string; clientSecret: string };
  run: boolean; // false = preflight only
  text?: string; // required when run is true
  timeoutMs: number; // run polling limit
  pollMs: number;
}

export interface SmokeResult {
  ok: boolean;
  failedStep: string | null;
  storyId?: string;
  runId?: string;
  runStatus?: string;
  releaseId?: string;
}

const TERMINAL = new Set(["draft_ready", "needs_review", "failed"]);

// A server string in a log line: only a string, at most 80 characters.
function cut(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 80) : String(value === null || value === undefined ? "none" : typeof value);
}

function field(body: unknown, key: string): unknown {
  return body !== null && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined;
}

async function readJson(res: SmokeResponse): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

class StepFailed extends Error {
  constructor(readonly step: string) {
    super(step);
  }
}

export async function runSmoke(opts: SmokeOptions, deps: SmokeDeps): Promise<SmokeResult> {
  const result: SmokeResult = { ok: false, failedStep: null };
  const start = deps.now();
  const seconds = () => Math.round((deps.now() - start) / 1000);
  const studio = (extra: Record<string, string> = {}) => ({
    "CF-Access-Client-Id": opts.auth.clientId,
    "CF-Access-Client-Secret": opts.auth.clientSecret,
    ...extra,
  });
  const fail = (step: string, line: string): never => {
    deps.log(`${step}: ${line}`);
    throw new StepFailed(step);
  };
  // A thrown fetch (network error) fails the step; only the error name is logged.
  const request = async (step: string, path: string, init?: FetchInit): Promise<SmokeResponse> => {
    try {
      return await deps.fetch(`${opts.base}${path}`, init);
    } catch (error) {
      return fail(step, `network error ${error instanceof Error ? cut(error.name) : "unknown"}`);
    }
  };

  try {
    if (opts.run && !opts.text) fail("missing_text", "--run needs a text");

    // 1. Preflight: the studio API with the Access headers, the shelf without them.
    const stories = await request("preflight_failed", "/api/studio/stories", { headers: studio(), redirect: "manual" });
    if (stories.status === 302 || stories.status === 401 || stories.status === 403) {
      fail("access_rejected", `GET /api/studio/stories answered ${stories.status}`);
    }
    if (stories.status !== 200) fail("preflight_failed", `GET /api/studio/stories answered ${stories.status}`);
    const shelf = await request("shelf_not_public", "/api/shelf");
    if (shelf.status !== 200) fail("shelf_not_public", `GET /api/shelf answered ${shelf.status}`);
    deps.log("preflight ok: studio API 200 with the service token, shelf 200 without it");
    if (!opts.run) return { ok: true, failedStep: null };

    // 2. Create.
    const created = await request("create_rejected", "/api/studio/stories", {
      method: "POST",
      headers: studio({ "content-type": "application/json" }),
      body: JSON.stringify({ text: opts.text }),
      redirect: "manual",
    });
    const createdBody = await readJson(created);
    const storyId = field(createdBody, "storyId");
    const runId = field(createdBody, "runId");
    if (created.status !== 202 || typeof storyId !== "string" || typeof runId !== "string") {
      fail(
        "create_rejected",
        `POST /api/studio/stories answered ${created.status} error ${cut(field(createdBody, "error"))} reason ${cut(field(createdBody, "reason"))}`,
      );
    }
    result.storyId = storyId as string;
    result.runId = runId as string;
    deps.log(`created story ${cut(storyId)} run ${cut(runId)}, words ${cut(String(field(createdBody, "words")))}`);

    // 3. Poll until the run ends; a log line only when the status changes.
    const pollStart = deps.now();
    let status = "";
    let runBody: unknown = null;
    while (!TERMINAL.has(status)) {
      if (deps.now() - pollStart >= opts.timeoutMs) {
        fail("run_timeout", `run ${cut(runId)} did not end within ${Math.round(opts.timeoutMs / 1000)} s`);
      }
      await deps.sleep(opts.pollMs);
      const polled = await request("poll_failed", `/api/studio/runs/${runId}`, { headers: studio(), redirect: "manual" });
      if (polled.status !== 200) {
        deps.log(`poll answered ${polled.status} at ${seconds()} s`);
        continue;
      }
      runBody = field(await readJson(polled), "run");
      const next = field(runBody, "status");
      if (typeof next === "string" && next !== status) {
        status = next;
        deps.log(`run status ${cut(status)} at ${seconds()} s`);
      }
    }
    result.runStatus = status;
    if (status === "failed") {
      const errors = field(field(runBody, "error"), "errors");
      const steps = Array.isArray(errors) ? errors.map((e) => cut(field(e, "step"))) : [];
      fail("run_failed", `failed steps ${steps.length > 0 ? steps.join(", ") : "none"}`);
    }

    // 4. Publish; the API decides whether a needs_review run can be published.
    const published = await request("publish_rejected", `/api/studio/stories/${storyId}/releases`, {
      method: "POST",
      headers: studio(),
      redirect: "manual",
    });
    const pubBody = await readJson(published);
    if (published.status === 409 && field(pubBody, "error") === "publish_blocked") {
      const blocking = field(pubBody, "blocking");
      const items = Array.isArray(blocking) ? blocking : [];
      deps.log(`publish blocked: ${items.length} items`);
      for (const b of items) deps.log(`blocking page ${cut(field(b, "pageId"))} reason ${cut(field(b, "reason"))}`);
      fail("publish_blocked", `POST releases answered 409`);
    }
    const releaseId = field(pubBody, "releaseId");
    const manifestUrl = field(pubBody, "manifestUrl");
    if (published.status !== 201 || typeof releaseId !== "string" || typeof manifestUrl !== "string") {
      fail("publish_rejected", `POST releases answered ${published.status} error ${cut(field(pubBody, "error"))}`);
    }
    result.releaseId = releaseId as string;
    deps.log(`published release ${cut(releaseId)} number ${cut(String(field(pubBody, "number")))} at ${seconds()} s`);

    // 5. Public reads, with no Access header.
    const player = await request("read_player", `/read/${releaseId}`);
    if (player.status !== 200 || !(player.headers.get("content-type") ?? "").includes("text/html")) {
      fail("read_player", `GET /read/<release> answered ${player.status}`);
    }

    const manifestRes = await request("read_manifest", manifestUrl as string);
    const manifest = manifestRes.status === 200 ? await readJson(manifestRes) : null;
    const pages = field(manifest, "pages");
    const first = Array.isArray(pages) ? pages[0] : undefined;
    const pageFile = field(first, "json");
    if (
      manifestRes.status !== 200 ||
      field(manifest, "format") !== "storybook-mvp" ||
      field(manifest, "releaseId") !== releaseId ||
      typeof pageFile !== "string"
    ) {
      fail("read_manifest", `manifest answered ${manifestRes.status}`);
    }
    // Page and audio paths are relative to the release root.
    const root = `/content/releases/${releaseId}/`;
    const pageRes = await request("read_page", `${root}${pageFile}`);
    const page = pageRes.status === 200 ? await readJson(pageRes) : null;
    const audioFile = field(page, "audio");
    if (pageRes.status !== 200 || typeof field(page, "text") !== "string" || typeof audioFile !== "string") {
      fail("read_page", `page answered ${pageRes.status}`);
    }

    const audioRes = await request("read_audio", `${root}${audioFile}`);
    const bytes = audioRes.status === 200 ? (await audioRes.arrayBuffer()).byteLength : 0;
    if (audioRes.status !== 200 || !(audioRes.headers.get("content-type") ?? "").startsWith("audio/") || bytes <= 0) {
      fail("read_audio", `audio answered ${audioRes.status}, ${bytes} bytes`);
    }
    deps.log(`public reads ok: player, manifest with ${(pages as unknown[]).length} pages, page 1, audio ${bytes} bytes at ${seconds()} s`);
    return { ...result, ok: true, failedStep: null };
  } catch (error) {
    if (error instanceof StepFailed) return { ...result, ok: false, failedStep: error.step };
    // An unexpected error: only its name, never its message.
    deps.log(`unexpected error ${error instanceof Error ? cut(error.name) : "unknown"}`);
    return { ...result, ok: false, failedStep: "unexpected_error" };
  }
}

type Cli = { base: string; run: boolean; textFile: string | null; timeoutS: number; pollS: number };

function args(argv: string[]): Cli {
  const cli: Cli = { base: process.env.SMOKE_BASE || "https://lullabyte.ioenv.com", run: false, textFile: null, timeoutS: 900, pollS: 5 };
  const seconds = (name: string, value: string | undefined) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} <seconds> must be a positive number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") cli.base = argv[++i] ?? "";
    else if (a === "--text-file") cli.textFile = argv[++i] ?? "";
    else if (a === "--run") cli.run = true;
    else if (a === "--timeout-s") cli.timeoutS = seconds(a, argv[++i]);
    else if (a === "--poll-s") cli.pollS = seconds(a, argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!/^https?:\/\//.test(cli.base)) throw new Error("--base <url> must start with http:// or https://");
  cli.base = cli.base.replace(/\/+$/, "");
  if (cli.run && !cli.textFile) throw new Error("--run needs --text-file <path>");
  return cli;
}

async function main(): Promise<number> {
  let cli: Cli;
  try {
    cli = args(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const missing = ["CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"].filter((name) => !process.env[name]);
  for (const name of missing) console.error(`missing environment variable ${name}`);
  if (missing.length > 0) return 2;

  const text = cli.textFile ? readFileSync(cli.textFile, "utf8") : undefined;
  const deps: SmokeDeps = {
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    log: (line) => console.log(line),
  };
  const result = await runSmoke(
    {
      base: cli.base,
      auth: { clientId: process.env.CF_ACCESS_CLIENT_ID!, clientSecret: process.env.CF_ACCESS_CLIENT_SECRET! },
      run: cli.run,
      text,
      timeoutMs: cli.timeoutS * 1000,
      pollMs: cli.pollS * 1000,
    },
    deps,
  );
  console.log(result.ok ? "smoke ok" : `smoke failed at ${result.failedStep}`);
  return result.ok ? 0 : 1;
}

// Run only as the entry script, not when a test imports this file.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (entry === realpathSync(fileURLToPath(import.meta.url))) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`smoke error ${error instanceof Error ? error.name : "unknown"}`);
      process.exit(1);
    },
  );
}
