import { zValidator } from "@hono/zod-validator";
import { type Issue, type Outline, type PageScene, PageSceneSchema, PageTextSchema, validateScene } from "@storybook/dsl";
import { TEMPLATES, layoutScene } from "@storybook/layout";
import { desc, eq } from "drizzle-orm";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import {
  type Db,
  HeadCasExhaustedError,
  type HeadKey,
  type Heads,
  type RevisionRow,
  type RunScope,
  asset,
  assetKeysOfScene,
  assetVersion,
  callLog,
  createStory,
  getDb,
  loadActiveRegistry,
  loadStoryHeads,
  markRunFailed,
  newId,
  pageStates,
  release,
  revision,
  run,
  saveHumanRevision,
  story,
} from "../db";
import { handleContent } from "../publish/content";
import { publishStory } from "../publish/publish";
import { serveR2Object } from "../publish/serve";
import {
  CreateStoryRequestSchema,
  OperatorSceneSchema,
  PutSceneRequestSchema,
  PutTextRequestSchema,
  StartRunRequestSchema,
  StillFitsRequestSchema,
  UUID_V7,
} from "./schemas";
import { fetchArticleText, limitWords } from "./source";
import { runSteps, toRevisionView } from "./views";

type AppEnv = { Bindings: Env };
type C = Context<AppEnv>;

export const app = new Hono<AppEnv>();

const FILES = "/api/studio/files/";
const FILE_CACHE = "private, max-age=31536000, immutable";

const notFound = (c: C) => c.json({ error: "not_found" }, 404);

// Path IDs are lower-case UUID v7; anything else is 404 ("Exact changes" 1).
const ids: MiddlewareHandler<AppEnv> = async (c, next) => {
  const params = c.req.param() as Record<string, string>;
  for (const name of ["id", "pageId", "releaseId"]) {
    const value = params[name];
    if (value !== undefined && !UUID_V7.test(value)) return notFound(c);
  }
  await next();
};

const body = <T extends z.ZodType>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
      return c.json({ error: "bad_request", issues }, 400);
    }
  });

const zodIssues = (error: z.ZodError, code?: string): Issue[] =>
  error.issues.map((i) => ({ path: i.path.map(String).join("."), code: code ?? i.code, message: i.message }));

// Deploy checks this route (ADR 0011).
app.get("/health", (c) => c.text("ok"));

// ---- Helpers ----

// Writes the run row first, then the Workflow instance. If `create` throws,
// the run is marked failed, so it is never left queued with no instance.
async function startWorkflow(env: Env, db: Db, runId: string, storyId: string, scope: RunScope): Promise<boolean> {
  try {
    await env.STORY_RUN.create({ id: runId, params: { runId, storyId, scope } });
    return true;
  } catch (err) {
    console.error(JSON.stringify({ event: "workflow_create_failed", runId, error: (err as Error | null)?.name ?? "unknown" }));
    await markRunFailed(db, runId, {
      errors: [{ runId, storyId, pageId: null, step: "create", providerStatus: null, message: "The Workflow instance could not be created." }],
    });
    return false;
  }
}

async function revisionById(db: Db, id: string | null | undefined): Promise<RevisionRow | null> {
  if (!id) return null;
  const [row] = await db.select().from(revision).where(eq(revision.id, id));
  return row ?? null;
}

// The story heads, and the page when it is in the outline head.
async function loadPage(db: Db, storyId: string, pageId: string) {
  const loaded = await loadStoryHeads(db, storyId);
  if (!loaded) return null;
  const outline = outlineOf(loaded.story.heads, loaded.revisions);
  if (!outline?.pages.some((p) => p.pageId === pageId)) return null;
  return { heads: loaded.story.heads, revisions: loaded.revisions };
}

function outlineOf(heads: Heads, revisions: ReadonlyMap<string, RevisionRow>): Outline | null {
  const id = heads.outline;
  return id ? ((revisions.get(id)?.content as Outline | undefined) ?? null) : null;
}

function headMoved(c: C, current: RevisionRow | null | undefined) {
  return c.json({ error: "head_moved", current: current ? toRevisionView(current) : null }, 409);
}

const invalidScene = (c: C, issues: Issue[]) => c.json({ error: "invalid_scene", issues }, 422);

// Validation and layout, with the same checks as a model output. Returns the
// laid-out scene, or the issues.
function checkScene(scene: unknown, registry: Awaited<ReturnType<typeof loadActiveRegistry>>) {
  const parsed = PageSceneSchema.safeParse(scene);
  if (!parsed.success) return { issues: zodIssues(parsed.error, "schema") };
  const ctx = { registry, templates: TEMPLATES };
  const issues = validateScene(parsed.data, ctx);
  if (issues.length > 0) return { issues };
  const laid = layoutScene(parsed.data, ctx);
  if (laid.issues.length > 0) return { issues: laid.issues };
  return { issues: [], scene: laid.scene };
}

function versionsOf(scene: PageScene, registry: Awaited<ReturnType<typeof loadActiveRegistry>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of assetKeysOfScene(scene)) {
    const entry = registry.assets[key];
    if (entry) out[key] = entry.version;
  }
  return out;
}

// Saves a human revision with `expected = basedOn` (amendment R58).
async function save(c: C, db: Db, input: Parameters<typeof saveHumanRevision>[1]) {
  let result: Awaited<ReturnType<typeof saveHumanRevision>>;
  try {
    result = await saveHumanRevision(db, input);
  } catch (err) {
    if (err instanceof HeadCasExhaustedError) return c.json({ error: "busy" }, 503);
    throw err;
  }
  if (result.status === "superseded") return headMoved(c, await revisionById(db, result.currentId));
  const row = await revisionById(db, result.revisionId);
  if (!row) throw new Error("saved revision not found");
  return c.json({ revision: toRevisionView(row) }, 200);
}

// ---- Stories ----

app.post("/api/studio/stories", body(CreateStoryRequestSchema), async (c) => {
  const input = c.req.valid("json");
  let text: string;
  let url: string | null = null;
  if ("url" in input) {
    const fetched = await fetchArticleText(input.url);
    if (!fetched.ok) return c.json({ error: "source_rejected", reason: fetched.reason }, 422);
    text = fetched.text;
    url = input.url;
  } else {
    text = input.text;
  }
  const limited = limitWords(text);
  if (!limited.ok) return c.json({ error: "source_rejected", reason: limited.reason, words: limited.words }, 422);

  const db = getDb(c.env.DB);
  const ids = { storyId: newId(), sourceRevisionId: newId(), runId: newId() };
  await createStory(db, { ...ids, source: { text: limited.text, url, words: limited.words, truncated: limited.truncated } });
  if (!(await startWorkflow(c.env, db, ids.runId, ids.storyId, { kind: "full" }))) {
    return c.json({ error: "workflow_unavailable", runId: ids.runId }, 503);
  }
  return c.json({ storyId: ids.storyId, runId: ids.runId, words: limited.words, truncated: limited.truncated }, 202);
});

app.get("/api/studio/stories", async (c) => {
  const rows = await getDb(c.env.DB)
    .select({ id: story.id, title: story.title, status: story.status, createdAt: story.createdAt, publishedReleaseId: story.publishedReleaseId })
    .from(story)
    .orderBy(desc(story.id))
    .limit(100);
  return c.json({ stories: rows }, 200);
});

app.get("/api/studio/stories/:id", ids, async (c) => {
  const db = getDb(c.env.DB);
  const storyId = c.req.param("id");
  const loaded = await loadStoryHeads(db, storyId);
  if (!loaded) return notFound(c);
  const { story: row, revisions } = loaded;
  const heads = row.heads;
  const view = (key: HeadKey) => {
    const id = heads[key];
    const rev = id === undefined ? undefined : revisions.get(id);
    return rev ? toRevisionView(rev) : null;
  };
  const source = view("source");
  if (!source) throw new Error("story has no source head");
  const outline = outlineOf(heads, revisions);
  const pages = outline?.pages ?? [];
  const states = pageStates({ pageIds: pages.map((p) => p.pageId), heads, revisions });
  const releases = await db
    .select({ id: release.id, number: release.number, createdAt: release.createdAt })
    .from(release)
    .where(eq(release.storyId, storyId))
    .orderBy(release.number);
  const [latest] = await db
    .select({ id: run.id, status: run.status, scope: run.scope, error: run.error })
    .from(run)
    .where(eq(run.storyId, storyId))
    .orderBy(desc(run.createdAt), desc(run.id))
    .limit(1);
  return c.json(
    {
      story: {
        id: row.id,
        title: row.title,
        status: row.status,
        headsVersion: row.headsVersion,
        publishedReleaseId: row.publishedReleaseId,
        createdAt: row.createdAt,
      },
      heads,
      source,
      pages: states.map((s, i) => ({
        pageId: s.pageId,
        number: s.number,
        beat: pages[i]!.beat,
        state: s.state,
        problems: s.problems,
        text: view(`page_text:${s.pageId}`),
        scene: view(`scene:${s.pageId}`),
        audio: view(`audio:${s.pageId}`),
      })),
      releases,
      latestRun: latest ? { ...latest, error: latest.error ?? null } : null,
    },
    200,
  );
});

// ---- Runs ----

app.get("/api/studio/runs/:id", ids, async (c) => {
  const db = getDb(c.env.DB);
  const [row] = await db.select().from(run).where(eq(run.id, c.req.param("id")));
  if (!row) return notFound(c);

  let workflowStatus: string | null = null;
  if (row.status === "queued" || row.status === "running") {
    try {
      if (!row.workflowInstanceId) throw new Error("no instance");
      workflowStatus = (await (await c.env.STORY_RUN.get(row.workflowInstanceId)).status()).status;
    } catch {
      workflowStatus = "unknown";
    }
  }

  const loaded = await loadStoryHeads(db, row.storyId);
  const outline = loaded ? outlineOf(loaded.story.heads, loaded.revisions) : null;
  const done = await db
    .selectDistinct({ step: callLog.step })
    .from(callLog)
    .innerJoin(revision, eq(revision.callId, callLog.callId))
    .where(eq(callLog.runId, row.id));
  const steps = runSteps({
    scope: row.scope,
    pageIds: outline?.pages.map((p) => p.pageId) ?? [],
    done: new Set(done.map((d) => d.step)),
    failed: new Set((row.error?.errors ?? []).map((e) => e.step)),
  });
  return c.json(
    {
      run: {
        id: row.id,
        storyId: row.storyId,
        scope: row.scope,
        status: row.status,
        error: row.error ?? null,
        createdAt: row.createdAt,
        finishedAt: row.finishedAt,
        workflowStatus,
      },
      steps,
    },
    200,
  );
});

// One statement decides whether the run may start (R49, R61): no run of the
// story is queued or running and, for a full run, the story has no outline
// head. The same batch reads the active run for the 409 answer.
async function insertRunIfAllowed(env: Env, runId: string, storyId: string, scope: RunScope) {
  const outlineRule = scope.kind === "full" ? "AND EXISTS (SELECT 1 FROM story WHERE id = ?2 AND json_extract(heads, '$.outline') IS NULL)" : "";
  const insert = env.DB.prepare(
    `INSERT INTO run (id, story_id, scope, status, workflow_instance_id, created_at)
     SELECT ?1, ?2, ?3, 'queued', ?1, ?4
     WHERE NOT EXISTS (SELECT 1 FROM run WHERE story_id = ?2 AND status IN ('queued', 'running')) ${outlineRule}`,
  ).bind(runId, storyId, JSON.stringify(scope), new Date().toISOString());
  const active = env.DB.prepare(
    `SELECT id FROM run WHERE story_id = ?1 AND id <> ?2 AND status IN ('queued', 'running')
     ORDER BY created_at DESC, id DESC LIMIT 1`,
  ).bind(storyId, runId);
  const [inserted, current] = await env.DB.batch<{ id: string }>([insert, active]);
  return { inserted: (inserted?.meta.changes ?? 0) === 1, activeRunId: current?.results[0]?.id ?? null };
}

app.post("/api/studio/stories/:id/runs", ids, body(StartRunRequestSchema), async (c) => {
  const db = getDb(c.env.DB);
  const storyId = c.req.param("id");
  const { scope } = c.req.valid("json");
  const loaded = await loadStoryHeads(db, storyId);
  if (!loaded) return notFound(c);
  if (scope.kind === "page" && !outlineOf(loaded.story.heads, loaded.revisions)?.pages.some((p) => p.pageId === scope.pageId)) {
    return notFound(c);
  }
  const runId = newId();
  const result = await insertRunIfAllowed(c.env, runId, storyId, scope);
  if (!result.inserted) {
    if (scope.kind === "full") return c.json({ error: "full_run_not_allowed" }, 409);
    if (!result.activeRunId) throw new Error("run insert refused with no active run");
    return c.json({ error: "run_active", runId: result.activeRunId }, 409);
  }
  if (!(await startWorkflow(c.env, db, runId, storyId, scope))) return c.json({ error: "workflow_unavailable", runId }, 503);
  return c.json({ runId }, 202);
});

// ---- Page edits ----

app.put("/api/studio/stories/:id/pages/:pageId/text", ids, body(PutTextRequestSchema), async (c) => {
  const db = getDb(c.env.DB);
  const storyId = c.req.param("id");
  const pageId = c.req.param("pageId");
  const { text, basedOn } = c.req.valid("json");
  const page = await loadPage(db, storyId, pageId);
  if (!page) return notFound(c);
  const headId = page.heads[`page_text:${pageId}`] ?? null;
  if (headId !== basedOn) return headMoved(c, headId ? page.revisions.get(headId) : null);
  const parsed = PageTextSchema.safeParse({ text });
  if (!parsed.success) return c.json({ error: "invalid_text", issues: zodIssues(parsed.error) }, 422);
  return save(c, db, { storyId, kind: "page_text", pageId, content: parsed.data, basis: {}, basedOn });
});

app.put("/api/studio/stories/:id/pages/:pageId/scene", ids, body(PutSceneRequestSchema), async (c) => {
  const db = getDb(c.env.DB);
  const storyId = c.req.param("id");
  const pageId = c.req.param("pageId");
  const { scene, basedOn } = c.req.valid("json");
  const page = await loadPage(db, storyId, pageId);
  if (!page) return notFound(c);
  const headId = page.heads[`scene:${pageId}`] ?? null;
  if (headId !== basedOn) return headMoved(c, headId ? page.revisions.get(headId) : null);

  const operator = OperatorSceneSchema.safeParse(scene);
  if (!operator.success) return invalidScene(c, zodIssues(operator.error, "schema"));
  // A sent ID must be a layer of the `basedOn` revision; with no `basedOn`,
  // no layer may send one (R41, R49).
  const base = basedOn ? PageSceneSchema.safeParse(page.revisions.get(basedOn)?.content) : null;
  const known = new Set(base?.success ? base.data.layers.map((l) => l.instanceId) : []);
  const unknown: Issue[] = [];
  operator.data.layers.forEach((layer, i) => {
    if (layer.instanceId !== undefined && !known.has(layer.instanceId)) {
      unknown.push({ path: `layers.${i}.instanceId`, code: "unknown_instance", message: `Layer ID "${layer.instanceId}" is not a layer of the edited revision.` });
    }
  });
  if (unknown.length > 0) return invalidScene(c, unknown);
  const withIds = { ...operator.data, layers: operator.data.layers.map((l) => ({ ...l, instanceId: l.instanceId ?? newId() })) };

  const registry = await loadActiveRegistry(db);
  const checked = checkScene(withIds, registry);
  if (!checked.scene) return invalidScene(c, checked.issues);
  const textHead = page.heads[`page_text:${pageId}`];
  return save(c, db, {
    storyId,
    kind: "scene",
    pageId,
    content: checked.scene,
    basis: textHead ? { [`page_text:${pageId}`]: textHead } : {},
    assetVersions: versionsOf(checked.scene, registry),
    basedOn,
  });
});

app.post("/api/studio/stories/:id/pages/:pageId/scene/still-fits", ids, body(StillFitsRequestSchema), async (c) => {
  const db = getDb(c.env.DB);
  const storyId = c.req.param("id");
  const pageId = c.req.param("pageId");
  const { basedOn, textBasedOn } = c.req.valid("json");
  const page = await loadPage(db, storyId, pageId);
  if (!page) return notFound(c);
  const sceneId = page.heads[`scene:${pageId}`];
  const current = sceneId ? page.revisions.get(sceneId) : undefined;
  if (!sceneId || !current) return notFound(c);
  if (sceneId !== basedOn) return headMoved(c, current);
  const textHead = page.heads[`page_text:${pageId}`] ?? null;
  if (textHead !== textBasedOn) return headMoved(c, textHead ? page.revisions.get(textHead) : null);
  if (current.status !== "ok") return c.json({ error: "scene_needs_review" }, 409);

  // The layout is a check here; the saved content is the copy.
  const registry = await loadActiveRegistry(db);
  const checked = checkScene(current.content, registry);
  if (!checked.scene) return invalidScene(c, checked.issues);
  const content = PageSceneSchema.parse(current.content);
  return save(c, db, {
    storyId,
    kind: "scene",
    pageId,
    content: current.content,
    basis: { [`page_text:${pageId}`]: textBasedOn },
    assetVersions: versionsOf(content, registry),
    basedOn,
  });
});

// ---- Publish ----

app.post("/api/studio/stories/:id/releases", ids, async (c) => {
  const result = await publishStory(c.env, c.req.param("id"));
  if (result.ok) {
    return c.json(
      {
        releaseId: result.releaseId,
        number: result.number,
        manifestUrl: `/content/releases/${result.releaseId}/manifest.json`,
        playerUrl: `/read/${result.releaseId}`,
      },
      201,
    );
  }
  if (result.reason === "not_found") return notFound(c);
  if (result.reason === "blocked") return c.json({ error: "publish_blocked", blocking: result.blocking }, 409);
  return c.json({ error: "publish_conflict" }, 409);
});

// ---- Registry and files ----

app.get("/api/studio/registry", async (c) => {
  const rows = await getDb(c.env.DB)
    .select({
      key: asset.key,
      kind: asset.kind,
      name: asset.name,
      version: assetVersion.version,
      renderer: assetVersion.renderer,
      manifest: assetVersion.manifest,
      r2Prefix: assetVersion.r2Prefix,
    })
    .from(assetVersion)
    .innerJoin(asset, eq(asset.id, assetVersion.assetId))
    .where(eq(assetVersion.active, true))
    .orderBy(asset.key);
  const assets = rows.map(({ r2Prefix, ...r }) => ({ ...r, base: `${FILES}${r2Prefix}` }));
  return c.json({ assets, templates: TEMPLATES }, 200);
});

// Registry assets and draft audio for the Studio. Only keys under `assets/`
// and `calls/`, with no `..` segment.
app.get(`${FILES}*`, async (c) => {
  let key: string;
  try {
    key = decodeURIComponent(new URL(c.req.url).pathname.slice(FILES.length));
  } catch {
    return notFound(c);
  }
  if (!(key.startsWith("assets/") || key.startsWith("calls/")) || key.split("/").includes("..")) return notFound(c);
  const res = await serveR2Object(c.env.BUCKET, key, c.req.raw, FILE_CACHE);
  return res.status === 404 ? notFound(c) : res;
});

// Public release files (#20).
app.get("/content/releases/:releaseId/*", ids, (c) => handleContent(c));

// ---- Errors ----

app.notFound((c) => notFound(c));

app.onError((err, c) => {
  if (err instanceof HTTPException && err.status === 400) return c.json({ error: "bad_request", issues: [] }, 400);
  // Only the method, the path, and the error name: no body, no query string.
  console.error(JSON.stringify({ method: c.req.method, path: c.req.path, error: err.name }));
  return c.json({ error: "internal" }, 500);
});
