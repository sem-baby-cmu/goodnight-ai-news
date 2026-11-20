import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  type AssetManifest,
  AssetManifestSchema,
  type Outline,
  type PageScene,
  PageTextSchema,
  type RegistrySnapshot,
  type Issue,
  type SceneDraft,
  SceneDraftSchema,
  assignSceneIds,
  isLayerManifest,
  validateScene,
} from "@storybook/dsl";
import { TEMPLATES, layoutScene } from "@storybook/layout";
import { ModelOutputError } from "@storybook/models";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ErrorRecord,
  type HeadKey,
  type RevisionKind,
  type RunScope,
  asset,
  assetVersion,
  callLog,
  commitHead,
  getCall,
  getDb,
  insertRevisions,
  insertRun,
  loadActiveRegistry,
  loadStoryHeads,
  newId,
  pageStates,
  revision,
  run,
  saveHumanRevision,
  story,
} from "../db";
import { newStory, seedRegistry } from "../test/fixtures";
import { type FaultContext, type FaultPoint, seams } from "./seams";
import { audioStep } from "./steps/audio";
import { finishStep, toErrorRecord } from "./steps/finish";
import { freezeStep } from "./steps/freeze";
import { sceneStep } from "./steps/scene";
import { scriptStep } from "./steps/script";
import { MODEL_STEP } from "./story-run";
import { type StubModel, type StubPlan, createStubModel, stubScene, stubScript } from "./stub-model";

const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const db = () => getDb(env.DB);

const DEFAULT_SEAMS = { ...seams };
afterEach(() => {
  Object.assign(seams, DEFAULT_SEAMS);
  vi.restoreAllMocks();
});

// ---- Helpers ----

type Ids = { storyId: string; sourceRevisionId: string; runId: string };

function useStub(registry: RegistrySnapshot, plan?: StubPlan): StubModel {
  const stub = createStubModel({ registry, ...(plan ? { plan } : {}) });
  seams.modelClient = () => stub.client;
  return stub;
}

// Seeds the registry, makes one stub for the test, and creates a story with
// its source revision and a full run.
async function setup(plan?: (registry: RegistrySnapshot) => StubPlan) {
  await seedRegistry(env);
  const registry = await loadActiveRegistry(db());
  const stub = useStub(registry, plan?.(registry));
  const ids: Ids = await newStory(db());
  return { ids, stub, registry };
}

async function runWorkflow(runId: string, storyId: string, scope: RunScope = { kind: "full" }) {
  await using instance = await introspectWorkflowInstance(env.STORY_RUN, runId);
  await instance.modify(async (m) => {
    await m.disableRetryDelays();
  });
  await env.STORY_RUN.create({ id: runId, params: { runId, storyId, scope } });
  await instance.waitForStatus("complete");
  return await instance.getOutput();
}

async function fullRun(plan?: (registry: RegistrySnapshot) => StubPlan) {
  const s = await setup(plan);
  const output = await runWorkflow(s.ids.runId, s.ids.storyId);
  return { ...s, output };
}

// A page run on an existing story. Returns the new run ID.
async function pageRun(storyId: string, scope: Extract<RunScope, { kind: "page" }>) {
  const runId = newId();
  await insertRun(db(), { runId, storyId, scope });
  await runWorkflow(runId, storyId, scope);
  return runId;
}

async function readRun(runId: string) {
  const [row] = await db().select().from(run).where(eq(run.id, runId));
  return row!;
}

async function readStory(storyId: string) {
  const loaded = (await loadStoryHeads(db(), storyId))!;
  const heads = loaded.story.heads;
  const outline = heads.outline ? (loaded.revisions.get(heads.outline)!.content as Outline) : null;
  const pageIds = outline?.pages.map((p) => p.pageId) ?? [];
  const states = pageStates({ pageIds, heads, revisions: loaded.revisions });
  const head = (key: HeadKey) => {
    const id = heads[key];
    return id === undefined ? undefined : loaded.revisions.get(id);
  };
  return { story: loaded.story, heads, outline, pageIds, states, head };
}

async function revisionsOf(storyId: string, kind?: RevisionKind, pageId?: string) {
  const rows = await db().select().from(revision).where(eq(revision.storyId, storyId));
  return rows.filter((r) => (kind === undefined || r.kind === kind) && (pageId === undefined || r.pageId === pageId));
}

async function callsOf(runId: string, step?: string) {
  const rows = await db().select().from(callLog).where(eq(callLog.runId, runId));
  return rows.filter((r) => step === undefined || r.step === step);
}

// The #64 columns, read with SQL: this file must compile before schema.ts has them.
type CallColumns = { step: string; purpose: "first" | "repair"; model: string; configured_model: string | null; repair_issues: Issue[] | null };
async function callColumns(runId: string, step?: string): Promise<CallColumns[]> {
  const { results } = await env.DB.prepare(
    "SELECT step, purpose, model, configured_model, repair_issues FROM call_log WHERE run_id = ? ORDER BY step, purpose",
  )
    .bind(runId)
    .all<Omit<CallColumns, "repair_issues"> & { repair_issues: string | null }>();
  return results
    .filter((r) => step === undefined || r.step === step)
    .map((r) => ({ ...r, repair_issues: r.repair_issues === null ? null : (JSON.parse(r.repair_issues) as Issue[]) }));
}
const repairLines = (issues: Issue[]) => issues.map((i) => `- ${i.path}: ${i.message}`).join("\n");

async function pageNumberOf(storyId: string, pageId: string): Promise<number> {
  return (await readStory(storyId)).pageIds.indexOf(pageId) + 1;
}

const isScenePage = (n: number) => async (ctx: FaultContext) =>
  ctx.step.startsWith("scene:") && (await pageNumberOf(ctx.storyId, ctx.pageId)) === n;

// "Stop between steps": `seams.at` throws once at `point` for the matching step.
function stopOnce(point: FaultPoint, match: (ctx: FaultContext) => boolean | Promise<boolean>) {
  let fired = false;
  seams.at = async (p, ctx) => {
    if (fired || p !== point || !(await match(ctx))) return;
    fired = true;
    throw new Error("injected stop");
  };
}

// An operator's text save. The text keeps the "Page <n>." prefix, so the stub
// still finds the page number.
async function saveText(storyId: string, pageId: string, text: string): Promise<string> {
  const current = (await readStory(storyId)).head(`page_text:${pageId}`)!;
  const saved = await saveHumanRevision(db(), {
    storyId,
    kind: "page_text",
    pageId,
    content: { text },
    basis: current.basis,
    basedOn: current.id,
  });
  expect(saved.status).toBe("moved");
  return saved.revisionId;
}

// Inserts version `version` of `key` (a copy of v1) and makes it the active one.
async function activateVersion(key: string, version: number) {
  const d = db();
  const a = (await d.query.asset.findFirst({ where: (t, { eq }) => eq(t.key, key) }))!;
  const v1 = (await d.query.assetVersion.findFirst({
    where: (t, { and, eq }) => and(eq(t.assetId, a.id), eq(t.version, 1)),
  }))!;
  await d
    .insert(assetVersion)
    .values({
      id: newId(),
      assetId: a.id,
      version,
      renderer: v1.renderer,
      manifest: v1.manifest,
      r2Prefix: `assets/${key}/v${version}/`,
      active: false,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
  await d.batch([
    d.update(assetVersion).set({ active: false }).where(eq(assetVersion.assetId, a.id)),
    d
      .update(assetVersion)
      .set({ active: true })
      .where(and(eq(assetVersion.assetId, a.id), eq(assetVersion.version, version))),
  ]);
}

// A wide character (1200 × 800). Two of them in `two-friends` overlap more
// than 15% even at `minScale` (RUN-04.S6).
const WIDE = "test-wide";
async function setWideCharacter(active: boolean) {
  const d = db();
  const manifest: AssetManifest = {
    kind: "character",
    poses: [
      {
        id: "stand",
        file: "stand.webp",
        foot: { x: 600, y: 800 },
        box: { x: 0, y: 0, w: 1200, h: 800 },
        face: { x: 500, y: 60, w: 200, h: 160 },
        expression: "happy",
      },
    ],
    expressions: ["happy"],
    legal: [{ pose: "stand", expression: "happy" }],
    flippable: true,
  };
  const createdAt = new Date().toISOString();
  await d.insert(asset).values({ id: newId(), key: WIDE, kind: "character", name: WIDE, createdAt }).onConflictDoNothing();
  const a = (await d.query.asset.findFirst({ where: (t, { eq }) => eq(t.key, WIDE) }))!;
  await d
    .insert(assetVersion)
    .values({ id: newId(), assetId: a.id, version: 1, renderer: "webp", manifest, r2Prefix: `assets/${WIDE}/v1/`, active, createdAt })
    .onConflictDoNothing();
  await d.update(assetVersion).set({ active }).where(eq(assetVersion.assetId, a.id));
}

// Two keys that the models must not see (`HIDDEN_FROM_MODEL`, #84), in the registry of a run:
// `door` as scenery and `window` as a character. The script prompt and the outline schema list
// characters only, so a hidden character is needed to see a script step that passes the frozen
// registry. Neither key has a legal pose and expression pair that `stubScene` could pick.
async function seedHiddenKeys() {
  const d = db();
  const createdAt = new Date().toISOString();
  const doorManifest = AssetManifestSchema.parse({
    kind: "scenery",
    poses: [{ id: "default", file: "default.webp", foot: { x: 200, y: 800 }, box: { x: 0, y: 0, w: 400, h: 800 } }],
    expressions: [],
    legal: [],
    flippable: false,
  });
  const windowManifest = AssetManifestSchema.parse({
    kind: "character",
    poses: [
      {
        id: "stand",
        file: "stand.webp",
        foot: { x: 200, y: 800 },
        box: { x: 0, y: 0, w: 400, h: 800 },
        face: { x: 120, y: 60, w: 160, h: 160 },
        expression: "happy",
      },
    ],
    expressions: ["happy"],
    legal: [{ pose: "stand", expression: "happy" }],
    flippable: true,
  });
  for (const h of [
    { key: "door", kind: "scenery" as const, manifest: doorManifest },
    { key: "window", kind: "character" as const, manifest: windowManifest },
  ]) {
    // Safe to call twice: this file does not clear the D1 database between tests, so the keys of an
    // earlier test are still there (same pattern as `seedRegistry`).
    await d.insert(asset).values({ id: newId(), key: h.key, kind: h.kind, name: h.key, createdAt }).onConflictDoNothing();
    const row = await d.query.asset.findFirst({ where: (a, { eq: same }) => same(a.key, h.key) });
    await d
      .insert(assetVersion)
      .values({ id: newId(), assetId: row!.id, version: 1, renderer: "webp", manifest: h.manifest, r2Prefix: `assets/${h.key}/v1/`, active: true, createdAt })
      .onConflictDoNothing();
  }
}

const firstKey =(registry: RegistrySnapshot, kind: string) =>
  Object.keys(registry.assets)
    .filter((k) => registry.assets[k]!.kind === kind)
    .sort()[0]!;

// A prop key in a character slot: `validateScene` rejects it.
function propInCharacterSlot(registry: RegistrySnapshot): SceneDraft {
  const scene = stubScene(registry);
  scene.layers[0] = { ...scene.layers[0]!, kind: "prop", ref: firstKey(registry, "prop"), pose: "default", expression: null };
  return scene;
}

const status = (s: number, message = `provider status ${s}`) => ({ error: Object.assign(new Error(message), { status: s }) });

// Captures the `user` prompt of every call of `model`, in call order.
function capturePrompts(stub: StubModel, model: "script" | "scene"): string[] {
  const prompts: string[] = [];
  const client = {
    ...stub.client,
    generateJson: (req: Parameters<StubModel["client"]["generateJson"]>[0]) => {
      if (req.model === model) prompts.push(req.user);
      return stub.client.generateJson(req);
    },
  };
  seams.modelClient = () => client;
  return prompts;
}
const captureScenePrompts = (stub: StubModel) => capturePrompts(stub, "scene");

type ModelRequest = Parameters<StubModel["client"]["generateJson"]>[0];

// Captures every request (`system`, `user`, `schema`) of the script and the scene calls.
function captureRequests(stub: StubModel): ModelRequest[] {
  const requests: ModelRequest[] = [];
  const client = {
    ...stub.client,
    generateJson: (req: ModelRequest) => {
      requests.push(req);
      return stub.client.generateJson(req);
    },
  };
  seams.modelClient = () => client;
  return requests;
}

// Turns every active asset version off; returns a function that restores them.
async function deactivateRegistry(): Promise<() => Promise<void>> {
  const d = db();
  const active = await d.select({ id: assetVersion.id }).from(assetVersion).where(eq(assetVersion.active, true));
  await d.update(assetVersion).set({ active: false });
  return async () => {
    for (const { id } of active) await d.update(assetVersion).set({ active: true }).where(eq(assetVersion.id, id));
  };
}

const nameOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return (err as Error).name;
  }
  return "resolved";
};

// Runs the steps directly, without the Workflow: freeze, script, then scene and
// audio for every page.
async function directDraft(plan?: (registry: RegistrySnapshot) => StubPlan) {
  const s = await setup(plan);
  await freezeStep(env, s.ids.runId, s.ids.storyId);
  const script = await scriptStep(env, s.ids.runId, s.ids.storyId);
  if (script.status !== "ok") throw new Error("script step failed");
  for (const p of script.pages) {
    await sceneStep(env, s.ids.runId, s.ids.storyId, p.pageId);
    await audioStep(env, s.ids.runId, s.ids.storyId, p.pageId);
  }
  return { ...s, script };
}

async function dropHead(storyId: string, key: HeadKey) {
  const s = await readStory(storyId);
  const heads = { ...s.heads };
  delete heads[key];
  await db().update(story).set({ heads }).where(eq(story.id, storyId));
}

// ---- Tests ----

describe("StoryRunWorkflow", () => {
  // The guard: the module seam reaches the code that the Workflow runs.
  it("stub injection reaches the workflow", async () => {
    const { stub } = await fullRun();
    expect(stub.answered.script).toBe(1);
  });

  it("an audio call row stores the usage that synthesizeSpeech returns (#65)", async () => {
    const { ids } = await fullRun();
    const rows = (await callsOf(ids.runId)).filter((r) => r.step.startsWith("audio:"));
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("RUN-01.S2 full run on an empty database", async () => {
    const { ids, stub, output } = await fullRun();
    expect(output).toEqual({ status: "draft_ready" });
    const s = await readStory(ids.storyId);
    expect(s.pageIds).toHaveLength(6);
    expect(s.states.map((p) => p.state)).toEqual(Array(6).fill("ok"));
    const expectedKeys = ["source", "outline", ...s.pageIds.flatMap((id) => [`page_text:${id}`, `scene:${id}`, `audio:${id}`])];
    expect(Object.keys(s.heads).sort()).toEqual(expectedKeys.sort());
    const revs = await revisionsOf(ids.storyId);
    const count = (kind: RevisionKind) => revs.filter((r) => r.kind === kind).length;
    expect([count("outline"), count("page_text"), count("scene"), count("audio")]).toEqual([1, 6, 6, 6]);
    expect((await readRun(ids.runId)).status).toBe("draft_ready");
    expect(stub.answered.script).toBe(1);
    for (let n = 1; n <= 6; n++) {
      expect(stub.answered[`scene:${n}`]).toBe(1);
      expect(stub.answered[`audio:${n}`]).toBe(1);
    }
  });

  it("SYS-01.S1 stop after the call_log insert, then retry", async () => {
    const s = await setup();
    stopOnce("after_call_log", isScenePage(1));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.answered["scene:1"]).toBe(1);
    const st = await readStory(s.ids.storyId);
    const p1 = st.pageIds[0]!;
    const scenes = await revisionsOf(s.ids.storyId, "scene", p1);
    expect(scenes).toHaveLength(1);
    expect(st.heads[`scene:${p1}`]).toBe(scenes[0]!.id);
  });

  it("SYS-01.S6 stop after the script call_log insert keeps the page ids", async () => {
    const s = await setup();
    stopOnce("after_call_log", (ctx) => ctx.step === "script");
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.answered.script).toBe(1);
    const st = await readStory(s.ids.storyId);
    const texts = await revisionsOf(s.ids.storyId, "page_text");
    expect(texts).toHaveLength(6);
    expect(texts.map((r) => r.pageId).sort()).toEqual([...st.pageIds].sort());
  });

  it("SYS-01.S2 stop after the revision insert and before the head move, then retry", async () => {
    const s = await setup();
    stopOnce("after_revisions", isScenePage(1));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const st = await readStory(s.ids.storyId);
    const p1 = st.pageIds[0]!;
    const scenes = await revisionsOf(s.ids.storyId, "scene", p1);
    expect(scenes).toHaveLength(1);
    expect(st.heads[`scene:${p1}`]).toBe(scenes[0]!.id);
  });

  it("RUN-05.S1 first output invalid, repair valid, 429 between them", async () => {
    const s = await setup((registry) => ({
      "scene:1": (attempt) => (attempt === 1 ? { value: propInCharacterSlot(registry) } : attempt === 2 ? status(429) : undefined),
    }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.answered["scene:1"]).toBe(2);
    expect(s.stub.attempts["scene:1"]).toBe(3);
    const st = await readStory(s.ids.storyId);
    const p1 = st.pageIds[0]!;
    const calls = await callsOf(s.ids.runId, `scene:${p1}`);
    expect(calls.map((c) => c.purpose).sort()).toEqual(["first", "repair"]);
    const head = st.head(`scene:${p1}`)!;
    expect(head.callId).toBe(calls.find((c) => c.purpose === "repair")!.callId);
    expect(head.status).toBe("ok");
  });

  it("RUN-05.S2 repair also invalid keeps the candidate as needs_review", async () => {
    const s = await setup((registry) => ({ "scene:1": () => ({ value: propInCharacterSlot(registry) }) }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const st = await readStory(s.ids.storyId);
    const head = st.head(`scene:${st.pageIds[0]!}`)!;
    expect(head.status).toBe("needs_review");
    expect((head.error as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    expect((head.content as PageScene).layers).toHaveLength(propInCharacterSlot(s.registry).layers.length);
    expect((await readRun(s.ids.runId)).status).toBe("needs_review");
  });

  it("EDT-04.S1 operator edits page 3 text while scene:p3 is running", async () => {
    const s = await setup();
    let human: string | undefined;
    seams.at = async (point, ctx) => {
      if (human !== undefined || point !== "before_model_call" || !(await isScenePage(3)(ctx))) return;
      human = await saveText(ctx.storyId, ctx.pageId, "Page 3. The bunny says hello to everyone.");
    };
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const st = await readStory(s.ids.storyId);
    const p3 = st.pageIds[2]!;
    const scenes = await revisionsOf(s.ids.storyId, "scene", p3);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]!.status).toBe("superseded");
    expect(st.heads[`scene:${p3}`]).toBeUndefined();
    expect(st.heads[`page_text:${p3}`]).toBe(human);
    expect(st.states[2]!.state).toBe("missing");
    expect(st.states[2]!.problems).toContainEqual({ target: "scene", reason: "missing" });
    expect((await readRun(s.ids.runId)).status).toBe("needs_review");
  });

  it("EDT-02.S3 page run for page 3 audio after a text change", async () => {
    const { ids } = await fullRun();
    const before = (await readStory(ids.storyId)).heads;
    const p3 = (await readStory(ids.storyId)).pageIds[2]!;
    const human = await saveText(ids.storyId, p3, "Page 3. The bunny tells the news again.");
    await pageRun(ids.storyId, { kind: "page", pageId: p3, target: "audio" });
    const st = await readStory(ids.storyId);
    const changed = (Object.keys({ ...before, ...st.heads }) as HeadKey[]).filter((k) => before[k] !== st.heads[k]).sort();
    expect(changed).toEqual([`audio:${p3}`, `page_text:${p3}`].sort());
    for (const pageId of st.pageIds) {
      expect(await revisionsOf(ids.storyId, "audio", pageId)).toHaveLength(pageId === p3 ? 2 : 1);
    }
    expect(st.head(`audio:${p3}`)!.basis).toEqual({ [`page_text:${p3}`]: human });
  });

  it("RUN-05.S6 TTS fails for page 5", async () => {
    const s = await setup(() => ({ "audio:5": () => status(503) }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.attempts["audio:5"]).toBe(3);
    const st = await readStory(s.ids.storyId);
    const p5 = st.pageIds[4]!;
    expect(st.heads[`audio:${p5}`]).toBeUndefined();
    const r = await readRun(s.ids.runId);
    expect(r.error!.errors).toHaveLength(1);
    expect(r.error!.errors[0]).toMatchObject({ step: `audio:${p5}`, pageId: p5, providerStatus: 503 });
    expect(r.status).toBe("needs_review");
  });

  it("RUN-05.S5 provider 400 on a scene is not retried", async () => {
    const s = await setup(() => ({ "scene:2": () => status(400, "the request names an unknown slot") }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.attempts["scene:2"]).toBe(1);
    const st = await readStory(s.ids.storyId);
    const p2 = st.pageIds[1]!;
    const calls = await callsOf(s.ids.runId, `scene:${p2}`);
    expect(calls).toHaveLength(1);
    // Item 1: call_log.result is a tagged envelope.
    expect(calls[0]!.result).toMatchObject({ kind: "provider_error", status: 400 });
    expect(calls[0]!.usage).toBeNull();
    const head = st.head(`scene:${p2}`)!;
    expect(head.status).toBe("needs_review");
    expect(head.content).toBeNull();
    expect(head.callId).toBe(calls[0]!.callId);
    expect(head.error).toMatchObject({ providerStatus: 400 });
    expect((head.error as { message: string }).message).toContain("the request names an unknown slot");
    const r = await readRun(s.ids.runId);
    expect(r.error!.errors).toHaveLength(1);
    expect(r.error!.errors[0]).toMatchObject({ step: `scene:${p2}`, pageId: p2, providerStatus: 400 });
  });

  it("RUN-05.S3 script invalid after repair fails the run", async () => {
    const s = await setup(() => ({ script: () => ({ value: { title: "", cast: [], pages: [] } }) }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const r = await readRun(s.ids.runId);
    expect(r.status).toBe("failed");
    expect(r.error!.errors[0]!.issues!.length).toBeGreaterThan(0);
    const revs = await revisionsOf(s.ids.storyId);
    expect(revs.map((x) => x.kind)).toEqual(["source"]);
  });

  it("unparseable scene output goes to repair", async () => {
    const s = await setup(() => ({
      "scene:1": (attempt) =>
        attempt === 1
          ? { error: new ModelOutputError("Model message content is not valid JSON", { modelId: "stub", usage: null, raw: "{not json" }) }
          : undefined,
    }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const st = await readStory(s.ids.storyId);
    const p1 = st.pageIds[0]!;
    const calls = await callsOf(s.ids.runId, `scene:${p1}`);
    expect(calls).toHaveLength(2);
    // Items 1 and 2: the envelope keeps the raw output.
    expect(calls.find((c) => c.purpose === "first")!.result).toEqual({ kind: "unparsed", raw: "{not json" });
    expect(s.stub.answered["scene:1"]).toBe(1);
    const head = st.head(`scene:${p1}`)!;
    expect(head.callId).toBe(calls.find((c) => c.purpose === "repair")!.callId);
    expect(head.status).toBe("ok");
  });

  it("RUN-03.S12 the scene step assigns every instanceId in code", async () => {
    const { ids, registry } = await fullRun();
    const st = await readStory(ids.storyId);
    const scene = st.head(`scene:${st.pageIds[0]!}`)!.content as PageScene;
    const answer = JSON.stringify(stubScene(registry));
    const layerIds = scene.layers.map((l) => l.instanceId);
    for (const id of layerIds) {
      expect(id).toMatch(UUID7);
      expect(answer).not.toContain(id);
    }
    for (const a of scene.animations) expect(layerIds).toContain(a.target);
    for (const t of scene.interactions) {
      expect(layerIds).toContain(t.on.tap);
      for (const a of t.do) if ("target" in a) expect(layerIds).toContain(a.target);
    }
  });

  it("the script and scene steps give the models the model view of the registry (#84)", async () => {
    await seedRegistry(env);
    await seedHiddenKeys();
    const registry = await loadActiveRegistry(db());
    // The registry of the run has the hidden keys; validation uses it whole.
    expect(registry.assets.door?.kind).toBe("scenery");
    expect(registry.assets.window?.kind).toBe("character");
    const stub = useStub(registry);
    const requests = captureRequests(stub);
    const ids = await newStory(db());
    await runWorkflow(ids.runId, ids.storyId);
    const script = requests.filter((r) => r.model === "script");
    const scene = requests.filter((r) => r.model === "scene");
    expect(script.length).toBeGreaterThan(0);
    expect(scene.length).toBeGreaterThan(0);
    // One assertion per call site: scene prompt, scene schema, script prompt, script schema.
    const hidden = /\b(door|window)\b/;
    for (const [step, calls] of [
      ["script", script],
      ["scene", scene],
    ] as const) {
      for (const r of calls) {
        expect(r.system, `${step} system`).not.toMatch(hidden);
        expect(r.user, `${step} user`).not.toMatch(hidden);
        expect(JSON.stringify(r.schema), `${step} schema`).not.toMatch(hidden);
      }
    }
    // Control: the same requests name a visible key, so the checks read real prompts and schemas.
    expect(script[0]!.user).toContain("test-bear");
    expect(JSON.stringify(script[0]!.schema)).toContain("test-bear");
    expect(scene[0]!.user).toContain("test-bear");
    expect(JSON.stringify(scene[0]!.schema)).toContain("test-bear");
  });

  it("RUN-03.S13 a scene with no tap goes to repair", async () => {
    const s = await setup((registry) => ({
      "scene:1": (attempt) => (attempt === 1 ? { value: { ...stubScene(registry), interactions: [] } } : undefined),
    }));
    const prompts = captureScenePrompts(s.stub);
    const issue = SceneDraftSchema.safeParse({ ...stubScene(s.registry), interactions: [] }).error!.issues.find(
      (i) => i.code === "too_small" && i.path.join(".") === "interactions",
    )!;
    expect(issue).toBeDefined();
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const st = await readStory(s.ids.storyId);
    const p1 = st.pageIds[0]!;
    const calls = await callsOf(s.ids.runId, `scene:${p1}`);
    expect(calls.map((c) => c.purpose).sort()).toEqual(["first", "repair"]);
    const page1 = prompts.filter((p) => p.includes("Page 1."));
    expect(page1).toHaveLength(2);
    expect(page1[1]).toContain(`- interactions: ${issue.message}`);
    expect(st.head(`scene:${p1}`)!.status).toBe("ok");
  });

  it("RUN-03.S14 an animation parameter outside its bounds is not clamped", async () => {
    const slow = (registry: RegistrySnapshot): SceneDraft => {
      const scene = stubScene(registry);
      const a = scene.animations[0]!;
      if (a.primitive !== "float") throw new Error("stub scene animation is not float");
      scene.animations[0] = { ...a, params: { ...a.params, period: 8 } };
      return scene;
    };
    const s = await setup((registry) => ({ "scene:1": () => ({ value: slow(registry) }) }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const st = await readStory(s.ids.storyId);
    const head = st.head(`scene:${st.pageIds[0]!}`)!;
    expect(head.status).toBe("needs_review");
    const issues = (head.error as { issues: Array<{ path: string }> }).issues;
    expect(issues.some((i) => i.path.startsWith("animations.0.params.period"))).toBe(true);
    expect((head.content as { animations: Array<{ params: { period: number } }> }).animations[0]!.params.period).toBe(8);
  });

  it("RUN-04.S6 a layout that still fails goes to repair", async () => {
    await setWideCharacter(true);
    try {
      const overlap = (): SceneDraft => ({
        templateId: "two-friends",
        backdrop: "meadow",
        sky: "day",
        layers: [
          { kind: "character", ref: WIDE, pose: "stand", expression: "happy", slot: "left", flip: false },
          { kind: "character", ref: WIDE, pose: "stand", expression: "happy", slot: "right", flip: false },
        ],
        animations: [{ target: "left", primitive: "float", params: { amplitude: 0.007, period: 4 }, trigger: "loop" }],
        interactions: [{ on: { tap: "left" }, do: [{ action: "play_animation", target: "left", primitive: "pop" }] }],
      });
      const s = await setup(() => ({ "scene:1": (attempt) => (attempt === 1 ? { value: overlap() } : undefined) }));
      // The fixture: it passes validateScene, and layoutScene still fails.
      const ctx = { registry: s.registry, templates: TEMPLATES };
      const placed = assignSceneIds(overlap(), newId);
      expect(validateScene(placed, ctx)).toEqual([]);
      const layoutIssues = layoutScene(placed, ctx).issues;
      expect(layoutIssues.length).toBeGreaterThan(0);
      expect(layoutIssues.every((i) => i.code.startsWith("layout."))).toBe(true);

      const prompts = captureScenePrompts(s.stub);
      await runWorkflow(s.ids.runId, s.ids.storyId);
      const st = await readStory(s.ids.storyId);
      const p1 = st.pageIds[0]!;
      const calls = await callsOf(s.ids.runId, `scene:${p1}`);
      expect(calls.map((c) => c.purpose).sort()).toEqual(["first", "repair"]);
      const page1 = prompts.filter((p) => p.includes("Page 1."));
      expect(page1).toHaveLength(2);
      expect(page1[1]).toContain(`- ${layoutIssues[0]!.path}: ${layoutIssues[0]!.message}`);
      expect(st.head(`scene:${p1}`)!.status).toBe("ok");
    } finally {
      await setWideCharacter(false);
    }
  });

  it("RUN-01.S3 every draft page has text, one audio file, a character layer, an animation, and a tap", async () => {
    const { ids } = await fullRun();
    const st = await readStory(ids.storyId);
    const r = await readRun(ids.runId);
    for (const pageId of st.pageIds) {
      expect((st.head(`page_text:${pageId}`)!.content as { text: string }).text.length).toBeGreaterThan(0);
      const audio = st.head(`audio:${pageId}`)!;
      expect(audio.r2Key).toBeTruthy();
      expect(await env.BUCKET.head(audio.r2Key!)).not.toBeNull();
      const scene = st.head(`scene:${pageId}`)!.content as PageScene;
      expect(scene.layers.some((l) => r.registry!.assets[l.ref]?.kind === "character")).toBe(true);
      expect(scene.animations.length).toBeGreaterThan(0);
      expect(scene.interactions.length).toBeGreaterThan(0);
    }
  });

  it("RUN-01.S4 one script call writes the outline and every page text", async () => {
    const { ids, stub } = await fullRun();
    expect(stub.answered.script).toBe(1);
    expect(await callsOf(ids.runId, "script")).toHaveLength(1);
    const outlines = await revisionsOf(ids.storyId, "outline");
    expect(outlines).toHaveLength(1);
    const outline = outlines[0]!.content as Outline;
    expect(outline.title.length).toBeGreaterThan(0);
    expect(outline.cast.length).toBeGreaterThan(0);
    expect(outline.pages.every((p) => p.beat.length > 0)).toBe(true);
    const texts = await revisionsOf(ids.storyId, "page_text");
    expect(texts.map((t) => t.pageId).sort()).toEqual(outline.pages.map((p) => p.pageId).sort());
    for (const t of texts) expect(PageTextSchema.safeParse(t.content).success).toBe(true);
  });

  it("RUN-01.S5 code creates every page ID", async () => {
    const plan = (registry: RegistrySnapshot): StubPlan => {
      const script = stubScript(registry);
      const answer = { ...script, pages: script.pages.map((p, i) => ({ ...p, pageId: `model-${i + 1}` })) };
      return { script: () => ({ value: answer }) };
    };
    const { ids } = await fullRun(plan);
    const st = await readStory(ids.storyId);
    expect(st.pageIds).toHaveLength(6);
    for (const id of st.pageIds) {
      expect(id).toMatch(UUID7);
      expect(id.startsWith("model-")).toBe(false);
    }
    expect(new Set(st.pageIds).size).toBe(st.pageIds.length);
  });

  it("RUN-01.S6 an 8-page run has at most 4 page calls in progress at a time", async () => {
    const { ids, stub } = await fullRun((registry) => ({ script: () => ({ value: stubScript(registry, 8) }) }));
    expect((await readStory(ids.storyId)).pageIds).toHaveLength(8);
    expect(stub.maxInFlight).toBeGreaterThanOrEqual(2);
    expect(stub.maxInFlight).toBeLessThanOrEqual(4);
  });

  it("RUN-01.S17 each scene step sees the scenes of the earlier pages", async () => {
    const s = await setup();
    const prompts = captureScenePrompts(s.stub);
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(prompts).toHaveLength(6);
    prompts.forEach((prompt, i) => {
      expect(prompt).toContain(`Page ${i + 1}.`);
      expect(prompt).toContain(`This page: ${i + 1} of 6`);
      if (i === 0) expect(prompt).toContain("- none");
      for (let k = 1; k <= i; k++) expect(prompt).toContain(`- page ${k}: solo-center, day, []`);
    });
  });

  it("the scene step lists only the ok earlier scenes and only the scenery keys that the model sees (#105)", async () => {
    await seedRegistry(env);
    await seedHiddenKeys();
    const registry = await loadActiveRegistry(db());
    expect(registry.assets.door?.kind).toBe("scenery");
    expect(registry.assets["test-tree"]?.kind).toBe("scenery");
    const stub = useStub(registry);
    const ids = await newStory(db());
    await runWorkflow(ids.runId, ids.storyId);
    const st = await readStory(ids.storyId);
    const [p1, p2, p3] = st.pageIds as [string, string, string];
    // Page 1: an `ok` scene with a hidden (`door`) and a visible (`test-tree`) scenery layer.
    const scene1 = st.head(`scene:${p1}`)!;
    expect(scene1.status).toBe("ok");
    const content1 = scene1.content as PageScene;
    const scenery = (ref: string, instanceId: string) => ({ ...content1.layers[0]!, kind: "scenery", ref, instanceId }) as PageScene["layers"][number];
    const withScenery = { ...content1, layers: [...content1.layers, scenery("door", "door-1"), scenery("test-tree", "tree-1")] };
    await db().update(revision).set({ content: withScenery }).where(eq(revision.id, scene1.id));
    // Page 2: a `needs_review` scene that keeps its content, so only the status filter gives "no scene".
    const scene2 = st.head(`scene:${p2}`)!;
    expect(scene2.content).not.toBeNull();
    await db().update(revision).set({ status: "needs_review" }).where(eq(revision.id, scene2.id));

    const prompts = captureScenePrompts(stub);
    await pageRun(ids.storyId, { kind: "page", pageId: p3, target: "scene" });
    expect(prompts).toHaveLength(1);
    const lines = prompts[0]!.split("\n");
    expect(lines).toContain(`- page 1: ${content1.templateId}, ${content1.sky}, ["test-tree"]`);
    expect(lines.find((l) => l.startsWith("- page 1: "))).not.toContain("door");
    expect(lines).toContain("- page 2: no scene");
    expect(lines).toContain("This page: 3 of 6");
  });

  it("RUN-01.S8 finish sets the final status from the heads and does not wait", async () => {
    const a = await directDraft();
    expect(await finishStep(env, a.ids.runId, a.ids.storyId, { failed: false, errors: [] })).toEqual({ status: "draft_ready" });
    expect((await readRun(a.ids.runId)).status).toBe("draft_ready");

    const b = await directDraft();
    await dropHead(b.ids.storyId, `audio:${b.script.pages[0]!.pageId}`);
    expect(await finishStep(env, b.ids.runId, b.ids.storyId, { failed: false, errors: [] })).toEqual({ status: "needs_review" });
    expect((await readRun(b.ids.runId)).status).toBe("needs_review");

    // A full run reaches `complete` with no event sent (runWorkflow sends none).
    const c = await fullRun();
    expect(c.output).toEqual({ status: "draft_ready" });
  });

  it("RUN-01.S11 a missing or needs_review head makes finish end at needs_review", async () => {
    for (const change of ["page_text", "scene", "audio", "scene_needs_review"] as const) {
      const d = await directDraft();
      const p1 = d.script.pages[0]!.pageId;
      if (change === "scene_needs_review") {
        const id = (await readStory(d.ids.storyId)).heads[`scene:${p1}`]!;
        await db().update(revision).set({ status: "needs_review" }).where(eq(revision.id, id));
      } else {
        await dropHead(d.ids.storyId, `${change}:${p1}`);
      }
      await finishStep(env, d.ids.runId, d.ids.storyId, { failed: false, errors: [] });
      expect((await readRun(d.ids.runId)).status, change).toBe("needs_review");
    }
  });

  it("RUN-01.S12 a stale audio head after a failed page run ends at needs_review", async () => {
    const { ids, registry } = await fullRun();
    const st0 = await readStory(ids.storyId);
    const p3 = st0.pageIds[2]!;
    const oldAudio = st0.heads[`audio:${p3}`];
    await saveText(ids.storyId, p3, "Page 3. The bunny tells the news again.");
    useStub(registry, { "audio:3": () => status(503) });
    const runId = await pageRun(ids.storyId, { kind: "page", pageId: p3, target: "audio" });
    const st = await readStory(ids.storyId);
    expect(st.heads[`audio:${p3}`]).toBe(oldAudio);
    expect(st.states[2]!.problems).toContainEqual({ target: "audio", reason: "stale" });
    expect((await readRun(runId)).status).toBe("needs_review");
  });

  it("RUN-03.S1 freeze records the source revision, the active registry versions, and the heads", async () => {
    const { ids } = await setup();
    try {
      await freezeStep(env, ids.runId, ids.storyId);
      const heads = (await readStory(ids.storyId)).heads;
      const active = await loadActiveRegistry(db());
      const r = await readRun(ids.runId);
      expect(r.basis).toEqual(heads);
      expect(r.basis!.source).toBe(ids.sourceRevisionId);
      expect(r.registry).toEqual(active);
      for (const a of Object.values(r.registry!.assets)) expect(typeof a.version).toBe("number");
      expect(r.status).toBe("running");

      await activateVersion("test-bear", 2);
      await freezeStep(env, ids.runId, ids.storyId);
      const again = await readRun(ids.runId);
      expect(again.basis).toEqual(r.basis);
      expect(again.registry).toEqual(r.registry);
    } finally {
      await activateVersion("test-bear", 1);
    }
  });

  it("RUN-03.S3 every layer references the frozen registry", async () => {
    const { ids } = await fullRun();
    const r = await readRun(ids.runId);
    const st = await readStory(ids.storyId);
    for (const pageId of st.pageIds) {
      const head = st.head(`scene:${pageId}`)!;
      for (const layer of (head.content as PageScene).layers) {
        const a = r.registry!.assets[layer.ref]!;
        expect(a).toBeDefined();
        const m = a.manifest;
        if (!isLayerManifest(m)) throw new Error("a layer references an asset that is not a layer asset");
        expect(m.poses.map((p) => p.id)).toContain(layer.pose);
        if (layer.expression !== undefined) expect(m.expressions).toContain(layer.expression);
        expect(head.assetVersions![layer.ref]).toBe(a.version);
      }
    }
  });

  it("RUN-05.S4 a 429 or 5xx is retried by the platform and a stored result is not requested again", async () => {
    expect(MODEL_STEP.retries.delay).toBe("10 seconds");
    expect(MODEL_STEP.retries.backoff).toBe("exponential");
    // Item 6: a scene step makes up to 2 calls of up to 180 s each.
    expect(MODEL_STEP.timeout).toBe("10 minutes");
    const s = await setup(() => ({ "scene:2": (attempt) => (attempt === 1 ? status(500) : attempt === 2 ? status(429) : undefined) }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.attempts["scene:2"]).toBe(3);
    expect(s.stub.answered["scene:2"]).toBe(1);
    const p2 = (await readStory(s.ids.storyId)).pageIds[1]!;
    expect(await callsOf(s.ids.runId, `scene:${p2}`)).toHaveLength(1);
  });

  it("RUN-05.S8 a provider 400 in the script step fails the run with the provider message", async () => {
    const s = await setup(() => ({ script: (attempt) => (attempt === 1 ? status(400, "bad request: model") : undefined) }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.attempts.script).toBe(1);
    const r = await readRun(s.ids.runId);
    expect(r.status).toBe("failed");
    expect(r.error!.errors[0]).toMatchObject({ step: "script", providerStatus: 400, message: "bad request: model" });
    expect(await revisionsOf(s.ids.storyId, "outline")).toHaveLength(0);
  });

  it("REG-01.S3 a new run freezes the new active version", async () => {
    await seedRegistry(env);
    await activateVersion("test-bear", 2);
    try {
      const { ids } = await fullRun();
      const r = await readRun(ids.runId);
      expect(r.registry!.assets["test-bear"]!.version).toBe(2);
      const st = await readStory(ids.storyId);
      let used = 0;
      for (const pageId of st.pageIds) {
        const head = st.head(`scene:${pageId}`)!;
        if (!(head.content as PageScene).layers.some((l) => l.ref === "test-bear")) continue;
        used++;
        expect(head.assetVersions!["test-bear"]).toBe(2);
      }
      expect(used).toBeGreaterThan(0);
    } finally {
      await activateVersion("test-bear", 1);
    }
  });

  it("REG-01.S6 a page run after a new version uses the new version", async () => {
    const { ids } = await fullRun();
    const before = await readStory(ids.storyId);
    const p2 = before.pageIds[1]!;
    try {
      await activateVersion("test-bear", 2);
      const runId = await pageRun(ids.storyId, { kind: "page", pageId: p2, target: "scene" });
      expect((await readRun(runId)).registry!.assets["test-bear"]!.version).toBe(2);
      const st = await readStory(ids.storyId);
      const newScene = st.head(`scene:${p2}`)!;
      expect(newScene.id).not.toBe(before.heads[`scene:${p2}`]);
      expect(newScene.assetVersions!["test-bear"]).toBe(2);
      for (const pageId of st.pageIds) {
        if (pageId === p2) continue;
        expect(st.heads[`scene:${pageId}`]).toBe(before.heads[`scene:${pageId}`]);
        expect(st.head(`scene:${pageId}`)!.assetVersions!["test-bear"]).toBe(1);
      }
    } finally {
      await activateVersion("test-bear", 1);
    }
  });

  it("SYS-01.S3 only a stop after the model answer repeats the model call", async () => {
    const points: FaultPoint[] = ["before_model_call", "after_model_call", "after_call_log", "after_revisions"];
    for (const point of points) {
      const s = await setup();
      stopOnce(point, isScenePage(1));
      await runWorkflow(s.ids.runId, s.ids.storyId);
      expect(s.stub.attempts["scene:1"], point).toBe(point === "after_model_call" ? 2 : 1);
      const p1 = (await readStory(s.ids.storyId)).pageIds[0]!;
      expect(await callsOf(s.ids.runId, `scene:${p1}`), point).toHaveLength(1);
    }
  });

  it("SYS-01.S5 the audio bytes are in R2 before the call_log row", async () => {
    const { ids } = await setup();
    await freezeStep(env, ids.runId, ids.storyId);
    const script = await scriptStep(env, ids.runId, ids.storyId);
    if (script.status !== "ok") throw new Error("script step failed");
    const puts: Array<{ key: string; rowAtPut: unknown }> = [];
    const bucket = {
      put: async (key: string, value: Uint8Array, options?: R2PutOptions) => {
        const callId = /^calls\/([0-9a-f]{64})\.wav$/.exec(key)?.[1];
        if (callId) puts.push({ key, rowAtPut: await getCall(db(), callId) });
        return env.BUCKET.put(key, value, options);
      },
      get: (key: string) => env.BUCKET.get(key),
      head: (key: string) => env.BUCKET.head(key),
    };
    const wrapped = { ...env, BUCKET: bucket as unknown as R2Bucket };
    const pageId = script.pages[0]!.pageId;
    await audioStep(wrapped, ids.runId, ids.storyId, pageId);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.rowAtPut).toBeNull();
    const callId = puts[0]!.key.slice("calls/".length, -".wav".length);
    expect((await getCall(db(), callId))!.r2Key).toBe(puts[0]!.key);
  });

  it("SYS-01.S7 every step result holds only IDs, statuses, and keys", async () => {
    const { ids, registry } = await setup();
    const templateId = stubScene(registry).templateId;
    const results: unknown[] = [];
    results.push(await freezeStep(env, ids.runId, ids.storyId));
    const script = await scriptStep(env, ids.runId, ids.storyId);
    results.push(script);
    if (script.status !== "ok") throw new Error("script step failed");
    const pageId = script.pages[0]!.pageId;
    results.push(await sceneStep(env, ids.runId, ids.storyId, pageId));
    results.push(await audioStep(env, ids.runId, ids.storyId, pageId));
    results.push(await finishStep(env, ids.runId, ids.storyId, { failed: false, errors: [] }));
    for (const result of results) {
      const json = JSON.stringify(result);
      expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(1_048_576);
      expect(json).not.toContain("Page 1.");
      expect(json).not.toContain(templateId);
    }
  });

  it("SYS-04.S2 toErrorRecord names runId, storyId, pageId, step, and the provider status", () => {
    const base = { runId: newId(), storyId: newId(), pageId: newId() };
    const fromErr = toErrorRecord({ ...base, step: `audio:${base.pageId}`, err: Object.assign(new Error("unavailable"), { status: 503 }) });
    expect(fromErr).toMatchObject({ ...base, step: `audio:${base.pageId}`, providerStatus: 503 });
    const fromValue: ErrorRecord = toErrorRecord({
      ...base,
      step: `scene:${base.pageId}`,
      providerError: { status: 400, message: "bad request" },
    });
    expect(fromValue).toMatchObject({ ...base, step: `scene:${base.pageId}`, providerStatus: 400, message: "bad request" });
  });

  it("SYS-04.S3 logs contain no page text or model output", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m));
    const { registry } = await fullRun();
    const templateId = stubScene(registry).templateId;
    const args = spies.flatMap((s) => s.mock.calls.flat());
    for (const arg of args) {
      for (const text of [String(arg), JSON.stringify(arg) ?? ""]) {
        expect(text).not.toContain("Page 1.");
        expect(text).not.toContain(templateId);
      }
    }
  });

  // Amendment R58: a retry after a successful head move, where an operator
  // later changed a page text, continues with the pages of its outline.
  it("R58 a script retry after its head move continues with that outline", async () => {
    const { ids, stub } = await setup();
    await freezeStep(env, ids.runId, ids.storyId);
    const first = await scriptStep(env, ids.runId, ids.storyId);
    if (first.status !== "ok") throw new Error("script step failed");
    const p1 = first.pages[0]!.pageId;
    const human = await saveText(ids.storyId, p1, "Page 1. The bear reads the news again.");
    const again = await scriptStep(env, ids.runId, ids.storyId);
    expect(again).toEqual(first);
    expect(stub.answered.script).toBe(1);
    const st = await readStory(ids.storyId);
    expect(st.heads.outline).toBe(first.outlineRevisionId);
    expect(st.heads[`page_text:${p1}`]).toBe(human);
  });

  // Amendment R58: an outline head that moved to another revision gives
  // `invalid` with the issue `head_moved`.
  it("R58 a script step whose outline head moved returns head_moved", async () => {
    const { ids } = await setup();
    await freezeStep(env, ids.runId, ids.storyId);
    let other: string | undefined;
    seams.at = async (point, ctx) => {
      if (other !== undefined || point !== "after_revisions" || ctx.step !== "script") return;
      const basis = { source: ids.sourceRevisionId };
      [other] = await insertRevisions(db(), [
        { storyId: ids.storyId, kind: "outline", pageId: "", origin: "human", callId: null, status: "ok", basis, content: { title: "Other", ageBand: "5-7", cast: [], pages: [] } },
      ]);
      expect(await commitHead(db(), { storyId: ids.storyId, moves: { outline: other! }, basis, expected: { outline: null } })).toBe("moved");
    };
    const result = await scriptStep(env, ids.runId, ids.storyId);
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.issues.map((i) => i.code)).toEqual(["head_moved"]);
    const st = await readStory(ids.storyId);
    expect(st.heads.outline).toBe(other);
    expect(Object.keys(st.heads).filter((k) => k.startsWith("page_text:"))).toEqual([]);
  });

  it("operator saves scene of page 1 while scene:p1 is running", async () => {
    const s = await setup();
    let human: string | undefined;
    seams.at = async (point, ctx) => {
      if (human !== undefined || point !== "before_model_call" || !(await isScenePage(1)(ctx))) return;
      const textHead = (await readStory(ctx.storyId)).heads[`page_text:${ctx.pageId}`]!;
      const saved = await saveHumanRevision(db(), {
        storyId: ctx.storyId,
        kind: "scene",
        pageId: ctx.pageId,
        content: assignSceneIds(stubScene(s.registry), newId),
        basis: { [`page_text:${ctx.pageId}`]: textHead },
        basedOn: null,
      });
      human = saved.revisionId;
    };
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const st = await readStory(s.ids.storyId);
    const p1 = st.pageIds[0]!;
    const ai = (await revisionsOf(s.ids.storyId, "scene", p1)).filter((r) => r.origin === "ai");
    expect(ai).toHaveLength(1);
    expect(ai[0]!.status).toBe("superseded");
    expect(st.heads[`scene:${p1}`]).toBe(human);
    expect((await readRun(s.ids.runId)).status).toBe("draft_ready");
  });
  // ---- Review follow-up (items 1 to 7) ----

  it("a scene answer shaped like a provider error goes through the checks and the repair", async () => {
    const s = await setup(() => ({
      "scene:1": (attempt) => (attempt === 1 ? { value: { providerError: { status: 400, message: "fake" } } } : undefined),
    }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.answered["scene:1"]).toBe(2);
    const st = await readStory(s.ids.storyId);
    const p1 = st.pageIds[0]!;
    const calls = await callsOf(s.ids.runId, `scene:${p1}`);
    expect(calls.map((c) => c.purpose).sort()).toEqual(["first", "repair"]);
    expect(calls.find((c) => c.purpose === "first")!.result).toEqual({
      kind: "answer",
      value: { providerError: { status: 400, message: "fake" } },
    });
    expect(st.head(`scene:${p1}`)!.status).toBe("ok");
    const r = await readRun(s.ids.runId);
    expect(r.error!.errors).toEqual([]);
    expect(r.status).toBe("draft_ready");
  });

  it("a script answer shaped like the unparsed marker is a schema failure", async () => {
    const s = await setup(() => ({ script: (attempt) => (attempt === 1 ? { value: { unparsed: true } } : undefined) }));
    const prompts = capturePrompts(s.stub, "script");
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const calls = await callsOf(s.ids.runId, "script");
    expect(calls.map((c) => c.purpose).sort()).toEqual(["first", "repair"]);
    expect(calls.find((c) => c.purpose === "first")!.result).toEqual({ kind: "answer", value: { unparsed: true } });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Your previous answer:\n{"unparsed":true}');
    expect(prompts[1]).not.toContain("model_output_unparsed");
    expect((await readRun(s.ids.runId)).status).toBe("draft_ready");
  });

  it("a TTS output error is stored as an output_error envelope and is not retried", async () => {
    const s = await setup(() => ({
      "audio:2": () => ({ error: new ModelOutputError("Model answer has no audio part", { modelId: "stub", usage: null }) }),
    }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.attempts["audio:2"]).toBe(1);
    const st = await readStory(s.ids.storyId);
    const p2 = st.pageIds[1]!;
    const calls = await callsOf(s.ids.runId, `audio:${p2}`);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.result).toEqual({ kind: "output_error", message: "Model answer has no audio part" });
    const head = st.head(`audio:${p2}`)!;
    expect(head.status).toBe("needs_review");
    expect(head.error).toEqual({ providerStatus: null, message: "Model answer has no audio part" });
    const ok = (await callsOf(s.ids.runId, `audio:${st.pageIds[0]!}`))[0]!;
    expect(ok.result).toMatchObject({ kind: "answer", value: { contentType: "audio/wav", durationMs: 1000 } });
  });

  it("two unparsed scene answers keep the raw output of the repair call", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m));
    const raw = (n: number) => `RAW-OUTPUT-${n} {not json`;
    const s = await setup(() => ({
      "scene:1": (attempt) => ({
        error: new ModelOutputError("Model message content is not valid JSON", { modelId: "stub", usage: null, raw: raw(attempt) }),
      }),
    }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const st = await readStory(s.ids.storyId);
    const p1 = st.pageIds[0]!;
    const head = st.head(`scene:${p1}`)!;
    expect(head.status).toBe("needs_review");
    expect(head.content).toEqual({ unparsed: true, raw: raw(2) });
    const calls = await callsOf(s.ids.runId, `scene:${p1}`);
    expect(head.callId).toBe(calls.find((c) => c.purpose === "repair")!.callId);
    expect(calls.find((c) => c.purpose === "first")!.result).toEqual({ kind: "unparsed", raw: raw(1) });
    // Never log raw output (SYS-04.S3).
    for (const arg of spies.flatMap((sp) => sp.mock.calls.flat())) {
      expect(`${String(arg)} ${JSON.stringify(arg) ?? ""}`).not.toContain("RAW-OUTPUT-");
    }
  });

  it("the unparsed envelope keeps at most 65,536 characters of raw output", async () => {
    const big = "x".repeat(70_000);
    const s = await setup(() => ({
      "scene:1": (attempt) =>
        attempt === 1
          ? { error: new ModelOutputError("Model message content is not valid JSON", { modelId: "stub", usage: null, raw: big }) }
          : undefined,
    }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const p1 = (await readStory(s.ids.storyId)).pageIds[0]!;
    const first = (await callsOf(s.ids.runId, `scene:${p1}`)).find((c) => c.purpose === "first")!;
    expect(first.result).toEqual({ kind: "unparsed", raw: "x".repeat(65_536), truncated: true });
  });

  it("an empty registry fails the run at freeze without retries", async () => {
    await seedRegistry(env);
    const restore = await deactivateRegistry();
    try {
      const s = await setup();
      // NonRetryableError: the platform does not retry the step.
      expect(await nameOf(freezeStep(env, s.ids.runId, s.ids.storyId))).toBe("NonRetryableError");
      await runWorkflow(s.ids.runId, s.ids.storyId);
      const r = await readRun(s.ids.runId);
      expect(r.status).toBe("failed");
      expect(r.error!.errors).toHaveLength(1);
      expect(r.error!.errors[0]).toMatchObject({ step: "freeze", pageId: null });
      expect(s.stub.attempts).toEqual({});
    } finally {
      await restore();
    }
  });

  it("a registry with no backdrop fails the run at freeze without retries", async () => {
    await seedRegistry(env);
    const d = db();
    const backdrops = await d
      .select({ id: assetVersion.id })
      .from(assetVersion)
      .innerJoin(asset, eq(asset.id, assetVersion.assetId))
      .where(and(eq(asset.kind, "backdrop"), eq(assetVersion.active, true)));
    expect(backdrops.length).toBeGreaterThan(0);
    for (const { id } of backdrops) await d.update(assetVersion).set({ active: false }).where(eq(assetVersion.id, id));
    try {
      const s = await setup();
      await expect(freezeStep(env, s.ids.runId, s.ids.storyId)).rejects.toThrow("the active registry has no backdrop asset");
      expect(await nameOf(freezeStep(env, s.ids.runId, s.ids.storyId))).toBe("NonRetryableError");
      await runWorkflow(s.ids.runId, s.ids.storyId);
      const r = await readRun(s.ids.runId);
      expect(r.status).toBe("failed");
      expect(r.error!.errors).toHaveLength(1);
      expect(r.error!.errors[0]).toMatchObject({ step: "freeze", pageId: null });
      // No script call is paid, and no scene or audio step runs.
      expect(s.stub.attempts).toEqual({});
    } finally {
      for (const { id } of backdrops) await d.update(assetVersion).set({ active: true }).where(eq(assetVersion.id, id));
    }
  });

  it("errors that cannot heal on retry throw NonRetryableError", async () => {
    const s = await setup();
    expect(await nameOf(freezeStep(env, s.ids.runId, newId()))).toBe("NonRetryableError");
    await freezeStep(env, s.ids.runId, s.ids.storyId);
    // No head for the basis key: a page with no page_text.
    expect(await nameOf(sceneStep(env, s.ids.runId, s.ids.storyId, newId()))).toBe("NonRetryableError");
    // The outline JSON schema cannot be built from a registry with no character.
    await db().update(run).set({ registry: { assets: {} } }).where(eq(run.id, s.ids.runId));
    expect(await nameOf(scriptStep(env, s.ids.runId, s.ids.storyId))).toBe("NonRetryableError");
    expect(s.stub.attempts).toEqual({});
  });

  it("the script repair prompt holds no code-set pageId", async () => {
    const s = await setup((registry) => ({
      script: (attempt) => (attempt === 1 ? { value: { ...stubScript(registry), title: "" } } : undefined),
    }));
    const prompts = capturePrompts(s.stub, "script");
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Your previous answer:");
    expect(prompts[1]).not.toContain("pageId");
    expect((await readRun(s.ids.runId)).status).toBe("draft_ready");
  });

  it("a script sentence over 12 words starts the script repair", async () => {
    const s = await setup((registry) => ({
      script: (attempt) =>
        attempt === 1
          ? {
              value: {
                ...stubScript(registry),
                pages: stubScript(registry).pages.map((p, i) =>
                  i === 0 ? { ...p, text: "Page 1. The small bear walks to the park to hear the good news today." } : p,
                ),
              },
            }
          : undefined,
    }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.attempts.script).toBe(2);
    expect((await readRun(s.ids.runId)).status).toBe("draft_ready");
  });

  it("finishStep writes the errors sorted by step", async () => {
    const d = await directDraft();
    const rec = (step: string): ErrorRecord => ({ runId: d.ids.runId, storyId: d.ids.storyId, pageId: null, step, providerStatus: null, message: step });
    const shuffled = ["scene:b", "audio:c", "scene:a", "audio:a", "error:x"].map(rec);
    await finishStep(env, d.ids.runId, d.ids.storyId, { failed: false, errors: shuffled });
    expect((await readRun(d.ids.runId)).error!.errors.map((e) => e.step)).toEqual(["audio:a", "audio:c", "error:x", "scene:a", "scene:b"]);
  });

  it("RUN-05.S15 a scene repair call stores the issues of the first attempt", async () => {
    const s = await setup((registry) => ({
      "scene:1": (attempt) => (attempt === 1 ? { value: propInCharacterSlot(registry) } : undefined),
    }));
    const prompts = captureScenePrompts(s.stub);
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const p1 = (await readStory(s.ids.storyId)).pageIds[0]!;
    const [first, repair] = await callColumns(s.ids.runId, `scene:${p1}`);
    expect([first!.purpose, repair!.purpose]).toEqual(["first", "repair"]);
    expect(first!.repair_issues).toBeNull();
    expect(repair!.repair_issues!.map((i) => i.code)).toContain("slot_kind_mismatch");
    const repairPrompts = prompts.filter((p) => p.includes("Fix these problems and answer again:"));
    expect(repairPrompts).toHaveLength(1);
    expect(repairPrompts[0]!.endsWith(`Fix these problems and answer again:\n${repairLines(repair!.repair_issues!)}`)).toBe(true);
  });

  it("RUN-05.S15 a script repair call stores the issues of the first attempt", async () => {
    const s = await setup((registry) => ({
      script: (attempt) => (attempt === 1 ? { value: { ...stubScript(registry), title: "" } } : undefined),
    }));
    const prompts = capturePrompts(s.stub, "script");
    await runWorkflow(s.ids.runId, s.ids.storyId);
    const [first, repair] = await callColumns(s.ids.runId, "script");
    expect([first!.purpose, repair!.purpose]).toEqual(["first", "repair"]);
    expect(first!.repair_issues).toBeNull();
    expect(repair!.repair_issues!.length).toBeGreaterThan(0);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]!.endsWith(`Fix these problems and answer again:\n${repairLines(repair!.repair_issues!)}`)).toBe(true);
  });

  it("RUN-05.S15 a scene repair that gets a provider 400 still stores the issues", async () => {
    const s = await setup((registry) => ({
      "scene:1": (attempt) => (attempt === 1 ? { value: propInCharacterSlot(registry) } : status(400)),
    }));
    await runWorkflow(s.ids.runId, s.ids.storyId);
    expect(s.stub.attempts["scene:1"]).toBe(2);
    const st = await readStory(s.ids.storyId);
    const p1 = st.pageIds[0]!;
    const [first, repair] = await callColumns(s.ids.runId, `scene:${p1}`);
    expect([first!.purpose, repair!.purpose]).toEqual(["first", "repair"]);
    expect(repair!.repair_issues!.map((i) => i.code)).toContain("slot_kind_mismatch");
    expect(st.head(`scene:${p1}`)!.error).toMatchObject({ providerStatus: 400 });
  });

  it("SYS-05.S7 every call row names the configured model", async () => {
    const s = await fullRun();
    const rows = await callColumns(s.ids.runId);
    expect(rows.length).toBeGreaterThan(0);
    const configuredFor = (step: string) =>
      step === "script" ? env.MODEL_SCRIPT : step.startsWith("scene:") ? env.MODEL_SCENE : step.startsWith("audio:") ? env.MODEL_TTS : undefined;
    for (const row of rows) {
      expect(row.configured_model, row.step).toBe(configuredFor(row.step));
      expect(row.configured_model, row.step).not.toBe("");
      if (row.step === "script" || row.step.startsWith("scene:")) expect(row.model, row.step).toBe("stub");
    }
  });
});
