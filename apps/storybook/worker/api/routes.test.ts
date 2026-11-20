import { env } from "cloudflare:workers";
import { type AssetManifest, type Outline, type PageScene, PageSceneSchema, isLayerManifest } from "@storybook/dsl";
import { TEMPLATES } from "@storybook/layout";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ErrorRecord,
  type HeadKey,
  asset,
  assetVersion,
  commitHead,
  getDb,
  insertRevisions,
  insertRun,
  loadActiveRegistry,
  loadStoryHeads,
  markRunFailed,
  newId,
  revision,
  run,
  saveHumanRevision,
  story,
} from "../db";
import { seedPublishableStory } from "../publish/test/fixtures";
import { newCall, newStory, seedRegistry } from "../test/fixtures";
import { seams } from "../workflow/seams";
import { audioStep } from "../workflow/steps/audio";
import { finishStep } from "../workflow/steps/finish";
import { freezeStep } from "../workflow/steps/freeze";
import { sceneStep } from "../workflow/steps/scene";
import { scriptStep } from "../workflow/steps/script";
import { createStubModel } from "../workflow/stub-model";
import { app } from "./app";
import {
  CreateStoryResponseSchema,
  ErrorSchema,
  HeadMovedSchema,
  PublishBlockedSchema,
  RegistryResponseSchema,
  RevisionResponseSchema,
  RunResponseSchema,
  SourceRejectedSchema,
  StartRunResponseSchema,
  StoryDetailResponseSchema,
  StoryListResponseSchema,
  WorkflowUnavailableSchema,
} from "./schemas";

const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const db = () => getDb(env.DB);

const DEFAULT_SEAMS = { ...seams };
afterEach(() => {
  Object.assign(seams, DEFAULT_SEAMS);
  vi.restoreAllMocks();
});

// ---- Helpers ----

// An env whose Workflow binding records `create` calls and never starts a
// run, so no route test reaches a real model.
function fakeEnv(opts: { createFails?: boolean; workflowStatus?: string } = {}) {
  const create = vi.fn(async (o?: { id?: string }) => {
    if (opts.createFails) throw new Error("down");
    return { id: o?.id ?? "" };
  });
  const get = vi.fn(async (id: string) => ({ id, status: async () => ({ status: opts.workflowStatus ?? "running" }) }));
  const e = { ...env, STORY_RUN: { create, get } as unknown as Env["STORY_RUN"] } as Env;
  return { env: e, create, get };
}

function call(e: Env, method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit =
    body === undefined ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  return Promise.resolve(app.request(path, init, e));
}

const words = (n: number, prefix = "word") => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

async function counts() {
  return { stories: await db().$count(story), runs: await db().$count(run) };
}

const revisionCount = (storyId: string) => db().$count(revision, eq(revision.storyId, storyId));

async function readStory(storyId: string) {
  const loaded = (await loadStoryHeads(db(), storyId))!;
  const heads = loaded.story.heads;
  const outline = heads.outline ? (loaded.revisions.get(heads.outline)!.content as Outline) : null;
  const head = (key: HeadKey) => {
    const id = heads[key];
    return id === undefined ? undefined : loaded.revisions.get(id);
  };
  return { story: loaded.story, heads, pageIds: outline?.pages.map((p) => p.pageId) ?? [], head };
}

// A story drafted by the real steps with the stub model, without the
// Workflow: freeze, script, scene and audio per page, finish.
async function draftStory() {
  await seedRegistry(env);
  const registry = await loadActiveRegistry(db());
  const stub = createStubModel({ registry });
  seams.modelClient = () => stub.client;
  const ids = await newStory(db());
  await freezeStep(env, ids.runId, ids.storyId);
  const script = await scriptStep(env, ids.runId, ids.storyId);
  if (script.status !== "ok") throw new Error("draftStory: script step failed");
  for (const p of script.pages) {
    await sceneStep(env, ids.runId, ids.storyId, p.pageId);
    await audioStep(env, ids.runId, ids.storyId, p.pageId);
  }
  await finishStep(env, ids.runId, ids.storyId, { failed: false, errors: [] });
  const st = await readStory(ids.storyId);
  return { ...ids, stub, pageIds: st.pageIds };
}

async function sceneHead(storyId: string, pageId: string) {
  const row = (await readStory(storyId)).head(`scene:${pageId}`)!;
  return { id: row.id, content: PageSceneSchema.parse(row.content), basis: row.basis };
}

async function textHeadId(storyId: string, pageId: string): Promise<string> {
  return (await readStory(storyId)).heads[`page_text:${pageId}`]!;
}

// Moves the scene head to a human copy of the current scene; returns its ID.
async function moveSceneHead(storyId: string, pageId: string): Promise<string> {
  const current = await sceneHead(storyId, pageId);
  const saved = await saveHumanRevision(db(), {
    storyId,
    kind: "scene",
    pageId,
    content: current.content,
    basis: { [`page_text:${pageId}`]: await textHeadId(storyId, pageId) },
    basedOn: current.id,
  });
  if (saved.status !== "moved") throw new Error("moveSceneHead: head did not move");
  return saved.revisionId;
}

// Moves the text head of a page; returns the new revision ID.
async function saveText(storyId: string, pageId: string, text: string): Promise<string> {
  const saved = await saveHumanRevision(db(), {
    storyId,
    kind: "page_text",
    pageId,
    content: { text },
    basis: {},
    basedOn: await textHeadId(storyId, pageId),
  });
  if (saved.status !== "moved") throw new Error("saveText: head did not move");
  return saved.revisionId;
}

// Inserts version 2 of `key` (the v1 manifest, changed by `change`) and makes
// it the active version. Returns a function that removes it and makes v1
// active again (rows stay between tests of this file).
async function activateVersion2(key: string, change: (m: AssetManifest) => AssetManifest = (m) => m): Promise<() => Promise<void>> {
  const d = db();
  const a = (await d.query.asset.findFirst({ where: (t, { eq: is }) => is(t.key, key) }))!;
  const v1 = (await d.query.assetVersion.findFirst({ where: (t, { and, eq: is }) => and(is(t.assetId, a.id), is(t.version, 1)) }))!;
  await d.batch([
    d.update(assetVersion).set({ active: false }).where(eq(assetVersion.assetId, a.id)),
    d.insert(assetVersion).values({
      id: newId(),
      assetId: a.id,
      version: 2,
      renderer: v1.renderer,
      manifest: change(structuredClone(v1.manifest)),
      r2Prefix: `assets/${key}/v2/`,
      active: true,
      createdAt: new Date().toISOString(),
    }),
  ]);
  return async () => {
    await d.batch([
      d.delete(assetVersion).where(and(eq(assetVersion.assetId, a.id), eq(assetVersion.version, 2))),
      d.update(assetVersion).set({ active: true }).where(eq(assetVersion.id, v1.id)),
    ]);
  };
}

// Adds an active character asset with the given legal pairs. Returns a
// function that deactivates it.
async function addCharacter(key: string, legal: Array<{ pose: string; expression: string }>): Promise<() => Promise<void>> {
  const d = db();
  const foot = { x: 200, y: 800 };
  const box = { x: 0, y: 0, w: 400, h: 800 };
  const face = { x: 120, y: 60, w: 160, h: 160 };
  const manifest: AssetManifest = {
    kind: "character",
    poses: ["happy", "calm"].map((expression) => ({ id: "stand", file: `stand-${expression}.webp`, foot, box, face, expression })),
    expressions: ["happy", "calm"],
    legal,
    flippable: true,
  };
  const assetId = newId();
  const createdAt = new Date().toISOString();
  await d.insert(asset).values({ id: assetId, key, kind: "character", name: key, createdAt });
  await d
    .insert(assetVersion)
    .values({ id: newId(), assetId, version: 1, renderer: "webp", manifest, r2Prefix: `assets/${key}/v1/`, active: true, createdAt });
  return async () => {
    await d.update(assetVersion).set({ active: false }).where(eq(assetVersion.assetId, assetId));
  };
}

// Turns off the active version of `key`. Returns a function that restores it.
async function deactivateAsset(key: string): Promise<() => Promise<void>> {
  const d = db();
  const a = (await d.query.asset.findFirst({ where: (t, { eq: is }) => is(t.key, key) }))!;
  const active = await d
    .select({ id: assetVersion.id })
    .from(assetVersion)
    .where(and(eq(assetVersion.assetId, a.id), eq(assetVersion.active, true)));
  await d.update(assetVersion).set({ active: false }).where(eq(assetVersion.assetId, a.id));
  return async () => {
    for (const { id } of active) await d.update(assetVersion).set({ active: true }).where(eq(assetVersion.id, id));
  };
}

const textPath = (storyId: string, pageId: string) => `/api/studio/stories/${storyId}/pages/${pageId}/text`;
const scenePath = (storyId: string, pageId: string) => `/api/studio/stories/${storyId}/pages/${pageId}/scene`;
const stillFitsPath = (storyId: string, pageId: string) => `${scenePath(storyId, pageId)}/still-fits`;

function articleHtml(paragraphs: string[]): string {
  return [
    "<html><head><title>News</title></head><body>",
    "<nav><p>Home News Sport Weather</p></nav>",
    "<div class='promo'>Read more stories outside the article.</div>",
    `<article><h1>Big news</h1>${paragraphs.map((p) => `<p>${p}</p>`).join("")}</article>`,
    "<footer><p>Copyright notice outside the article.</p></footer>",
    "</body></html>",
  ].join("");
}

const htmlResponse = (html: string) => new Response(html, { status: 200, headers: { "content-type": "text/html" } });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const calledUrls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => (c[0] instanceof Request ? c[0].url : String(c[0])));

async function sourceText(storyId: string): Promise<string> {
  const st = await readStory(storyId);
  return (st.head("source")!.content as { text: string }).text;
}

// ---- Tests ----

describe("Studio API routes", () => {
  it("POST stories with text returns 202 and writes story, source, and run", async () => {
    const f = fakeEnv();
    const text = words(250);
    const res = await call(f.env, "POST", "/api/studio/stories", { text });
    expect(res.status).toBe(202);
    const body = CreateStoryResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ words: 250, truncated: false });
    const st = await readStory(body.storyId);
    expect(st.story.status).toBe("draft");
    expect(st.head("source")!.content).toEqual({ text, url: null, words: 250, truncated: false });
    expect(st.head("source")!.origin).toBe("human");
    const [r] = await db().select().from(run).where(eq(run.id, body.runId));
    expect(r).toMatchObject({ storyId: body.storyId, status: "queued", scope: { kind: "full" }, workflowInstanceId: body.runId });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledWith({
      id: body.runId,
      params: { runId: body.runId, storyId: body.storyId, scope: { kind: "full" } },
    });
  });

  it("POST stories with both text and url returns 400", async () => {
    const f = fakeEnv();
    const before = await counts();
    const res = await call(f.env, "POST", "/api/studio/stories", { text: words(250), url: "https://news.test/a" });
    expect(res.status).toBe(400);
    const body = ErrorSchema.parse(await res.json());
    expect(body.error).toBe("bad_request");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(await counts()).toEqual(before);
    expect(f.create).not.toHaveBeenCalled();
  });

  it("POST stories when the workflow is down returns 503 and marks the run failed", async () => {
    const f = fakeEnv({ createFails: true });
    const res = await call(f.env, "POST", "/api/studio/stories", { text: words(250) });
    expect(res.status).toBe(503);
    const body = WorkflowUnavailableSchema.parse(await res.json());
    const [r] = await db().select().from(run).where(eq(run.id, body.runId));
    expect(r!.status).toBe("failed");
    expect(r!.finishedAt).not.toBeNull();
    expect(r!.error).not.toBeNull();
  });

  it("POST stories when the workflow is down returns 503 with the story and run IDs", async () => {
    const f = fakeEnv({ createFails: true });
    const res = await call(f.env, "POST", "/api/studio/stories", { text: words(250) });
    expect(res.status).toBe(503);
    const raw = (await res.json()) as { storyId: string; runId: string };
    expect(raw).toEqual({ error: "workflow_unavailable", storyId: raw.storyId, runId: raw.runId });
    WorkflowUnavailableSchema.parse(raw);
    const [r] = await db().select().from(run).where(eq(run.id, raw.runId));
    expect(r!.storyId).toBe(raw.storyId);
    expect(r!.status).toBe("failed");
  });

  it("POST runs when the workflow is down returns 503 with the run ID and marks the run failed", async () => {
    const f = fakeEnv({ createFails: true });
    const ids = await newStory(db());
    await markRunFailed(db(), ids.runId, { errors: [] });
    const res = await call(f.env, "POST", `/api/studio/stories/${ids.storyId}/runs`, { scope: { kind: "full" } });
    expect(res.status).toBe(503);
    const raw = (await res.json()) as { runId: string };
    expect(raw).toEqual({ error: "workflow_unavailable", runId: raw.runId });
    WorkflowUnavailableSchema.parse(raw);
    const [r] = await db().select().from(run).where(eq(run.id, raw.runId));
    expect(r).toMatchObject({ storyId: ids.storyId, status: "failed" });
    expect(r!.finishedAt).not.toBeNull();
  });

  it("PUT text with an empty text and an old basedOn returns 409 head_moved", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const old = await textHeadId(d.storyId, p1);
    const newHead = await saveText(d.storyId, p1, "Page 1. Someone else changed this.");
    const before = await revisionCount(d.storyId);
    const res = await call(fakeEnv().env, "PUT", textPath(d.storyId, p1), { text: "", basedOn: old });
    expect(res.status).toBe(409);
    const body = HeadMovedSchema.parse(await res.json());
    expect(body.current!.id).toBe(newHead);
    expect(await revisionCount(d.storyId)).toBe(before);
  });

  it("PUT text of 40 words and about 440 characters is saved", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    // One sentence of 40 words: valid PageText (1 to 40 words, 1 to 3 sentences).
    const text = `${Array.from({ length: 40 }, (_, i) => `storyword${String(i).padStart(2, "0")}`).join(" ")}.`;
    expect(text.split(/\s+/)).toHaveLength(40);
    expect(text.length).toBeGreaterThan(400);
    const res = await call(fakeEnv().env, "PUT", textPath(d.storyId, p1), { text, basedOn: await textHeadId(d.storyId, p1) });
    expect(res.status).toBe(200);
    const body = RevisionResponseSchema.parse(await res.json());
    expect(body.revision.content).toEqual({ text });
    expect(await textHeadId(d.storyId, p1)).toBe(body.revision.id);
  });

  it("GET runs lists only script for a full run that wrote no outline, even after a later run wrote one", async () => {
    const ids = await newStory(db());
    await markRunFailed(db(), ids.runId, {
      errors: [{ runId: ids.runId, storyId: ids.storyId, pageId: null, step: "script", providerStatus: null, message: "The script is invalid after one repair." }],
    });
    const run2 = newId();
    await insertRun(db(), { runId: run2, storyId: ids.storyId, scope: { kind: "full" } });
    const scriptCall = await newCall(db(), run2, "script");
    const outlineId = newId();
    const pageId = newId();
    await insertRevisions(db(), [
      {
        id: outlineId,
        storyId: ids.storyId,
        kind: "outline",
        content: { title: "T", ageBand: "5-7", cast: ["test-bear"], pages: [{ pageId, beat: "B." }] },
        basis: { source: ids.sourceRevisionId },
        origin: "ai",
        callId: scriptCall,
        status: "ok",
      },
    ]);
    await commitHead(db(), { storyId: ids.storyId, moves: { outline: outlineId }, basis: {}, expected: { outline: null } });

    const res = await call(fakeEnv().env, "GET", `/api/studio/runs/${ids.runId}`);
    expect(res.status).toBe(200);
    const body = RunResponseSchema.parse(await res.json());
    expect(body.steps).toEqual([{ step: "script", state: "failed" }]);
  });

  it("EDT-02.S2 PUT text with a stale basedOn returns 409 with the current revision", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const old = await textHeadId(d.storyId, p1);
    const moved = await saveHumanRevision(db(), {
      storyId: d.storyId,
      kind: "page_text",
      pageId: p1,
      content: { text: "Page 1. Someone else changed this." },
      basis: {},
      basedOn: old,
    });
    expect(moved.status).toBe("moved");
    const before = await revisionCount(d.storyId);
    const res = await call(fakeEnv().env, "PUT", textPath(d.storyId, p1), { text: "Page 1. My edit.", basedOn: old });
    expect(res.status).toBe(409);
    const body = HeadMovedSchema.parse(await res.json());
    expect(body.current!.id).toBe(moved.revisionId);
    expect(body.current!.kind).toBe("page_text");
    expect(await revisionCount(d.storyId)).toBe(before);
  });

  it("EDT-03.S7 PUT scene with an illegal pose pair returns 422 and stores nothing", async () => {
    const d = await draftStory();
    const restore = await addCharacter("test-cat", [{ pose: "stand", expression: "happy" }]);
    try {
      const modelClient = vi.fn(seams.modelClient);
      seams.modelClient = modelClient;
      const p1 = d.pageIds[0]!;
      const current = await sceneHead(d.storyId, p1);
      const scene = structuredClone(current.content);
      scene.layers[0] = { ...scene.layers[0]!, kind: "character", ref: "test-cat", pose: "stand", expression: "calm" };
      const before = await revisionCount(d.storyId);
      const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
      expect(res.status).toBe(422);
      const body = ErrorSchema.parse(await res.json());
      expect(body.error).toBe("invalid_scene");
      const issues = body.issues as Array<{ code: string }>;
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.map((i) => i.code)).toContain("illegal_pair");
      expect(await revisionCount(d.storyId)).toBe(before);
      expect((await readStory(d.storyId)).heads[`scene:${p1}`]).toBe(current.id);
      expect(modelClient).not.toHaveBeenCalled();
    } finally {
      await restore();
    }
  });

  it("EDT-03.S11 still-fits on a needs_review scene returns 409", async () => {
    const p = await seedPublishableStory(env, { needsReviewScenePage: 1 });
    const p1 = p.pageIds[0]!;
    const before = await revisionCount(p.storyId);
    const res = await call(fakeEnv().env, "POST", stillFitsPath(p.storyId, p1), { basedOn: p.scene[p1]!, textBasedOn: p.text[p1]! });
    expect(res.status).toBe(409);
    expect(ErrorSchema.parse(await res.json())).toEqual({ error: "scene_needs_review" });
    expect(await revisionCount(p.storyId)).toBe(before);
    expect((await readStory(p.storyId)).heads[`scene:${p1}`]).toBe(p.scene[p1]);
  });

  it("EDT-03.S12 new layer without instanceId gets a server UUID v7", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const sent = structuredClone(current.content) as Omit<PageScene, "layers"> & { layers: Array<Record<string, unknown>> };
    sent.layers.push({ kind: "prop", ref: "test-ball", pose: "default", slot: "prop-left" });
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene: sent, basedOn: current.id });
    expect(res.status).toBe(200);
    const body = RevisionResponseSchema.parse(await res.json());
    const saved = PageSceneSchema.parse(body.revision.content);
    const sentIds = new Set(current.content.layers.map((l) => l.instanceId));
    const added = saved.layers[saved.layers.length - 1]!;
    expect(added.ref).toBe("test-ball");
    expect(added.instanceId).toMatch(UUID7);
    expect(sentIds.has(added.instanceId)).toBe(false);
    expect(JSON.stringify(sent)).not.toContain(added.instanceId);
    expect(saved.layers.slice(0, -1).map((l) => l.instanceId)).toEqual(current.content.layers.map((l) => l.instanceId));
  });

  it("EDT-03.S13 a tap on a new layer in the same request returns 422 unknown_target", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const sent = structuredClone(current.content) as Omit<PageScene, "layers"> & { layers: Array<Record<string, unknown>> };
    sent.layers.push({ kind: "prop", ref: "test-ball", pose: "default", slot: "prop-left" });
    sent.interactions.push({ on: { tap: "new-ball" }, do: [{ action: "play_sfx", sfx: "test-pop" }] });
    const before = await revisionCount(d.storyId);
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene: sent, basedOn: current.id });
    expect(res.status).toBe(422);
    const body = ErrorSchema.parse(await res.json());
    expect(body.error).toBe("invalid_scene");
    expect((body.issues as Array<{ code: string }>).map((i) => i.code)).toContain("unknown_target");
    expect(await revisionCount(d.storyId)).toBe(before);
    expect((await readStory(d.storyId)).heads[`scene:${p1}`]).toBe(current.id);
  });

  it("EDT-03.S17 still-fits returns 422 when the copied scene no longer validates", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    expect(current.content.layers.map((l) => l.ref)).toContain("test-bear");
    // The scene is stale: the page text changed after it.
    const newText = await saveText(d.storyId, p1, "Page 1. The bear hears the news.");
    const restore = await deactivateAsset("test-bear");
    try {
      const before = await revisionCount(d.storyId);
      const res = await call(fakeEnv().env, "POST", stillFitsPath(d.storyId, p1), {
        basedOn: current.id,
        textBasedOn: newText,
      });
      expect(res.status).toBe(422);
      const body = ErrorSchema.parse(await res.json());
      expect(body.error).toBe("invalid_scene");
      expect((body.issues as unknown[]).length).toBeGreaterThan(0);
      expect(await revisionCount(d.storyId)).toBe(before);
      expect((await readStory(d.storyId)).heads[`scene:${p1}`]).toBe(current.id);
    } finally {
      await restore();
    }
  });

  it("EDT-03.S10 stale basedOn with an invalid scene returns 409, not 422", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const old = await sceneHead(d.storyId, p1);
    const newHead = await moveSceneHead(d.storyId, p1);
    const invalid = { ...old.content, interactions: [] };
    const before = await revisionCount(d.storyId);
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene: invalid, basedOn: old.id });
    expect(res.status).toBe(409);
    const body = HeadMovedSchema.parse(await res.json());
    expect(body.current!.id).toBe(newHead);
    expect(await revisionCount(d.storyId)).toBe(before);
  });

  it("EDT-01.S2 GET story returns page states", async () => {
    const d = await draftStory();
    const p2 = d.pageIds[1]!;
    const saved = await saveHumanRevision(db(), {
      storyId: d.storyId,
      kind: "page_text",
      pageId: p2,
      content: { text: "Page 2. The bunny tells everyone." },
      basis: {},
      basedOn: await textHeadId(d.storyId, p2),
    });
    expect(saved.status).toBe("moved");
    const res = await call(fakeEnv().env, "GET", `/api/studio/stories/${d.storyId}`);
    expect(res.status).toBe(200);
    const body = StoryDetailResponseSchema.parse(await res.json());
    const st = await readStory(d.storyId);
    expect(body.story).toMatchObject({ id: d.storyId, status: "draft", headsVersion: st.story.headsVersion, publishedReleaseId: null });
    expect(body.heads).toEqual(st.heads);
    expect(body.source.kind).toBe("source");
    expect(body.releases).toEqual([]);
    expect(body.latestRun).toMatchObject({ id: d.runId, status: "draft_ready" });
    expect(body.pages.map((p) => p.pageId)).toEqual(d.pageIds);
    expect(body.pages.map((p) => p.number)).toEqual(d.pageIds.map((_, i) => i + 1));
    for (const page of body.pages) {
      expect(page.beat.length).toBeGreaterThan(0);
      expect(page.text!.id).toBe(st.heads[`page_text:${page.pageId}`]);
      expect(page.scene!.id).toBe(st.heads[`scene:${page.pageId}`]);
      expect(page.audio!.id).toBe(st.heads[`audio:${page.pageId}`]);
      expect(page.audio!.fileUrl).toMatch(/^\/api\/studio\/files\/calls\//);
      if (page.pageId === p2) {
        expect(page.state).toBe("stale");
        expect(page.problems).toEqual(
          expect.arrayContaining([
            { target: "scene", reason: "stale" },
            { target: "audio", reason: "stale" },
          ]),
        );
        expect(page.problems).toHaveLength(2);
        expect(page.text!.origin).toBe("human");
      } else {
        expect(page.state).toBe("ok");
        expect(page.problems).toEqual([]);
      }
    }
  });

  it("GET files refuses keys outside assets/ and calls/", async () => {
    await seedRegistry(env);
    const f = fakeEnv();
    const releaseId = newId();
    await env.BUCKET.put(`releases/${releaseId}/manifest.json`, "{}");
    const callKey = `calls/${newId()}.wav`;
    await env.BUCKET.put(callKey, new Uint8Array([1, 2, 3, 4]));

    const ok = await call(f.env, "GET", "/api/studio/files/assets/test-bear/v1/stand-happy.webp");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const audio = await call(f.env, "GET", `/api/studio/files/${callKey}`);
    expect(audio.status).toBe(200);
    await audio.arrayBuffer();

    for (const path of [
      `/api/studio/files/releases/${releaseId}/manifest.json`,
      `/api/studio/files/assets/..%2Freleases%2F${releaseId}%2Fmanifest.json`,
      `/api/studio/files/calls/..%2Freleases%2F${releaseId}%2Fmanifest.json`,
      "/api/studio/files/other/key.webp",
      "/api/studio/files/assets/test-bear/v1/missing.webp",
    ]) {
      const res = await call(f.env, "GET", path);
      expect(res.status, path).toBe(404);
      expect(ErrorSchema.parse(await res.json()), path).toEqual({ error: "not_found" });
    }
  });

  it("bad path id returns 404", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const f = fakeEnv();
    const cases: Array<[string, string, unknown?]> = [
      ["GET", "/api/studio/stories/not-a-uuid"],
      ["GET", `/api/studio/stories/${d.storyId.toUpperCase()}`],
      ["GET", "/api/studio/runs/123"],
      // A UUID version 4 is not a system ID.
      ["GET", "/api/studio/runs/0b9e3f5c-6a3e-4c2b-9a51-2f7c1d8e4a10"],
      ["PUT", textPath(d.storyId, "not-a-uuid"), { text: "Page 1. Hello.", basedOn: await textHeadId(d.storyId, p1) }],
      ["PUT", textPath("not-a-uuid", p1), { text: "Page 1. Hello.", basedOn: await textHeadId(d.storyId, p1) }],
      ["POST", `/api/studio/stories/x/runs`, { scope: { kind: "full" } }],
      ["POST", `/api/studio/stories/x/releases`],
    ];
    for (const [method, path, body] of cases) {
      const res = await call(f.env, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(ErrorSchema.parse(await res.json())).toEqual({ error: "not_found" });
    }
    expect(f.create).not.toHaveBeenCalled();
  });

  it("RUN-01.S9 POST stories with 199 pasted words returns 422 and starts no run", async () => {
    const f = fakeEnv();
    const before = await counts();
    const res = await call(f.env, "POST", "/api/studio/stories", { text: words(199) });
    expect(res.status).toBe(422);
    expect(SourceRejectedSchema.parse(await res.json())).toEqual({ error: "source_rejected", reason: "text_too_short", words: 199 });
    expect(await counts()).toEqual(before);
    expect(f.create).not.toHaveBeenCalled();
  });

  it("RUN-01.S10 POST stories with 2,001 pasted words returns 202 and cuts the text at 2,000 words", async () => {
    const f = fakeEnv();
    const text = words(2001);
    const res = await call(f.env, "POST", "/api/studio/stories", { text });
    expect(res.status).toBe(202);
    const body = CreateStoryResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ words: 2000, truncated: true });
    const saved = await sourceText(body.storyId);
    expect(wordCount(saved)).toBe(2000);
    expect(saved).toBe(words(2000));
  });

  it("RUN-02.S1 POST stories with an article URL returns 202 and the source is the text of the p elements", async () => {
    const f = fakeEnv();
    const paragraphs = [words(150, "alpha"), words(150, "beta")];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => htmlResponse(articleHtml(paragraphs)));
    const before = await counts();
    const res = await call(f.env, "POST", "/api/studio/stories", { url: "https://news.test/story?id=1" });
    expect(res.status).toBe(202);
    const body = CreateStoryResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ words: 300, truncated: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const st = await readStory(body.storyId);
    expect(st.head("source")!.content).toEqual({
      text: paragraphs.join("\n\n"),
      url: "https://news.test/story?id=1",
      words: 300,
      truncated: false,
    });
    expect(await counts()).toEqual({ stories: before.stories + 1, runs: before.runs + 1 });
    expect(await db().$count(revision, eq(revision.storyId, body.storyId))).toBe(1);
    const [r] = await db().select().from(run).where(eq(run.storyId, body.storyId));
    expect(r!.scope).toEqual({ kind: "full" });
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it("RUN-02.S2 POST stories with an ftp URL or a redirect to ftp returns 422 and starts no run", async () => {
    const f = fakeEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => redirect("ftp://files.test/article.txt"));
    const before = await counts();

    const direct = await call(f.env, "POST", "/api/studio/stories", { url: "ftp://files.test/article.txt" });
    expect(direct.status).toBe(422);
    expect(SourceRejectedSchema.parse(await direct.json())).toEqual({ error: "source_rejected", reason: "url_scheme" });
    expect(fetchSpy).not.toHaveBeenCalled();

    const redirected = await call(f.env, "POST", "/api/studio/stories", { url: "https://news.test/a" });
    expect(redirected.status).toBe(422);
    expect(SourceRejectedSchema.parse(await redirected.json())).toEqual({ error: "source_rejected", reason: "url_scheme" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(calledUrls(fetchSpy).some((u) => u.startsWith("ftp:"))).toBe(false);
    expect(await counts()).toEqual(before);
    expect(f.create).not.toHaveBeenCalled();
  });

  it("RUN-02.S3 POST stories with a chain of 4 redirects returns 422 and starts no run", async () => {
    const f = fakeEnv();
    let n = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => redirect(`https://news.test/hop-${++n}`));
    const before = await counts();
    const res = await call(f.env, "POST", "/api/studio/stories", { url: "https://news.test/hop-0" });
    expect(res.status).toBe(422);
    expect(SourceRejectedSchema.parse(await res.json())).toEqual({ error: "source_rejected", reason: "too_many_redirects" });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(await counts()).toEqual(before);
    expect(f.create).not.toHaveBeenCalled();
  });

  it("RUN-02.S4 POST stories with a fetch that times out returns 422 and starts no run", async () => {
    const f = fakeEnv();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new DOMException("timeout", "TimeoutError");
    });
    const before = await counts();
    const res = await call(f.env, "POST", "/api/studio/stories", { url: "https://news.test/slow" });
    expect(res.status).toBe(422);
    expect(SourceRejectedSchema.parse(await res.json())).toEqual({ error: "source_rejected", reason: "timeout" });
    expect(await counts()).toEqual(before);
    expect(f.create).not.toHaveBeenCalled();
  });

  it("RUN-02.S7 POST stories with an article URL of 2,001 words returns 202 and cuts the text at 2,000 words", async () => {
    const f = fakeEnv();
    const paragraphs = [words(1000, "alpha"), words(1001, "beta")];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => htmlResponse(articleHtml(paragraphs)));
    const res = await call(f.env, "POST", "/api/studio/stories", { url: "https://news.test/long" });
    expect(res.status).toBe(202);
    const body = CreateStoryResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ words: 2000, truncated: true });
    const saved = await sourceText(body.storyId);
    expect(wordCount(saved)).toBe(2000);
    expect(saved).toBe(`${paragraphs[0]}\n\n${words(1000, "beta")}`);
  });

  it("EDT-01.S1 GET stories lists the stories newest first", async () => {
    const ids = [(await newStory(db())).storyId, (await newStory(db())).storyId, (await newStory(db())).storyId];
    const res = await call(fakeEnv().env, "GET", "/api/studio/stories");
    expect(res.status).toBe(200);
    const body = StoryListResponseSchema.parse(await res.json());
    expect(body.stories.length).toBeLessThanOrEqual(100);
    const ours = body.stories.filter((s) => ids.includes(s.id));
    expect(ours.map((s) => s.id)).toEqual([...ids].sort().reverse());
    const all = body.stories.map((s) => s.id);
    expect(all).toEqual([...all].sort().reverse());
    expect(ours[0]).toMatchObject({ title: null, status: "draft", publishedReleaseId: null });
  });

  it("EDT-02.S1 PUT text saves a human page_text revision and moves the head", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const before = await readStory(d.storyId);
    const res = await call(fakeEnv().env, "PUT", textPath(d.storyId, p1), {
      text: "  Page 1. The bear waves hello.  ",
      basedOn: before.heads[`page_text:${p1}`],
    });
    expect(res.status).toBe(200);
    const body = RevisionResponseSchema.parse(await res.json());
    expect(body.revision).toMatchObject({ kind: "page_text", pageId: p1, origin: "human", status: "ok" });
    expect(body.revision.content).toEqual({ text: "Page 1. The bear waves hello." });
    const after = await readStory(d.storyId);
    expect(after.heads[`page_text:${p1}`]).toBe(body.revision.id);
    expect(after.story.headsVersion).toBe(before.story.headsVersion + 1);
  });

  it("EDT-03.S2 still-fits on a stale ok scene saves a human copy whose basis is the current text", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const f = fakeEnv();
    const put = await call(f.env, "PUT", textPath(d.storyId, p1), {
      text: "Page 1. The bear hears the news.",
      basedOn: await textHeadId(d.storyId, p1),
    });
    expect(put.status).toBe(200);
    const newText = RevisionResponseSchema.parse(await put.json()).revision.id;
    const scene = await sceneHead(d.storyId, p1);
    expect((await readStory(d.storyId)).head(`scene:${p1}`)!.status).toBe("ok");

    const res = await call(f.env, "POST", stillFitsPath(d.storyId, p1), { basedOn: scene.id, textBasedOn: newText });
    expect(res.status).toBe(200);
    const body = RevisionResponseSchema.parse(await res.json());
    expect(body.revision).toMatchObject({ kind: "scene", origin: "human", status: "ok" });
    expect(body.revision.content).toEqual(scene.content);
    expect(body.revision.basis).toEqual({ [`page_text:${p1}`]: newText });

    const story = StoryDetailResponseSchema.parse(await (await call(f.env, "GET", `/api/studio/stories/${d.storyId}`)).json());
    const page = story.pages.find((p) => p.pageId === p1)!;
    expect(page.scene!.id).toBe(body.revision.id);
    expect(page.problems).not.toContainEqual({ target: "scene", reason: "stale" });
  });

  it("EDT-03.S3 PUT scene with a changed template, character, pose, expression, prop, animation, and tap is validated, laid out, and saved", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const a = current.content.layers[0]!;
    expect(a).toMatchObject({ ref: "test-bear", pose: "stand", expression: "happy" });
    const scene = {
      templateId: "two-friends",
      backdrop: "meadow",
      sky: "night",
      layers: [
        { instanceId: a.instanceId, kind: "character", ref: "test-bunny", pose: "wave", expression: "calm", slot: "left", flip: false },
        { kind: "prop", ref: "test-ball", pose: "default", slot: "prop-center" },
      ],
      animations: [{ target: a.instanceId, primitive: "sway", params: { angle: 3, period: 4 }, trigger: "loop" }],
      interactions: [{ on: { tap: a.instanceId }, do: [{ action: "show_bubble", target: a.instanceId, text: "Hello!" }] }],
    };
    expect(current.content.templateId).not.toBe(scene.templateId);
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
    expect(res.status).toBe(200);
    const body = RevisionResponseSchema.parse(await res.json());
    expect(body.revision).toMatchObject({ kind: "scene", origin: "human", status: "ok" });
    expect(body.revision.basis).toEqual({ [`page_text:${p1}`]: await textHeadId(d.storyId, p1) });
    expect(body.revision.assetVersions).toEqual({ "test-ball": 1, "test-bunny": 1, meadow: 1 });
    const saved = PageSceneSchema.parse(body.revision.content);
    expect(saved.templateId).toBe("two-friends");
    expect(saved.layers.map((l) => l.ref)).toEqual(["test-bunny", "test-ball"]);
    expect(saved.layers[0]!.instanceId).toBe(a.instanceId);
    for (const layer of saved.layers) expect(layer.at).toBeDefined();
    expect(saved.animations).toEqual(scene.animations);
    expect(saved.interactions).toEqual(scene.interactions);
    expect((await readStory(d.storyId)).heads[`scene:${p1}`]).toBe(body.revision.id);
  });

  it("EDT-03.S4 PUT a valid scene with an old basedOn returns 409 with the current revision", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const old = await sceneHead(d.storyId, p1);
    const newHead = await moveSceneHead(d.storyId, p1);
    const before = await revisionCount(d.storyId);
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene: old.content, basedOn: old.id });
    expect(res.status).toBe(409);
    const body = HeadMovedSchema.parse(await res.json());
    expect(body.error).toBe("head_moved");
    expect(body.current!.id).toBe(newHead);
    expect(await revisionCount(d.storyId)).toBe(before);
  });

  it("EDT-03.S8 PUT scene with a ref that is not an active registry key returns 422 and stores nothing", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const scene = structuredClone(current.content);
    scene.layers[0] = { ...scene.layers[0]!, ref: "test-dragon" };
    const before = await revisionCount(d.storyId);
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
    expect(res.status).toBe(422);
    const body = ErrorSchema.parse(await res.json());
    expect(body.error).toBe("invalid_scene");
    expect((body.issues as Array<{ code: string }>).map((i) => i.code)).toContain("unknown_asset");
    expect(await revisionCount(d.storyId)).toBe(before);
  });

  it("EDT-03.S9 PUT scene with a manual at that still fails a layout check returns 422 and stores nothing", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const a = current.content.layers[0]!;
    // The new bunny is placed by hand on the foot point of the `left` slot,
    // on top of the bear that the engine places and shrinks there.
    const scene = {
      templateId: "two-friends",
      backdrop: "meadow",
      sky: "day",
      layers: [
        { instanceId: a.instanceId, kind: "character", ref: "test-bear", pose: "stand", expression: "happy", slot: "left" },
        { kind: "character", ref: "test-bunny", pose: "stand", expression: "happy", slot: "right", at: { x: 520, y: 1080, scale: 0.75, z: 51 } },
      ],
      animations: [{ target: a.instanceId, primitive: "float", params: { amplitude: 0.007, period: 4 }, trigger: "loop" }],
      interactions: [{ on: { tap: a.instanceId }, do: [{ action: "play_sfx", sfx: "test-pop" }] }],
    };
    const before = await revisionCount(d.storyId);
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
    expect(res.status).toBe(422);
    const body = ErrorSchema.parse(await res.json());
    expect(body.error).toBe("invalid_scene");
    expect((body.issues as Array<{ code: string }>).some((i) => i.code.startsWith("layout."))).toBe(true);
    expect(await revisionCount(d.storyId)).toBe(before);
  });

  it("RUN-01.S7 GET runs returns the run status and the step progress", async () => {
    const ids = await newStory(db());
    await db().update(run).set({ status: "running" }).where(eq(run.id, ids.runId));
    const [p1, p2] = [newId(), newId()];
    const scriptCall = await newCall(db(), ids.runId, "script");
    const scene1Call = await newCall(db(), ids.runId, `scene:${p1}`, p1);
    const audio1Call = await newCall(db(), ids.runId, `audio:${p1}`, p1);
    const outlineId = newId();
    const outline: Outline = {
      title: "Two pages",
      ageBand: "5-7",
      cast: ["test-bear"],
      pages: [
        { pageId: p1, beat: "Beat 1." },
        { pageId: p2, beat: "Beat 2." },
      ],
    };
    const ai = { storyId: ids.storyId, origin: "ai" as const, status: "ok" as const };
    await insertRevisions(db(), [
      { ...ai, id: outlineId, kind: "outline", content: outline, basis: { source: ids.sourceRevisionId }, callId: scriptCall },
      { ...ai, kind: "page_text", pageId: p1, content: { text: "Page 1." }, basis: { outline: outlineId }, callId: scriptCall },
      { ...ai, kind: "page_text", pageId: p2, content: { text: "Page 2." }, basis: { outline: outlineId }, callId: scriptCall },
      { ...ai, kind: "scene", pageId: p1, content: {}, basis: {}, callId: scene1Call },
      { ...ai, kind: "audio", pageId: p1, content: null, r2Key: `calls/${audio1Call}.wav`, basis: {}, callId: audio1Call },
    ]);
    expect(await commitHead(db(), { storyId: ids.storyId, moves: { outline: outlineId }, basis: {}, expected: { outline: null } })).toBe(
      "moved",
    );

    const f = fakeEnv({ workflowStatus: "running" });
    const res = await call(f.env, "GET", `/api/studio/runs/${ids.runId}`);
    expect(res.status).toBe(200);
    const body = RunResponseSchema.parse(await res.json());
    expect(body.run).toMatchObject({ id: ids.runId, storyId: ids.storyId, status: "running", workflowStatus: "running", scope: { kind: "full" } });
    expect(body.steps).toEqual([
      { step: "script", state: "done" },
      { step: `scene:${p1}`, state: "done" },
      { step: `audio:${p1}`, state: "done" },
      { step: `scene:${p2}`, state: "pending" },
      { step: `audio:${p2}`, state: "pending" },
    ]);
  });

  it("GET runs marks a step failed when run.error.errors lists it, even with a revision", async () => {
    const ids = await newStory(db());
    const [p1, p2] = [newId(), newId()];
    const outlineId = newId();
    const scriptCall = await newCall(db(), ids.runId, "script");
    const ai = { storyId: ids.storyId, origin: "ai" as const, status: "ok" as const };
    const rows: Parameters<typeof insertRevisions>[1] = [
      {
        ...ai,
        id: outlineId,
        kind: "outline",
        content: { title: "T", ageBand: "5-7", cast: ["test-bear"], pages: [p1, p2].map((pageId) => ({ pageId, beat: "B." })) },
        basis: { source: ids.sourceRevisionId },
        callId: scriptCall,
      },
    ];
    for (const pageId of [p1, p2]) {
      rows.push({ ...ai, kind: "page_text", pageId, content: { text: "Page." }, basis: { outline: outlineId }, callId: scriptCall });
      rows.push({ ...ai, kind: "scene", pageId, content: {}, basis: {}, callId: await newCall(db(), ids.runId, `scene:${pageId}`, pageId) });
    }
    rows.push({ ...ai, kind: "audio", pageId: p1, content: null, basis: {}, callId: await newCall(db(), ids.runId, `audio:${p1}`, p1) });
    const providerError = { providerError: { status: 400, message: "provider status 400" } };
    rows.push({
      ...ai,
      kind: "audio",
      pageId: p2,
      status: "needs_review",
      content: null,
      error: providerError,
      basis: {},
      callId: await newCall(db(), ids.runId, `audio:${p2}`, p2),
    });
    await insertRevisions(db(), rows);
    await commitHead(db(), { storyId: ids.storyId, moves: { outline: outlineId }, basis: {}, expected: { outline: null } });
    const record: ErrorRecord = {
      runId: ids.runId,
      storyId: ids.storyId,
      pageId: p2,
      step: `audio:${p2}`,
      providerStatus: 400,
      message: "provider status 400",
    };
    await db()
      .update(run)
      .set({ status: "needs_review", error: { errors: [record] }, finishedAt: new Date().toISOString() })
      .where(eq(run.id, ids.runId));

    const f = fakeEnv();
    const res = await call(f.env, "GET", `/api/studio/runs/${ids.runId}`);
    expect(res.status).toBe(200);
    const body = RunResponseSchema.parse(await res.json());
    expect(body.run.status).toBe("needs_review");
    expect(body.run.workflowStatus).toBeNull();
    expect(f.get).not.toHaveBeenCalled();
    expect(body.steps).toEqual([
      { step: "script", state: "done" },
      { step: `scene:${p1}`, state: "done" },
      { step: `audio:${p1}`, state: "done" },
      { step: `scene:${p2}`, state: "done" },
      { step: `audio:${p2}`, state: "failed" },
    ]);
  });

  it("REG-01.S5 GET registry returns the active assets, the sfx sounds, and the templates", async () => {
    await seedRegistry(env);
    const restore = await deactivateAsset("test-tree");
    try {
      const res = await call(fakeEnv().env, "GET", "/api/studio/registry");
      expect(res.status).toBe(200);
      const body = RegistryResponseSchema.parse(await res.json());
      const keys = body.assets.map((a) => a.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toEqual(expect.arrayContaining(["test-bear", "test-bunny", "test-ball", "test-pop"]));
      expect(keys).not.toContain("test-tree");
      expect(body.assets.find((a) => a.key === "test-pop")).toMatchObject({ kind: "sfx", renderer: "audio", version: 1 });
      expect(body.assets.some((a) => a.kind === "sfx")).toBe(true);
      expect(body.assets.find((a) => a.key === "test-bear")).toMatchObject({
        kind: "character",
        name: "test-bear",
        version: 1,
        renderer: "webp",
        base: "/api/studio/files/assets/test-bear/v1/",
      });
      expect(body.assets.find((a) => a.key === "meadow")).toMatchObject({ kind: "backdrop", renderer: "svg" });
      expect(body.templates).toEqual(TEMPLATES);
    } finally {
      await restore();
    }
  });

  it("PUB-02.S2 POST releases with a page without a scene head returns 409 and names the page", async () => {
    const f = fakeEnv();
    const scene = await seedPublishableStory(env, { missingScenePage: 2 });
    const res = await call(f.env, "POST", `/api/studio/stories/${scene.storyId}/releases`);
    expect(res.status).toBe(409);
    const body = PublishBlockedSchema.parse(await res.json());
    expect(body.blocking).toEqual([
      { pageId: scene.pageIds[1], page: 2, target: "scene", reason: "missing", message: "page 2: missing scene" },
    ]);

    const text = await seedPublishableStory(env, { missingTextPage: 2 });
    const res2 = await call(f.env, "POST", `/api/studio/stories/${text.storyId}/releases`);
    expect(res2.status).toBe(409);
    const body2 = PublishBlockedSchema.parse(await res2.json());
    expect(body2.blocking).toContainEqual({
      pageId: text.pageIds[1],
      page: 2,
      target: "page_text",
      reason: "missing",
      message: "page 2: missing text",
    });
    expect(body2.blocking.every((b) => b.page === 2)).toBe(true);
  });

  it("PUB-02.S4 POST releases with a stale audio returns 409 and names the page", async () => {
    const p = await seedPublishableStory(env, { staleAudioPage: 1 });
    const res = await call(fakeEnv().env, "POST", `/api/studio/stories/${p.storyId}/releases`);
    expect(res.status).toBe(409);
    const body = PublishBlockedSchema.parse(await res.json());
    expect(body.blocking).toContainEqual({ pageId: p.pageIds[0], page: 1, target: "audio", reason: "stale", message: "page 1: stale audio" });
  });

  it("PUB-02.S7 POST releases lists every blocking page", async () => {
    const p = await seedPublishableStory(env, { pages: 3, missingAudioPage: 1, staleScenePage: 3 });
    const res = await call(fakeEnv().env, "POST", `/api/studio/stories/${p.storyId}/releases`);
    expect(res.status).toBe(409);
    const body = PublishBlockedSchema.parse(await res.json());
    expect(body.blocking).toEqual([
      { pageId: p.pageIds[0], page: 1, target: "audio", reason: "missing", message: "page 1: missing audio" },
      { pageId: p.pageIds[2], page: 3, target: "scene", reason: "stale", message: "page 3: stale scene" },
    ]);
  });

  it("RUN-05.S7 a run whose script step failed can be started again as a full run", async () => {
    const f = fakeEnv();
    const ids = await newStory(db());
    await markRunFailed(db(), ids.runId, {
      errors: [{ runId: ids.runId, storyId: ids.storyId, pageId: null, step: "script", providerStatus: null, message: "The script is invalid after one repair." }],
    });
    expect((await readStory(ids.storyId)).heads.outline).toBeUndefined();
    const res = await call(f.env, "POST", `/api/studio/stories/${ids.storyId}/runs`, { scope: { kind: "full" } });
    expect(res.status).toBe(202);
    const { runId } = StartRunResponseSchema.parse(await res.json());
    expect(runId).not.toBe(ids.runId);
    const [row] = await db().select().from(run).where(eq(run.id, runId));
    expect(row).toMatchObject({ storyId: ids.storyId, status: "queued", scope: { kind: "full" }, workflowInstanceId: runId });
    expect(f.create).toHaveBeenCalledWith({ id: runId, params: { runId, storyId: ids.storyId, scope: { kind: "full" } } });

    // A run whose page step failed: that page restarts with a page run.
    const p = await seedPublishableStory(env, { missingAudioPage: 1 });
    const [failed] = await db().select().from(run).where(eq(run.storyId, p.storyId));
    await markRunFailed(db(), failed!.id, {
      errors: [{ runId: failed!.id, storyId: p.storyId, pageId: p.pageIds[0]!, step: `audio:${p.pageIds[0]}`, providerStatus: 503, message: "provider status 503" }],
    });
    const scope = { kind: "page", pageId: p.pageIds[0]!, target: "audio" } as const;
    const page = await call(f.env, "POST", `/api/studio/stories/${p.storyId}/runs`, { scope });
    expect(page.status).toBe(202);
    const pageRun = StartRunResponseSchema.parse(await page.json()).runId;
    const [pageRow] = await db().select().from(run).where(eq(run.id, pageRun));
    expect(pageRow).toMatchObject({ storyId: p.storyId, status: "queued", scope, workflowInstanceId: pageRun });
    expect(f.create).toHaveBeenCalledTimes(2);
  });

  it("RUN-05.S9 a full run can start again when the script step never succeeded", async () => {
    const f = fakeEnv();
    const ids = await newStory(db());
    await markRunFailed(db(), ids.runId, { errors: [] });
    expect((await readStory(ids.storyId)).heads.outline).toBeUndefined();
    const res = await call(f.env, "POST", `/api/studio/stories/${ids.storyId}/runs`, { scope: { kind: "full" } });
    expect(res.status).toBe(202);
    const { runId } = StartRunResponseSchema.parse(await res.json());
    const [row] = await db().select().from(run).where(eq(run.id, runId));
    expect(row).toMatchObject({ storyId: ids.storyId, status: "queued", scope: { kind: "full" }, workflowInstanceId: runId });
    expect(await db().$count(run, eq(run.storyId, ids.storyId))).toBe(2);
    expect(f.create).toHaveBeenCalledWith({ id: runId, params: { runId, storyId: ids.storyId, scope: { kind: "full" } } });
  });

  it("RUN-05.S10 a full run is refused when the story has an outline", async () => {
    const f = fakeEnv();
    const p = await seedPublishableStory(env);
    const [only] = await db().select().from(run).where(eq(run.storyId, p.storyId));
    await markRunFailed(db(), only!.id, { errors: [] });
    const res = await call(f.env, "POST", `/api/studio/stories/${p.storyId}/runs`, { scope: { kind: "full" } });
    expect(res.status).toBe(409);
    expect(ErrorSchema.parse(await res.json())).toEqual({ error: "full_run_not_allowed" });
    expect(await db().$count(run, eq(run.storyId, p.storyId))).toBe(1);
    expect(f.create).not.toHaveBeenCalled();
  });

  it("RUN-05.S11 a full run is refused while a run is still running", async () => {
    const f = fakeEnv();
    for (const status of ["queued", "running"] as const) {
      const ids = await newStory(db());
      await db().update(run).set({ status }).where(eq(run.id, ids.runId));
      expect((await readStory(ids.storyId)).heads.outline).toBeUndefined();
      const res = await call(f.env, "POST", `/api/studio/stories/${ids.storyId}/runs`, { scope: { kind: "full" } });
      expect(res.status, status).toBe(409);
      expect(ErrorSchema.parse(await res.json())).toEqual({ error: "full_run_not_allowed" });
      expect(await db().$count(run, eq(run.storyId, ids.storyId))).toBe(1);
    }
    expect(f.create).not.toHaveBeenCalled();
  });

  it("EDT-02.S4 PUT text that fails PageText validation returns 422 and saves nothing", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const head = await textHeadId(d.storyId, p1);
    const before = await revisionCount(d.storyId);
    for (const text of ["Page 1. One. Two. Three.", `Page 1 ${words(40)}.`]) {
      const res = await call(fakeEnv().env, "PUT", textPath(d.storyId, p1), { text, basedOn: head });
      expect(res.status, text).toBe(422);
      const body = ErrorSchema.parse(await res.json());
      expect(body.error).toBe("invalid_text");
      expect((body.issues as unknown[]).length).toBeGreaterThan(0);
    }
    expect(await revisionCount(d.storyId)).toBe(before);
    expect(await textHeadId(d.storyId, p1)).toBe(head);
  });

  it("EDT-02.S5 PUT text with an old basedOn and an invalid text returns 409, not 422", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const old = await textHeadId(d.storyId, p1);
    const newHead = await saveText(d.storyId, p1, "Page 1. Someone else changed this.");
    const before = await revisionCount(d.storyId);
    const res = await call(fakeEnv().env, "PUT", textPath(d.storyId, p1), { text: "Page 1. One. Two. Three.", basedOn: old });
    expect(res.status).toBe(409);
    const body = HeadMovedSchema.parse(await res.json());
    expect(body.current!.id).toBe(newHead);
    expect(await revisionCount(d.storyId)).toBe(before);
  });

  it("EDT-03.S14 PUT scene keeps a manual scale below the slot's minScale", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const scene = structuredClone(current.content);
    // `hero` targets 640 px on an 800 px pose box (scale 0.8); minScale 0.8 gives 0.64.
    const at = { x: 800, y: 1090, scale: 0.3, z: 50 };
    scene.layers[0] = { ...scene.layers[0]!, at };
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
    expect(res.status).toBe(200);
    const body = RevisionResponseSchema.parse(await res.json());
    expect(PageSceneSchema.parse(body.revision.content).layers[0]!.at).toEqual(at);
    expect((await readStory(d.storyId)).heads[`scene:${p1}`]).toBe(body.revision.id);
  });

  it("EDT-03.S15 PUT scene with a manual scale of 0 or less returns 422 and stores nothing", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const before = await revisionCount(d.storyId);
    for (const scale of [0, -0.5]) {
      const scene = structuredClone(current.content);
      scene.layers[0] = { ...scene.layers[0]!, at: { x: 800, y: 1090, scale, z: 50 } };
      const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
      expect(res.status, String(scale)).toBe(422);
      const body = ErrorSchema.parse(await res.json());
      expect(body.error).toBe("invalid_scene");
      expect((body.issues as unknown[]).length).toBeGreaterThan(0);
    }
    expect(await revisionCount(d.storyId)).toBe(before);
    expect((await readStory(d.storyId)).heads[`scene:${p1}`]).toBe(current.id);
  });

  it("EDT-03.S16 PUT scene uses and records the active registry versions", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    expect((await readStory(d.storyId)).head(`scene:${p1}`)!.assetVersions).toMatchObject({ "test-bear": 1 });
    // Version 2 adds a pose "sit" that version 1 does not have.
    const restore = await activateVersion2("test-bear", (m) => {
      if (!isLayerManifest(m)) return m;
      const stand = m.poses.find((e) => e.id === "stand" && e.expression === "happy")!;
      return { ...m, poses: [...m.poses, { ...stand, id: "sit", file: "sit-happy.webp" }], legal: [...m.legal, { pose: "sit", expression: "happy" }] };
    });
    try {
      const scene = structuredClone(current.content);
      scene.layers[0] = { ...scene.layers[0]!, pose: "sit", expression: "happy" };
      const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
      expect(res.status).toBe(200);
      const body = RevisionResponseSchema.parse(await res.json());
      expect(body.revision.assetVersions).toEqual({ "test-bear": 2, "test-pop": 1, meadow: 1 });
      expect(PageSceneSchema.parse(body.revision.content).layers[0]!.pose).toBe("sit");
    } finally {
      await restore();
    }
  });

  it("EDT-03.S18 still-fits with an old basedOn returns the basedOn 409 first", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const old = await sceneHead(d.storyId, p1);
    const oldText = await textHeadId(d.storyId, p1);
    const newScene = await moveSceneHead(d.storyId, p1);
    await saveText(d.storyId, p1, "Page 1. The text moved too.");
    const restore = await deactivateAsset("test-bear");
    try {
      const before = await revisionCount(d.storyId);
      const res = await call(fakeEnv().env, "POST", stillFitsPath(d.storyId, p1), { basedOn: old.id, textBasedOn: oldText });
      expect(res.status).toBe(409);
      const body = HeadMovedSchema.parse(await res.json());
      expect(body.current!.id).toBe(newScene);
      expect(body.current!.kind).toBe("scene");
      expect(await revisionCount(d.storyId)).toBe(before);
      expect((await readStory(d.storyId)).heads[`scene:${p1}`]).toBe(newScene);
    } finally {
      await restore();
    }
  });

  it("EDT-03.S19 a still-fits copy records the active registry versions", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const newText = await saveText(d.storyId, p1, "Page 1. The bear hears the news.");
    const restore = await activateVersion2("test-bear");
    try {
      const res = await call(fakeEnv().env, "POST", stillFitsPath(d.storyId, p1), { basedOn: current.id, textBasedOn: newText });
      expect(res.status).toBe(200);
      const body = RevisionResponseSchema.parse(await res.json());
      expect(body.revision.origin).toBe("human");
      expect(body.revision.content).toEqual(current.content);
      expect(body.revision.assetVersions).toEqual({ "test-bear": 2, "test-pop": 1, meadow: 1 });
    } finally {
      await restore();
    }
  });

  it("EDT-03.S23 the operator changes the backdrop of a page", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    expect(current.content.backdrop).toBe("meadow");
    const scene = { ...structuredClone(current.content), backdrop: "riverbank", sky: "day" as const };
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
    expect(res.status).toBe(200);
    const body = RevisionResponseSchema.parse(await res.json());
    expect(body.revision).toMatchObject({ kind: "scene", origin: "human", status: "ok" });
    expect(PageSceneSchema.parse(body.revision.content).backdrop).toBe("riverbank");
    expect(body.revision.assetVersions!.riverbank).toBe(1);
    expect(body.revision.assetVersions).not.toHaveProperty("meadow");

    // `riverbank` has no `cloudy` variant.
    const before = await revisionCount(d.storyId);
    const cloudy = { ...scene, sky: "cloudy" as const };
    const bad = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene: cloudy, basedOn: body.revision.id });
    expect(bad.status).toBe(422);
    const err = ErrorSchema.parse(await bad.json());
    expect(err.error).toBe("invalid_scene");
    expect((err.issues as Array<{ code: string }>).map((i) => i.code)).toContain("backdrop_sky_mismatch");
    expect(await revisionCount(d.storyId)).toBe(before);
  });

  it("EDT-03.S20 PUT scene with a malformed layer ID returns 422 unknown_instance", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const before = await revisionCount(d.storyId);
    for (const bad of ["not-a-uuid", current.content.layers[0]!.instanceId.toUpperCase()]) {
      const scene = structuredClone(current.content) as Omit<PageScene, "layers"> & { layers: Array<Record<string, unknown>> };
      scene.layers.push({ instanceId: bad, kind: "prop", ref: "test-ball", pose: "default", slot: "prop-left" });
      const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
      expect(res.status, bad).toBe(422);
      const body = ErrorSchema.parse(await res.json());
      expect(body.error).toBe("invalid_scene");
      expect((body.issues as Array<{ code: string }>).map((i) => i.code)).toContain("unknown_instance");
    }
    expect(await revisionCount(d.storyId)).toBe(before);
    expect((await readStory(d.storyId)).heads[`scene:${p1}`]).toBe(current.id);
  });

  it("EDT-03.S21 PUT scene with a layer ID that is not in the edited revision returns 422 unknown_instance", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const current = await sceneHead(d.storyId, p1);
    const scene = structuredClone(current.content);
    scene.layers.push({ instanceId: newId(), kind: "prop", ref: "test-ball", pose: "default", slot: "prop-left" });
    const before = await revisionCount(d.storyId);
    const res = await call(fakeEnv().env, "PUT", scenePath(d.storyId, p1), { scene, basedOn: current.id });
    expect(res.status).toBe(422);
    const body = ErrorSchema.parse(await res.json());
    expect(body.error).toBe("invalid_scene");
    expect((body.issues as Array<{ code: string }>).map((i) => i.code)).toContain("unknown_instance");
    expect(await revisionCount(d.storyId)).toBe(before);
    expect((await readStory(d.storyId)).heads[`scene:${p1}`]).toBe(current.id);

    // With no scene head (`basedOn` null), no layer may send an ID.
    const p = await seedPublishableStory(env, { missingScenePage: 1 });
    const q1 = p.pageIds[0]!;
    const before2 = await revisionCount(p.storyId);
    const res2 = await call(fakeEnv().env, "PUT", scenePath(p.storyId, q1), { scene: current.content, basedOn: null });
    expect(res2.status).toBe(422);
    const body2 = ErrorSchema.parse(await res2.json());
    expect((body2.issues as Array<{ code: string }>).map((i) => i.code)).toContain("unknown_instance");
    expect(await revisionCount(p.storyId)).toBe(before2);
    expect((await readStory(p.storyId)).heads[`scene:${q1}`]).toBeUndefined();
  });
});

// `commitHead` is stubbed on a fresh module graph: the Worker's main module
// has already loaded `../db/heads`, so a top-level `vi.mock` does not reach
// the route (amendment R58).
describe("save routes when the head compare-and-set is exhausted", () => {
  afterEach(() => {
    vi.doUnmock("../db/heads");
    vi.resetModules();
  });

  it("EDT-03.S22 a save that exhausts the head compare-and-set returns 503 busy and keeps the revision", async () => {
    const d = await draftStory();
    const p1 = d.pageIds[0]!;
    const scene = await sceneHead(d.storyId, p1);
    const textId = await textHeadId(d.storyId, p1);
    vi.resetModules();
    vi.doMock("../db/heads", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../db/heads")>();
      return {
        ...actual,
        commitHead: vi.fn(async (_db: unknown, input: { storyId: string }) => {
          throw new actual.HeadCasExhaustedError(input.storyId, 5);
        }),
      };
    });
    const fresh = (await import("./app")).app;
    const e = fakeEnv().env;
    const send = (method: string, path: string, body: unknown) =>
      Promise.resolve(fresh.request(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, e));

    const responses = [
      await send("PUT", textPath(d.storyId, p1), { text: "Page 1. The bear says hi.", basedOn: textId }),
      await send("PUT", scenePath(d.storyId, p1), { scene: scene.content, basedOn: scene.id }),
      await send("POST", stillFitsPath(d.storyId, p1), { basedOn: scene.id, textBasedOn: textId }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(503);
      expect(ErrorSchema.parse(await res.json())).toEqual({ error: "busy" });
    }
    const after = await readStory(d.storyId);
    expect(after.heads[`page_text:${p1}`]).toBe(textId);
    expect(after.heads[`scene:${p1}`]).toBe(scene.id);
    // Each save stored its human revision before the head move gave up.
    const kept = (await db().select().from(revision).where(eq(revision.storyId, d.storyId))).filter(
      (r) => r.pageId === p1 && r.origin === "human",
    );
    expect(kept.map((r) => r.kind).sort()).toEqual(["page_text", "scene", "scene"]);
    expect(kept.every((r) => r.status === "ok")).toBe(true);
    expect(kept.find((r) => r.kind === "page_text")!.content).toEqual({ text: "Page 1. The bear says hi." });
  });
});

// `markRunFailed` throws after `STORY_RUN.create` failed: the routes still
// answer 503 with the IDs (review finding, item 3). Stubbed on a fresh module
// graph, as in the R58 test.
describe("routes when the workflow is down and markRunFailed throws", () => {
  afterEach(() => {
    vi.doUnmock("../db/stories");
    vi.resetModules();
  });

  it("POST stories and POST runs return 503 with the IDs when markRunFailed throws", async () => {
    const ids = await newStory(db());
    await markRunFailed(db(), ids.runId, { errors: [] });
    vi.resetModules();
    vi.doMock("../db/stories", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../db/stories")>();
      return {
        ...actual,
        markRunFailed: vi.fn(async () => {
          throw new TypeError("d1 down");
        }),
      };
    });
    const fresh = (await import("./app")).app;
    const e = fakeEnv({ createFails: true }).env;
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = (path: string, body: unknown) =>
      Promise.resolve(fresh.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, e));

    const text = words(250, "secret");
    const created = await send("/api/studio/stories", { text });
    expect(created.status).toBe(503);
    const createdBody = (await created.json()) as { storyId: string; runId: string };
    expect(createdBody).toEqual({ error: "workflow_unavailable", storyId: createdBody.storyId, runId: createdBody.runId });
    expect(createdBody.storyId).toMatch(UUID7);
    expect(createdBody.runId).toMatch(UUID7);

    const started = await send(`/api/studio/stories/${ids.storyId}/runs`, { scope: { kind: "full" } });
    expect(started.status).toBe(503);
    const startedBody = (await started.json()) as { runId: string };
    expect(startedBody).toEqual({ error: "workflow_unavailable", runId: startedBody.runId });
    expect(startedBody.runId).toMatch(UUID7);

    const logged = logs.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).not.toContain("secret0");
    expect(logged).not.toContain("d1 down");
  });
});
