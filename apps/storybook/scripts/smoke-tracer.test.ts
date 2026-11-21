import type { ReleaseManifest, ReleasePage } from "@storybook/dsl";
import { describe, expect, it } from "vitest";
import { type SmokeDeps, type SmokeOptions, type SmokeResult, args, runSmoke } from "./smoke-tracer";

const BASE = "https://smoke.example.test";
const CLIENT_ID = "client-id-7f3a.access";
const CLIENT_SECRET = "sekret-ABC";

const STORY = "01936f3e-8a2b-7c4d-9e1f-0a1b2c3d4e5f";
const RUN = "01936f3e-8a2c-7d4e-8f20-1b2c3d4e5f60";
const RELEASE = "01936f3e-9b3d-7e5f-a031-2c3d4e5f6071";
const OTHER_RELEASE = "01936f3e-9b3e-7a60-8b42-4d5e6f708193";
const PAGE = "01936f3e-8a30-7f60-b142-3d4e5f607182";

// Paths in a release are relative to the release root (worker/publish/build.ts,
// worker/publish/publish.ts): pages/<pageId>.json and audio/<pageId>.<ext>.
const ROOT = `/content/releases/${RELEASE}/`;
const MANIFEST_PATH = `${ROOT}manifest.json`;
const PAGE_PATH = `${ROOT}pages/${PAGE}.json`;
const AUDIO_PATH = `${ROOT}audio/${PAGE}.mp3`;

const manifest = (releaseId: string) =>
  ({
    format: "storybook-mvp",
    formatVersion: 1,
    storyId: STORY,
    releaseId,
    number: 1,
    title: "A title",
    pages: [{ pageId: PAGE, json: `pages/${PAGE}.json` }],
  }) satisfies ReleaseManifest;

// The script reads only `text` and `audio`; the scene is a placeholder.
const pageJson = {
  pageId: PAGE,
  text: "A page text.",
  audio: `audio/${PAGE}.mp3`,
  scene: {},
  assets: {},
} satisfies Pick<ReleasePage, "pageId" | "text" | "audio" | "assets"> & { scene: object };

type FakeResponse = Awaited<ReturnType<SmokeDeps["fetch"]>>;
type Recorded = { method: string; path: string; url: string; headers: Record<string, string>; body?: string; redirect?: string };
type Handler = (req: Recorded) => FakeResponse;

function reply(status: number, body?: unknown, contentType = "application/json"): FakeResponse {
  const raw = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(raw);
  return {
    status,
    headers: new Headers({ "content-type": contentType }),
    json: async () => JSON.parse(raw),
    text: async () => raw,
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function runReply(status: string, error: unknown = null): FakeResponse {
  return reply(200, {
    run: {
      id: RUN,
      storyId: STORY,
      scope: { kind: "full" },
      status,
      error,
      createdAt: "2026-11-20T10:00:00.000Z",
      finishedAt: status === "queued" || status === "running" ? null : "2026-11-20T10:03:00.000Z",
      workflowStatus: status === "queued" || status === "running" ? "running" : null,
    },
    steps: [],
  });
}

// Run statuses in poll order; the last one repeats.
function polls(statuses: Array<string | FakeResponse>): Handler {
  let i = 0;
  return () => {
    const next = statuses[Math.min(i++, statuses.length - 1)]!;
    return typeof next === "string" ? runReply(next) : next;
  };
}

function happyRoutes(): Record<string, Handler> {
  return {
    // Access answers a call without the service token with a redirect to its login.
    "GET /api/studio/stories": (req) => (hasAccess(req) ? reply(200, { stories: [] }) : reply(302, "")),
    "GET /api/shelf": () => reply(200, { books: [] }),
    "POST /api/studio/stories": () => reply(202, { storyId: STORY, runId: RUN, words: 250, truncated: false }),
    [`GET /api/studio/runs/${RUN}`]: polls(["queued", "running", "running", "draft_ready"]),
    [`POST /api/studio/stories/${STORY}/releases`]: () =>
      reply(201, { releaseId: RELEASE, number: 1, manifestUrl: MANIFEST_PATH, playerUrl: `/read/${RELEASE}` }),
    [`GET /read/${RELEASE}`]: () => reply(200, "<!doctype html><div id=root></div>", "text/html; charset=utf-8"),
    [`GET ${MANIFEST_PATH}`]: () => reply(200, manifest(RELEASE)),
    [`GET ${PAGE_PATH}`]: () => reply(200, pageJson),
    [`GET ${AUDIO_PATH}`]: () => reply(200, new Uint8Array([0xff, 0xfb, 0x90, 0x44, 0x00]), "audio/mpeg"),
  };
}

function harness(overrides: Record<string, Handler> = {}) {
  const routes = { ...happyRoutes(), ...overrides };
  const requests: Recorded[] = [];
  const logs: string[] = [];
  const sleeps: number[] = [];
  let clock = 0;
  const deps: SmokeDeps = {
    fetch: async (url, init) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(init?.headers ?? {})) headers[k.toLowerCase()] = v;
      const method = (init?.method ?? "GET").toUpperCase();
      const req: Recorded = { method, path: new URL(url).pathname, url, headers, body: init?.body, redirect: init?.redirect };
      requests.push(req);
      const handler = routes[`${method} ${req.path}`];
      return handler ? handler(req) : reply(404, { error: "not_found" });
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    log: (line) => logs.push(line),
  };
  return { deps, requests, logs, sleeps, now: () => clock };
}

function options(overrides: Partial<SmokeOptions> = {}): SmokeOptions {
  return {
    base: BASE,
    auth: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    run: true,
    text: "word ".repeat(250).trim(),
    timeoutMs: 60_000,
    pollMs: 5_000,
    ...overrides,
  };
}

// Runs the smoke and returns its result and the message of a thrown error, if any.
async function smoke(opts: SmokeOptions, deps: SmokeDeps): Promise<{ result: SmokeResult | null; thrown: string | null }> {
  try {
    return { result: await runSmoke(opts, deps), thrown: null };
  } catch (error) {
    return { result: null, thrown: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error) };
  }
}

const hasAccess = (r: Recorded) => r.headers["cf-access-client-id"] === CLIENT_ID && r.headers["cf-access-client-secret"] === CLIENT_SECRET;
const noAccess = (r: Recorded) => Object.keys(r.headers).every((k) => !k.startsWith("cf-access"));
const isPublic = (r: Recorded) => r.path === "/api/shelf" || r.path.startsWith("/read/") || r.path.startsWith("/content/");
const route = (r: Recorded) => `${r.method} ${r.path}`;

describe("smoke-tracer", () => {
  it("smoke-tracer: preflight checks the studio API with the Access headers, its refusal without them, and the shelf", async () => {
    const h = harness();
    const result = await runSmoke(options({ run: false, text: undefined }), h.deps);

    expect(result).toEqual({ ok: true, failedStep: null });
    expect(h.requests.map(route)).toEqual(["GET /api/studio/stories", "GET /api/studio/stories", "GET /api/shelf"]);
    const [stories, unauthenticated, shelf] = h.requests;
    expect(stories!.url).toBe(`${BASE}/api/studio/stories`);
    expect(hasAccess(stories!)).toBe(true);
    expect(stories!.redirect).toBe("manual");
    expect(unauthenticated!.url).toBe(`${BASE}/api/studio/stories`);
    expect(noAccess(unauthenticated!)).toBe(true);
    expect(unauthenticated!.redirect).toBe("manual");
    expect(h.logs.some((l) => l.includes("refuses") && l.includes("302"))).toBe(true);
    expect(shelf!.url).toBe(`${BASE}/api/shelf`);
    expect(noAccess(shelf!)).toBe(true);
    expect(h.requests.some((r) => r.method === "POST")).toBe(false);
  });

  it("smoke-tracer: a 302 from the studio API stops with access_rejected and makes no other request", async () => {
    for (const status of [302, 401, 403]) {
      const h = harness({
        "GET /api/studio/stories": () => ({
          ...reply(status, ""),
          headers: new Headers({ location: "https://team.cloudflareaccess.com/cdn-cgi/access/login" }),
        }),
      });
      const result = await runSmoke(options(), h.deps);

      expect(result.ok).toBe(false);
      expect(result.failedStep).toBe("access_rejected");
      expect(h.requests.map(route)).toEqual(["GET /api/studio/stories"]);
    }
  });

  it("smoke-tracer: a studio API that answers 200 without the Access headers fails with studio_public", async () => {
    const h = harness({ "GET /api/studio/stories": () => reply(200, { stories: [] }) });
    const result = await runSmoke(options(), h.deps);

    expect(result).toEqual({ ok: false, failedStep: "studio_public" });
    expect(h.requests.map(route)).toEqual(["GET /api/studio/stories", "GET /api/studio/stories"]);
    expect(noAccess(h.requests[1]!)).toBe(true);
  });

  it("smoke-tracer: a studio API that answers 500 without the Access headers fails with preflight_failed", async () => {
    const h = harness({ "GET /api/studio/stories": (req) => (hasAccess(req) ? reply(200, { stories: [] }) : reply(500, "")) });
    const result = await runSmoke(options(), h.deps);

    expect(result).toEqual({ ok: false, failedStep: "preflight_failed" });
    expect(h.requests.map(route)).toEqual(["GET /api/studio/stories", "GET /api/studio/stories"]);
  });

  it("smoke-tracer: a 302, 401 or 403 on a later studio call fails at once with access_rejected", async () => {
    const later: Record<string, (status: number) => Record<string, Handler>> = {
      poll: (status) => ({ [`GET /api/studio/runs/${RUN}`]: () => reply(status, "") }),
      create: (status) => ({ "POST /api/studio/stories": () => reply(status, "") }),
      publish: (status) => ({ [`POST /api/studio/stories/${STORY}/releases`]: () => reply(status, "") }),
    };
    for (const [name, overrides] of Object.entries(later)) {
      for (const status of [302, 401, 403]) {
        const h = harness(overrides(status));
        const result = await runSmoke(options(), h.deps);

        expect(result.failedStep, `${name} ${status}`).toBe("access_rejected");
        expect(h.requests.filter((r) => r.path === `/api/studio/runs/${RUN}`).length, `${name} ${status}`).toBeLessThanOrEqual(
          name === "poll" ? 1 : 4,
        );
        expect(h.requests.some((r) => r.path.startsWith("/read/") || r.path.startsWith("/content/"))).toBe(false);
      }
    }
  });

  it("smoke-tracer: a full run creates, polls, publishes, and reads the player, manifest, page and audio", async () => {
    const h = harness();
    const opts = options();
    const result = await runSmoke(opts, h.deps);

    expect(result).toEqual({ ok: true, failedStep: null, storyId: STORY, runId: RUN, runStatus: "draft_ready", releaseId: RELEASE });
    // Consecutive polls collapse into one entry.
    const order = h.requests.map(route).filter((r, i, all) => r !== all[i - 1]);
    expect(order).toEqual([
      "GET /api/studio/stories",
      "GET /api/shelf",
      "POST /api/studio/stories",
      `GET /api/studio/runs/${RUN}`,
      `POST /api/studio/stories/${STORY}/releases`,
      `GET /read/${RELEASE}`,
      `GET ${MANIFEST_PATH}`,
      `GET ${PAGE_PATH}`,
      `GET ${AUDIO_PATH}`,
    ]);
    expect(h.requests.every((r) => r.url.startsWith(`${BASE}/`))).toBe(true);

    const create = h.requests.find((r) => route(r) === "POST /api/studio/stories")!;
    expect(create.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(create.body ?? "null")).toEqual({ text: opts.text });

    // The run is polled until it ends, every pollMs.
    expect(h.requests.filter((r) => r.path === `/api/studio/runs/${RUN}`)).toHaveLength(4);
    expect(h.sleeps.length).toBeGreaterThan(0);
    expect(h.sleeps.every((ms) => ms === opts.pollMs)).toBe(true);
    // A log line only when the status changes: "running" is seen twice, logged once.
    expect(h.logs.filter((l) => l.includes("running"))).toHaveLength(1);
    expect(h.logs.some((l) => l.includes("draft_ready"))).toBe(true);
  });

  it("smoke-tracer: the studio calls carry the Access headers and the public reads carry none", async () => {
    const h = harness();
    const result = await runSmoke(options(), h.deps);

    expect(result.ok).toBe(true);
    const publicReads = h.requests.filter(isPublic);
    const studio = h.requests.filter((r) => r.path.startsWith("/api/studio/"));
    expect(publicReads.map(route)).toEqual([
      "GET /api/shelf",
      `GET /read/${RELEASE}`,
      `GET ${MANIFEST_PATH}`,
      `GET ${PAGE_PATH}`,
      `GET ${AUDIO_PATH}`,
    ]);
    expect(publicReads.every(noAccess)).toBe(true);
    expect(studio.length).toBeGreaterThanOrEqual(5);
    // Only the second request, the preflight check that the studio refuses a caller without the token, has no Access headers.
    expect(studio.filter(noAccess)).toEqual([h.requests[1]]);
    expect(route(h.requests[1]!)).toBe("GET /api/studio/stories");
    expect(studio.filter((r) => r !== h.requests[1]).every(hasAccess)).toBe(true);
    expect(publicReads.length + studio.length).toBe(h.requests.length);
  });

  it("smoke-tracer: a failed run logs only the step names and does not publish", async () => {
    const message = "Provider said: the model output had MODEL-OUTPUT-TEXT in it";
    const error = {
      errors: [
        { runId: RUN, storyId: STORY, pageId: null, step: "script", providerStatus: 500, message },
        { runId: RUN, storyId: STORY, pageId: null, step: "page_text", providerStatus: null, message: `${message} (again)` },
      ],
    };
    const h = harness({ [`GET /api/studio/runs/${RUN}`]: polls(["running", runReply("failed", error)]) });
    const result = await runSmoke(options(), h.deps);

    expect(result).toMatchObject({ ok: false, failedStep: "run_failed", storyId: STORY, runId: RUN, runStatus: "failed" });
    expect(h.requests.some((r) => r.path.endsWith("/releases"))).toBe(false);
    expect(h.requests.some((r) => r.path.startsWith("/read/") || r.path.startsWith("/content/"))).toBe(false);
    const all = h.logs.join("\n");
    expect(all).toContain("script");
    expect(all).toContain("page_text");
    expect(all).not.toContain("MODEL-OUTPUT-TEXT");
    expect(all).not.toContain("Provider said");
  });

  it("smoke-tracer: a run that does not end within the time limit fails with run_timeout", async () => {
    const h = harness({ [`GET /api/studio/runs/${RUN}`]: polls(["running"]) });
    const opts = options({ timeoutMs: 60_000, pollMs: 5_000 });
    const result = await runSmoke(opts, h.deps);

    expect(result).toMatchObject({ ok: false, failedStep: "run_timeout", runId: RUN });
    expect(h.now()).toBeGreaterThanOrEqual(opts.timeoutMs);
    expect(h.now()).toBeLessThan(opts.timeoutMs + 2 * opts.pollMs);
    expect(h.sleeps.every((ms) => ms === opts.pollMs)).toBe(true);
    expect(h.requests.some((r) => r.path.endsWith("/releases"))).toBe(false);
  });

  it("smoke-tracer: a blocked publish logs the page IDs and reasons and reads nothing", async () => {
    const longId = "x".repeat(200);
    const blocking = [
      { pageId: PAGE, page: 1, target: "audio", reason: "missing", message: "MESSAGE-ONE about the page text" },
      { pageId: null, page: null, target: "outline", reason: "needs_review", message: "MESSAGE-TWO about the outline" },
      { pageId: longId, page: 2, target: "scene", reason: "stale", message: "MESSAGE-THREE" },
    ];
    // A needs_review run is published too: the API decides.
    const h = harness({
      [`GET /api/studio/runs/${RUN}`]: polls(["running", "needs_review"]),
      [`POST /api/studio/stories/${STORY}/releases`]: () => reply(409, { error: "publish_blocked", blocking }),
    });
    const result = await runSmoke(options(), h.deps);

    expect(result).toMatchObject({ ok: false, failedStep: "publish_blocked", storyId: STORY, runId: RUN, runStatus: "needs_review" });
    expect(h.requests.filter((r) => r.path.endsWith("/releases"))).toHaveLength(1);
    expect(h.requests.some((r) => r.path.startsWith("/read/") || r.path.startsWith("/content/"))).toBe(false);
    const all = h.logs.join("\n");
    expect(all).toContain(PAGE);
    expect(all).toContain("missing");
    expect(all).toContain("needs_review");
    expect(all).toContain("stale");
    expect(all).toContain("x".repeat(80));
    expect(all).not.toContain("x".repeat(81));
    expect(all).not.toContain("MESSAGE-");
  });

  it("smoke-tracer: a manifest with another releaseId fails with read_manifest", async () => {
    const h = harness({ [`GET ${MANIFEST_PATH}`]: () => reply(200, manifest(OTHER_RELEASE)) });
    const result = await runSmoke(options(), h.deps);

    expect(result).toMatchObject({ ok: false, failedStep: "read_manifest", releaseId: RELEASE });
    expect(h.requests.some((r) => r.path === MANIFEST_PATH)).toBe(true);
    expect(h.requests.some((r) => r.path === PAGE_PATH || r.path === AUDIO_PATH)).toBe(false);
  });

  it("smoke-tracer: a needs_review run is published and read like a draft_ready run", async () => {
    const h = harness({ [`GET /api/studio/runs/${RUN}`]: polls(["running", "needs_review"]) });
    const result = await runSmoke(options(), h.deps);

    expect(result).toEqual({ ok: true, failedStep: null, storyId: STORY, runId: RUN, runStatus: "needs_review", releaseId: RELEASE });
    expect(h.requests.some((r) => r.path === AUDIO_PATH)).toBe(true);
  });

  // Each row: the failing answer, the expected failedStep, and the requests that must not follow.
  const failures: Array<{ step: string; overrides: Record<string, Handler>; notAfter: string[] }> = [
    { step: "shelf_not_public", overrides: { "GET /api/shelf": () => reply(302, "") }, notAfter: ["/api/studio/stories/", "/read/", "/content/"] },
    {
      step: "create_rejected",
      overrides: { "POST /api/studio/stories": () => reply(422, { error: "source_rejected", reason: "too_short" }) },
      notAfter: ["/api/studio/runs/", "/releases", "/read/", "/content/"],
    },
    {
      step: "publish_rejected",
      overrides: { [`POST /api/studio/stories/${STORY}/releases`]: () => reply(500, { error: "internal" }) },
      notAfter: ["/read/", "/content/"],
    },
    { step: "read_player", overrides: { [`GET /read/${RELEASE}`]: () => reply(200, { error: "not_found" }) }, notAfter: ["/content/"] },
    { step: "read_player", overrides: { [`GET /read/${RELEASE}`]: () => reply(404, { error: "not_found" }) }, notAfter: ["/content/"] },
    { step: "read_manifest", overrides: { [`GET ${MANIFEST_PATH}`]: () => reply(404, { error: "not_found" }) }, notAfter: [PAGE_PATH, AUDIO_PATH] },
    {
      step: "read_manifest",
      overrides: { [`GET ${MANIFEST_PATH}`]: () => reply(200, { ...manifest(RELEASE), pages: [] }) },
      notAfter: [PAGE_PATH, AUDIO_PATH],
    },
    { step: "read_page", overrides: { [`GET ${PAGE_PATH}`]: () => reply(404, { error: "not_found" }) }, notAfter: [AUDIO_PATH] },
    { step: "read_page", overrides: { [`GET ${PAGE_PATH}`]: () => reply(200, { ...pageJson, audio: undefined }) }, notAfter: [AUDIO_PATH] },
    { step: "read_audio", overrides: { [`GET ${AUDIO_PATH}`]: () => reply(404, { error: "not_found" }) }, notAfter: [] },
    { step: "read_audio", overrides: { [`GET ${AUDIO_PATH}`]: () => reply(200, new Uint8Array(0), "audio/mpeg") }, notAfter: [] },
    { step: "read_audio", overrides: { [`GET ${AUDIO_PATH}`]: () => reply(200, "not audio", "text/plain") }, notAfter: [] },
  ];

  it("smoke-tracer: each failing answer names its step and stops the later requests", async () => {
    for (const f of failures) {
      const h = harness(f.overrides);
      const result = await runSmoke(options(), h.deps);
      const trigger = Object.keys(f.overrides)[0]!;
      const at = h.requests.findIndex((r) => route(r) === trigger);

      expect(result, f.step).toMatchObject({ ok: false, failedStep: f.step });
      expect(at, `${f.step}: ${trigger} requested`).toBeGreaterThanOrEqual(0);
      const later = h.requests.slice(at + 1).map((r) => r.path);
      for (const part of f.notAfter) expect(later.some((p) => p.includes(part)), `${f.step}: no ${part} after ${trigger}`).toBe(false);
    }
  });

  it("smoke-tracer: no log line contains the client id or the client secret", async () => {
    const leaks = (text: string) => text.includes(CLIENT_ID) || text.includes(CLIENT_SECRET);

    // The happy path.
    const ok = harness();
    const happy = await smoke(options(), ok.deps);
    expect(happy.result?.ok).toBe(true);
    expect(ok.logs.some((l) => l.includes(RUN))).toBe(true);
    expect(ok.logs.some(leaks)).toBe(false);
    expect(leaks(happy.thrown ?? "")).toBe(false);

    // A rejected create: only the status and the error and reason strings are logged.
    const bad = harness({
      "POST /api/studio/stories": () => reply(422, { error: "source_rejected", reason: "too_short", echo: CLIENT_SECRET }),
    });
    const rejected = await smoke(options(), bad.deps);
    expect(rejected.thrown ?? "").not.toContain(CLIENT_SECRET);
    expect(rejected.result).toMatchObject({ ok: false, failedStep: "create_rejected" });
    const all = bad.logs.join("\n");
    expect(all).toContain("422");
    expect(all).toContain("source_rejected");
    expect(all).toContain("too_short");
    expect(bad.logs.some(leaks)).toBe(false);
    expect(leaks(rejected.thrown ?? "")).toBe(false);
  });

  describe("args", () => {
    const fails = (argv: string[], env: Record<string, string | undefined> = {}) => {
      try {
        args(argv, env);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    it("smoke-tracer: --base and SMOKE_BASE accept https and http only for localhost or 127.0.0.1", () => {
      expect(args([], {}).base).toBe("https://lullabyte.ioenv.com");
      expect(args(["--base", "https://smoke.example.test/"], {}).base).toBe("https://smoke.example.test");
      expect(args([], { SMOKE_BASE: "https://smoke.example.test" }).base).toBe("https://smoke.example.test");
      expect(args(["--base", "http://localhost:8787"], {}).base).toBe("http://localhost:8787");
      expect(args(["--base", "http://127.0.0.1:8787/"], {}).base).toBe("http://127.0.0.1:8787");
      expect(args(["--base", "http://localhost"], {}).base).toBe("http://localhost");

      const bad = ["http://smoke.example.test", "http://localhost.evil.test", "http://127.0.0.1.evil.test", "ftp://x", "sekret-BASE"];
      for (const base of bad) {
        for (const message of [fails(["--base", base]), fails([], { SMOKE_BASE: base })]) {
          expect(message, base).not.toBeNull();
          expect(message, base).not.toContain(base);
        }
      }
    });

    it("smoke-tracer: an unknown argument is named by its position, not its value", () => {
      const message = fails(["--run", "--text-file", "a.txt", "sekret-PASTED"]);

      expect(message).not.toBeNull();
      expect(message).not.toContain("sekret-PASTED");
      expect(message).toContain("4");
    });
  });
});
