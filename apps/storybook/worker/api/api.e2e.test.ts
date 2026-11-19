import { introspectWorkflow } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { RegistrySnapshot } from "@storybook/dsl";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type HeadKey, getDb, loadActiveRegistry, revision } from "../db";
import { seedRegistry } from "../test/fixtures";
import { type FaultContext, seams } from "../workflow/seams";
import { type StubModel, type StubPlan, createStubModel } from "../workflow/stub-model";
import { app } from "./app";
import {
  CreateStoryResponseSchema,
  ErrorSchema,
  PublishBlockedSchema,
  ReleaseCreatedSchema,
  RevisionResponseSchema,
  RunResponseSchema,
  StartRunResponseSchema,
  StoryDetailResponseSchema,
} from "./schemas";

// End to end: the routes start the real StoryRun Workflow, with the stub
// model behind `seams` (implementation decision R12b).

const db = () => getDb(env.DB);

const DEFAULT_SEAMS = { ...seams };
afterEach(() => {
  Object.assign(seams, DEFAULT_SEAMS);
  vi.restoreAllMocks();
});

type Introspector = Awaited<ReturnType<typeof introspectWorkflow>>;

async function useStub(plan?: (registry: RegistrySnapshot) => StubPlan): Promise<StubModel> {
  await seedRegistry(env);
  const registry = await loadActiveRegistry(db());
  const stub = createStubModel({ registry, ...(plan ? { plan: plan(registry) } : {}) });
  seams.modelClient = () => stub.client;
  return stub;
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit =
    body === undefined ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  return await app.request(path, init, env);
}

// Waits until every instance that the introspector saw is complete.
async function settle(wf: Introspector): Promise<void> {
  for (const instance of await wf.get()) await instance.waitForStatus("complete");
}

const ARTICLE = Array.from({ length: 250 }, (_, i) => `word${i}`).join(" ");

async function startStory(wf: Introspector) {
  const res = await request("POST", "/api/studio/stories", { text: ARTICLE });
  expect(res.status).toBe(202);
  const created = CreateStoryResponseSchema.parse(await res.json());
  await settle(wf);
  return created;
}

async function getStory(storyId: string) {
  const res = await request("GET", `/api/studio/stories/${storyId}`);
  expect(res.status).toBe(200);
  return StoryDetailResponseSchema.parse(await res.json());
}

async function getRun(runId: string) {
  const res = await request("GET", `/api/studio/runs/${runId}`);
  expect(res.status).toBe(200);
  return RunResponseSchema.parse(await res.json());
}

async function startPageRun(storyId: string, pageId: string, target: "scene" | "audio") {
  const res = await request("POST", `/api/studio/stories/${storyId}/runs`, { scope: { kind: "page", pageId, target } });
  expect(res.status).toBe(202);
  return StartRunResponseSchema.parse(await res.json()).runId;
}

async function introspect(): Promise<Introspector> {
  const wf = await introspectWorkflow(env.STORY_RUN);
  await wf.modifyAll(async (m) => {
    await m.disableRetryDelays();
  });
  return wf;
}

const FINAL = ["draft_ready", "needs_review", "failed"];

describe("Studio API end to end", () => {
  it("PUB-02.S1 TTS fails for page 5, then publish", { timeout: 30_000 }, async () => {
    await useStub(() => ({ "audio:5": () => ({ error: Object.assign(new Error("provider status 503"), { status: 503 }) }) }));
    await using wf = await introspect();
    const { storyId } = await startStory(wf);
    const story = await getStory(storyId);
    expect(story.pages[4]!.audio).toBeNull();

    const res = await request("POST", `/api/studio/stories/${storyId}/releases`);
    expect(res.status).toBe(409);
    const body = PublishBlockedSchema.parse(await res.json());
    expect(body.blocking).toContainEqual({
      pageId: story.pages[4]!.pageId,
      page: 5,
      target: "audio",
      reason: "missing",
      message: "page 5: missing audio",
    });
  });

  it("PUB-02.S6 stale scene, still fits, then publish", { timeout: 30_000 }, async () => {
    await useStub();
    await using wf = await introspect();
    const { storyId } = await startStory(wf);
    const first = await getStory(storyId);
    const p2 = first.pages[1]!;
    const aiScene = p2.scene!;
    expect(aiScene.origin).toBe("ai");

    const put = await request("PUT", `/api/studio/stories/${storyId}/pages/${p2.pageId}/text`, {
      text: "Page 2. The bunny tells the news again.",
      basedOn: p2.text!.id,
    });
    expect(put.status).toBe(200);
    const newText = RevisionResponseSchema.parse(await put.json()).revision.id;

    // The text change also made the page 2 audio stale; "regenerate audio"
    // (a page run) clears it, so one stale scene is the only blocking reason.
    await startPageRun(storyId, p2.pageId, "audio");
    await settle(wf);
    const stale = (await getStory(storyId)).pages[1]!;
    expect(stale.state).toBe("stale");
    expect(stale.problems).toEqual([{ target: "scene", reason: "stale" }]);
    expect((await getStory(storyId)).pages.filter((p) => p.state !== "ok").map((p) => p.pageId)).toEqual([p2.pageId]);

    const fits = await request("POST", `/api/studio/stories/${storyId}/pages/${p2.pageId}/scene/still-fits`, {
      basedOn: aiScene.id,
      textBasedOn: newText,
    });
    expect(fits.status).toBe(200);
    const copy = RevisionResponseSchema.parse(await fits.json()).revision;
    expect((await getStory(storyId)).pages[1]!.state).toBe("ok");

    const res = await request("POST", `/api/studio/stories/${storyId}/releases`);
    expect(res.status).toBe(201);
    const release = ReleaseCreatedSchema.parse(await res.json());
    expect(release.manifestUrl).toBe(`/content/releases/${release.releaseId}/manifest.json`);
    expect(release.playerUrl).toBe(`/read/${release.releaseId}`);

    const after = await getStory(storyId);
    expect(after.heads[`scene:${p2.pageId}` as HeadKey]).toBe(copy.id);
    const [row] = await db().select().from(revision).where(eq(revision.id, copy.id));
    expect(row!.origin).toBe("human");
    expect(row!.callId).toBeNull();
    expect(row!.content).toEqual(aiScene.content);
  });

  it("page run starts and finishes", { timeout: 30_000 }, async () => {
    await useStub();
    await using wf = await introspect();
    const { storyId } = await startStory(wf);
    const p1 = (await getStory(storyId)).pages[0]!.pageId;
    const runId = await startPageRun(storyId, p1, "audio");
    await settle(wf);
    const body = await getRun(runId);
    expect(body.run.status).toBe("draft_ready");
    expect(body.steps).toEqual([{ step: `audio:${p1}`, state: "done" }]);
  });

  it("EDT-03.S1 POST runs with a scene scope runs only freeze, the scene step of that page, and finish", { timeout: 30_000 }, async () => {
    const stub = await useStub();
    await using wf = await introspect();
    const { storyId } = await startStory(wf);
    const before = await getStory(storyId);
    const attemptsBefore = { ...stub.attempts };
    const p3 = before.pages[2]!.pageId;

    const runId = await startPageRun(storyId, p3, "scene");
    await settle(wf);

    const body = await getRun(runId);
    expect(FINAL).toContain(body.run.status);
    expect(body.steps).toEqual([{ step: `scene:${p3}`, state: "done" }]);
    const gained = Object.keys(stub.attempts).filter((k) => stub.attempts[k] !== attemptsBefore[k]);
    expect(gained).toEqual(["scene:3"]);
    expect(stub.attempts["scene:3"]! - attemptsBefore["scene:3"]!).toBe(1);
    const after = await getStory(storyId);
    const keys = [...new Set([...Object.keys(before.heads), ...Object.keys(after.heads)])];
    expect(keys.filter((k) => before.heads[k] !== after.heads[k])).toEqual([`scene:${p3}`]);
  });

  // Amendment R61: a page run is refused while a run of the story is queued
  // or running. The full run is held at `before_model_call` on page 1 while
  // the page run request is made.
  it("RUN-05.S12 a page run is refused with run_active while a full run is running", { timeout: 30_000 }, async () => {
    await useStub();
    let held: { status: number; body: unknown; runId: string } | undefined;
    seams.at = async (point: string, ctx: FaultContext) => {
      if (held || point !== "before_model_call" || !ctx.step.startsWith("scene:")) return;
      const story = await getStory(ctx.storyId);
      if (story.pages[0]!.pageId !== ctx.pageId) return;
      const res = await request("POST", `/api/studio/stories/${ctx.storyId}/runs`, {
        scope: { kind: "page", pageId: story.pages[4]!.pageId, target: "audio" },
      });
      held = { status: res.status, body: await res.json(), runId: ctx.runId };
    };
    await using wf = await introspect();
    const { storyId, runId } = await startStory(wf);

    expect(held).toBeDefined();
    expect(held!.runId).toBe(runId);
    expect(held!.status).toBe(409);
    expect(ErrorSchema.parse(held!.body)).toEqual({ error: "run_active", runId });

    const p5 = (await getStory(storyId)).pages[4]!.pageId;
    const pageRun = await startPageRun(storyId, p5, "audio");
    await settle(wf);
    expect(FINAL).toContain((await getRun(pageRun)).run.status);
  });
});
