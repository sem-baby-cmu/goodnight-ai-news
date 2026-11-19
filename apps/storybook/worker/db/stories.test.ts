import { env } from "cloudflare:workers";
import { AssetManifestSchema } from "@storybook/dsl";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { SOURCE, newStory, seedRegistry } from "../test/fixtures";
import { getDb } from "./client";
import { newId } from "./ids";
import { loadActiveRegistry } from "./registry";
import { revision, run, story } from "./schema";
import { createStory, insertRun, loadStoryHeads, markRunFailed } from "./stories";

describe("stories", () => {
  it("RUN-01.S1 createStory: one batch writes story, source revision, and run", async () => {
    const db = getDb(env.DB);
    const { storyId, sourceRevisionId, runId } = await newStory(db);

    const [s] = await db.select().from(story).where(eq(story.id, storyId));
    expect(s).toMatchObject({ status: "draft", title: null, heads: { source: sourceRevisionId }, headsVersion: 0 });

    const [src] = await db.select().from(revision).where(eq(revision.id, sourceRevisionId));
    expect(src).toMatchObject({
      storyId,
      kind: "source",
      pageId: "",
      origin: "human",
      callId: null,
      status: "ok",
      basis: {},
      content: SOURCE,
    });

    const [r] = await db.select().from(run).where(eq(run.id, runId));
    expect(r).toMatchObject({ storyId, status: "queued", scope: { kind: "full" }, workflowInstanceId: runId });
  });

  it("createStory: a failing batch writes nothing", async () => {
    const db = getDb(env.DB);
    const first = await newStory(db);
    const storyId = newId();
    const sourceRevisionId = newId();
    // Same run ID: the last statement of the batch fails on the primary key.
    await expect(createStory(db, { storyId, sourceRevisionId, runId: first.runId, source: SOURCE })).rejects.toThrow();
    expect(await db.select().from(story).where(eq(story.id, storyId))).toEqual([]);
    expect(await db.select().from(revision).where(eq(revision.id, sourceRevisionId))).toEqual([]);
  });

  it("insertRun and markRunFailed", async () => {
    const db = getDb(env.DB);
    const { storyId } = await newStory(db);
    const runId = newId();
    await insertRun(db, { runId, storyId, scope: { kind: "page", pageId: newId(), target: "scene" } });
    const [queued] = await db.select().from(run).where(eq(run.id, runId));
    expect(queued).toMatchObject({ status: "queued", workflowInstanceId: runId, finishedAt: null });

    const error = { errors: [{ runId, storyId, pageId: null, step: "script", providerStatus: 400, message: "bad request" }] };
    await markRunFailed(db, runId, error);
    const [failed] = await db.select().from(run).where(eq(run.id, runId));
    expect(failed).toMatchObject({ status: "failed", error });
    expect(failed!.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("loadStoryHeads returns the story and its head revisions", async () => {
    const db = getDb(env.DB);
    const { storyId, sourceRevisionId } = await newStory(db);
    const loaded = await loadStoryHeads(db, storyId);
    expect(loaded?.story.id).toBe(storyId);
    expect([...loaded!.revisions.keys()]).toEqual([sourceRevisionId]);
    expect(loaded!.revisions.get(sourceRevisionId)?.kind).toBe("source");
    expect(await loadStoryHeads(db, newId())).toBeNull();
  });

  it("loadActiveRegistry maps active versions to a RegistrySnapshot", async () => {
    await seedRegistry(env);
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    for (const key of ["test-bear", "test-bunny", "test-ball", "test-tree", "test-pop"]) {
      const a = registry.assets[key];
      expect(a, key).toBeDefined();
      expect(a!.version).toBe(1);
      expect(AssetManifestSchema.safeParse(a!.manifest).success).toBe(true);
    }
    expect(registry.assets["test-bear"]).toMatchObject({ kind: "character", renderer: "webp" });
    expect(registry.assets["test-pop"]).toMatchObject({ kind: "sfx", renderer: "audio" });
    expect(await env.BUCKET.head("assets/test-bear/v1/stand-happy.webp")).not.toBeNull();
    expect(await env.BUCKET.head("assets/test-pop/v1/pop.mp3")).not.toBeNull();
  });
});
