import { ReleaseManifestSchema, ReleasePageSchema, manifestFiles } from "@storybook/dsl";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { type Db, getDb } from "../db/client";
import { newId } from "../db/ids";
import { commitHead } from "../db/heads";
import { insertRevisions, saveHumanRevision } from "../db/revisions";
import { asset, assetVersion, release, story } from "../db/schema";
import { movePointer, publishStory } from "./publish";
import { SCENE_ASSET_VERSIONS, seedPublishableStory, testScene } from "./test/fixtures";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await env.BUCKET.list({ prefix, cursor });
    keys.push(...page.objects.map((o) => o.key));
    if (!page.truncated) return keys.sort();
    cursor = page.cursor;
  }
}

async function sha256Of(key: string): Promise<string> {
  const obj = await env.BUCKET.get(key);
  if (!obj) throw new Error(`missing ${key}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await obj.arrayBuffer()));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashes(prefix: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const key of await listKeys(prefix)) out[key] = await sha256Of(key);
  return out;
}

async function readJson(key: string): Promise<unknown> {
  const obj = await env.BUCKET.get(key);
  if (!obj) throw new Error(`missing ${key}`);
  return obj.json();
}

async function storyRow(db: Db, storyId: string) {
  const [s] = await db.select().from(story).where(eq(story.id, storyId));
  return s!;
}

async function releaseRows(db: Db, storyId: string) {
  return db.select().from(release).where(eq(release.storyId, storyId));
}

// An env whose `BUCKET.put` records each key, and runs `onFirstPut` once
// before the first write.
function recordingEnv(onFirstPut?: () => Promise<void>) {
  const keys: string[] = [];
  let first = true;
  const bucket = new Proxy(env.BUCKET, {
    get(target, prop) {
      if (prop === "put") {
        return async (...args: Parameters<R2Bucket["put"]>) => {
          if (first) {
            first = false;
            await onFirstPut?.();
          }
          keys.push(args[0]);
          return target.put(...args);
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { env: { ...env, BUCKET: bucket } as Env, keys };
}

// The blocked tests compare the `releases/` keys before and after, because
// other tests in this file write releases to the same bucket.
async function expectBlocked(opts: Parameters<typeof seedPublishableStory>[1], expected: object[]) {
  const db = getDb(env.DB);
  const seeded = await seedPublishableStory(env, opts);
  const before = await listKeys("releases/");
  const result = await publishStory(env, seeded.storyId);
  expect(result).toEqual({ ok: false, reason: "blocked", blocking: expected });
  expect(await listKeys("releases/")).toEqual(before);
  expect(await releaseRows(db, seeded.storyId)).toEqual([]);
  expect((await storyRow(db, seeded.storyId)).publishedReleaseId).toBeNull();
  return seeded;
}

describe("publishStory: block rules", () => {
  it("publish blocks a missing audio", async () => {
    const seeded = await seedPublishableStory(env, { missingAudioPage: 2 });
    const before = await listKeys("releases/");
    const result = await publishStory(env, seeded.storyId);
    expect(result).toEqual({
      ok: false,
      reason: "blocked",
      blocking: [{ pageId: seeded.pageIds[1], page: 2, target: "audio", reason: "missing", message: "page 2: missing audio" }],
    });
    expect(await listKeys("releases/")).toEqual(before);
    expect(await releaseRows(getDb(env.DB), seeded.storyId)).toEqual([]);
  });

  it("PUB-02.S3 publish blocks a needs_review scene", async () => {
    const seeded = await seedPublishableStory(env, { needsReviewScenePage: 1 });
    const result = await publishStory(env, seeded.storyId);
    expect(result).toEqual({
      ok: false,
      reason: "blocked",
      blocking: [{ pageId: seeded.pageIds[0], page: 1, target: "scene", reason: "needs_review", message: "page 1: needs_review scene" }],
    });
  });

  it("PUB-02.S5 publish blocks a stale scene", async () => {
    const seeded = await seedPublishableStory(env, { staleScenePage: 1 });
    const result = await publishStory(env, seeded.storyId);
    expect(result).toEqual({
      ok: false,
      reason: "blocked",
      blocking: [{ pageId: seeded.pageIds[0], page: 1, target: "scene", reason: "stale", message: "page 1: stale scene" }],
    });
  });

  it("publish blocks a missing text, a missing scene, and a stale audio", async () => {
    // Without a text head, the scene and audio of page 1 are stale too: their
    // basis names a `page_text` key that is no longer the head.
    await expectBlocked({ pages: 3, missingTextPage: 1, missingScenePage: 2, staleAudioPage: 3 }, [
      expect.objectContaining({ page: 1, target: "page_text", reason: "missing", message: "page 1: missing text" }),
      expect.objectContaining({ page: 1, target: "scene", reason: "stale", message: "page 1: stale scene" }),
      expect.objectContaining({ page: 1, target: "audio", reason: "stale", message: "page 1: stale audio" }),
      expect.objectContaining({ page: 2, target: "scene", reason: "missing", message: "page 2: missing scene" }),
      expect.objectContaining({ page: 3, target: "audio", reason: "stale", message: "page 3: stale audio" }),
    ]);
  });

  it("publish blocks a story with no outline", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const s = await storyRow(db, seeded.storyId);
    const { outline: _, ...heads } = s.heads;
    await db.update(story).set({ heads }).where(eq(story.id, seeded.storyId));
    const result = await publishStory(env, seeded.storyId);
    expect(result).toEqual({
      ok: false,
      reason: "blocked",
      blocking: [{ pageId: null, page: null, target: "outline", reason: "missing", message: "missing outline" }],
    });
  });

  it("publish of an unknown story returns not_found", async () => {
    expect(await publishStory(env, newId())).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("publishStory: releases", () => {
  it("PUB-01.S1 publish writes a release under a new prefix, a release row, and the pointer", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const result = await publishStory(env, seeded.storyId);
    if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
    const root = `releases/${result.releaseId}/`;
    expect(result.manifestKey).toBe(`${root}manifest.json`);
    const keys = await listKeys(root);
    expect(keys).toContain(`${root}manifest.json`);
    for (const pageId of seeded.pageIds) {
      expect(keys).toContain(`${root}pages/${pageId}.json`);
      expect(keys).toContain(`${root}audio/${pageId}.wav`);
    }
    for (const [key, version] of Object.entries(SCENE_ASSET_VERSIONS)) {
      expect(keys.some((k) => k.startsWith(`${root}assets/${key}/v${version}/`))).toBe(true);
    }
    const rows = await releaseRows(db, seeded.storyId);
    expect(rows.map((r) => r.id)).toEqual([result.releaseId]);
    expect((await storyRow(db, seeded.storyId)).publishedReleaseId).toBe(result.releaseId);
  });

  it("PUB-01.S2 publish builds the release from one snapshot of the heads", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const before = await storyRow(db, seeded.storyId);
    const page1 = seeded.pageIds[0]!;
    const { env: rec } = recordingEnv(async () => {
      const saved = await saveHumanRevision(db, {
        storyId: seeded.storyId,
        kind: "page_text",
        pageId: page1,
        content: { text: "Text from an edit during publish." },
        basis: { outline: seeded.outlineId },
        basedOn: seeded.text[page1]!,
      });
      if (saved.status !== "moved") throw new Error("edit did not move the head");
    });
    const result = await publishStory(rec, seeded.storyId);
    if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
    const page = ReleasePageSchema.parse(await readJson(`releases/${result.releaseId}/pages/${page1}.json`));
    expect(page.text).toBe("Page 1 text.");
    const [row] = await db.select().from(release).where(eq(release.id, result.releaseId));
    expect(row!.snapshot.headsVersion).toBe(before.headsVersion);
    expect(row!.snapshot.heads).toEqual(before.heads);
  });

  it("PUB-01.S3 release contents", async () => {
    const seeded = await seedPublishableStory(env, { pages: 3 });
    const result = await publishStory(env, seeded.storyId);
    if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
    const root = `releases/${result.releaseId}/`;
    const keys = new Set(await listKeys(root));
    const manifest = ReleaseManifestSchema.parse(await readJson(`${root}manifest.json`));
    expect(manifest.pages.map((p) => p.pageId)).toEqual(seeded.pageIds);
    for (const entry of manifest.pages) {
      expect(keys.has(root + entry.json)).toBe(true);
      const page = ReleasePageSchema.parse(await readJson(root + entry.json));
      expect(keys.has(root + page.audio)).toBe(true);
      for (const a of Object.values(page.assets)) {
        for (const file of manifestFiles(a.manifest)) expect(keys.has(root + a.base + file)).toBe(true);
      }
      for (const t of page.scene.interactions) {
        for (const action of t.do) if (action.action === "play_sfx") expect(page.assets[action.sfx]).toBeDefined();
      }
    }
  });

  it("PUB-01.S4 publish twice", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const first = await publishStory(env, seeded.storyId);
    if (!first.ok) throw new Error(`publish failed: ${JSON.stringify(first)}`);
    const prefix1 = `releases/${first.releaseId}/`;
    const before = await hashes(prefix1);
    const second = await publishStory(env, seeded.storyId);
    if (!second.ok) throw new Error(`publish failed: ${JSON.stringify(second)}`);
    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
    expect(second.releaseId).not.toBe(first.releaseId);
    const after = await hashes(prefix1);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(after).toEqual(before);
    const s = await storyRow(db, seeded.storyId);
    expect(s.publishedReleaseId).toBe(second.releaseId);
    expect(s.status).toBe("published");
  });

  it("PUB-01.S5 manifest is written last", async () => {
    const seeded = await seedPublishableStory(env);
    const { env: rec, keys } = recordingEnv();
    const result = await publishStory(rec, seeded.storyId);
    expect(result.ok).toBe(true);
    expect(keys.length).toBeGreaterThan(1);
    expect(keys.at(-1)).toMatch(/\/manifest\.json$/);
    expect(keys.filter((k) => k.endsWith("/manifest.json"))).toHaveLength(1);
    const lastIndex = (match: (k: string) => boolean) => keys.reduce((last, k, i) => (match(k) ? i : last), -1);
    const lastPage = lastIndex((k) => k.includes("/pages/"));
    const firstPage = keys.findIndex((k) => k.includes("/pages/"));
    const lastCopy = lastIndex((k) => k.includes("/assets/") || k.includes("/audio/"));
    expect(lastCopy).toBeLessThan(firstPage);
    expect(lastPage).toBeLessThan(keys.length - 1);
  });

  it("a lost number race returns conflict and writes no release row", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const competitorId = newId();
    const { env: rec } = recordingEnv(async () => {
      await db.insert(release).values({
        id: competitorId,
        storyId: seeded.storyId,
        number: 1,
        title: "Competitor",
        manifestKey: `releases/${competitorId}/manifest.json`,
        snapshot: { heads: {}, headsVersion: 0 },
        createdAt: new Date().toISOString(),
      });
    });
    const result = await publishStory(rec, seeded.storyId);
    expect(result).toEqual({ ok: false, reason: "conflict" });
    const rows = await releaseRows(db, seeded.storyId);
    expect(rows.map((r) => r.id)).toEqual([competitorId]);
    const s = await storyRow(db, seeded.storyId);
    expect(s.publishedReleaseId).toBeNull();
    expect(s.status).toBe("draft");
  });

  it("pointer never moves back", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const first = await publishStory(env, seeded.storyId);
    const second = await publishStory(env, seeded.storyId);
    if (!first.ok || !second.ok) throw new Error("publish failed");
    expect(await movePointer(db, seeded.storyId, first.releaseId)).toBe(false);
    expect((await storyRow(db, seeded.storyId)).publishedReleaseId).toBe(second.releaseId);
  });

  it("movePointer ignores a release of another story", async () => {
    const db = getDb(env.DB);
    const a = await seedPublishableStory(env);
    const b = await seedPublishableStory(env);
    const c = await seedPublishableStory(env);
    const releaseA = await publishStory(env, a.storyId);
    const releaseB = await publishStory(env, b.storyId);
    if (!releaseA.ok || !releaseB.ok) throw new Error("publish failed");
    // A published story, and a story with no pointer yet.
    expect(await movePointer(db, a.storyId, releaseB.releaseId)).toBe(false);
    expect((await storyRow(db, a.storyId)).publishedReleaseId).toBe(releaseA.releaseId);
    expect(await movePointer(db, c.storyId, releaseB.releaseId)).toBe(false);
    const sc = await storyRow(db, c.storyId);
    expect(sc.publishedReleaseId).toBeNull();
    expect(sc.status).toBe("draft");
  });

  it("publish blocks an outline with no pages", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const emptyId = newId();
    await insertRevisions(db, [
      {
        id: emptyId,
        storyId: seeded.storyId,
        kind: "outline",
        origin: "human",
        callId: null,
        status: "ok",
        basis: {},
        content: { title: "Empty", ageBand: "5-7", cast: ["test-bear"], pages: [] },
      },
    ]);
    const moved = await commitHead(db, { storyId: seeded.storyId, moves: { outline: emptyId }, basis: {}, expected: { outline: seeded.outlineId } });
    expect(moved).toBe("moved");
    const before = await listKeys("releases/");
    expect(await publishStory(env, seeded.storyId)).toEqual({
      ok: false,
      reason: "blocked",
      blocking: [{ pageId: null, page: null, target: "outline", reason: "missing", message: "outline has no pages" }],
    });
    expect(await listKeys("releases/")).toEqual(before);
    expect(await releaseRows(db, seeded.storyId)).toEqual([]);
  });

  it("PUB-01.S6 a release has a UUID v7 id, a prefix without the story id, and a unique number per story", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const result = await publishStory(env, seeded.storyId);
    if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
    expect(result.releaseId).toMatch(UUID_V7);
    const keys = await listKeys(`releases/${result.releaseId}/`);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).not.toContain(seeded.storyId);
    const [row] = await db.select().from(release).where(eq(release.id, result.releaseId));
    expect(row!.storyId).toBe(seeded.storyId);
    await expect(
      env.DB.prepare(
        "INSERT INTO release (id, story_id, number, title, manifest_key, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(newId(), seeded.storyId, result.number, "x", "x", "{}", new Date().toISOString())
        .run(),
    ).rejects.toThrow("UNIQUE constraint failed: release.story_id, release.number");
  });

  it("PUB-01.S11 the release row keeps the title of the manifest", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const result = await publishStory(env, seeded.storyId);
    if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
    const manifest = ReleaseManifestSchema.parse(await readJson(`releases/${result.releaseId}/manifest.json`));
    const [row] = await db.select().from(release).where(eq(release.id, result.releaseId));
    expect(row!.title).toBe(manifest.title);
    expect(row!.title).toBe("The Little Test");
  });

  it("PUB-01.S7 manifest and page JSON carry the format fields, relative paths, final positions, and assets", async () => {
    const seeded = await seedPublishableStory(env);
    const result = await publishStory(env, seeded.storyId);
    if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
    const root = `releases/${result.releaseId}/`;
    const manifest = (await readJson(`${root}manifest.json`)) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      format: "storybook-mvp",
      formatVersion: 1,
      storyId: seeded.storyId,
      releaseId: result.releaseId,
      number: 1,
      title: "The Little Test",
    });
    const pages = manifest.pages as Array<{ pageId: string; json: string }>;
    for (const p of pages) {
      expect(p.json.startsWith("/")).toBe(false);
      expect(p.json.startsWith("releases/")).toBe(false);
      const page = (await readJson(root + p.json)) as Record<string, any>;
      expect(page.pageId).toBe(p.pageId);
      expect(typeof page.text).toBe("string");
      expect(page.audio).toBe(`audio/${p.pageId}.wav`);
      for (const layer of page.scene.layers) expect(layer.at).toBeDefined();
      for (const layer of page.scene.layers) expect(page.assets[layer.ref]).toBeDefined();
      expect(page.assets["test-pop"]).toMatchObject({ renderer: "audio", base: "assets/test-pop/v1/" });
      expect(page.assets["test-bear"]).toMatchObject({ renderer: "webp", base: "assets/test-bear/v1/" });
    }
  });

  it("publish fails before any D1 write when a file that a manifest names is missing", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const key = "assets/test-ball/v1/default.webp";
    const saved = await env.BUCKET.get(key);
    const bytes = await saved!.arrayBuffer();
    await env.BUCKET.delete(key);
    try {
      await expect(publishStory(env, seeded.storyId)).rejects.toThrow(key);
    } finally {
      await env.BUCKET.put(key, bytes);
    }
    expect(await releaseRows(db, seeded.storyId)).toEqual([]);
    const s = await storyRow(db, seeded.storyId);
    expect(s.publishedReleaseId).toBeNull();
    expect(s.status).toBe("draft");
  });

  it("publish copies only the files that a manifest names", async () => {
    const seeded = await seedPublishableStory(env);
    const extra = "assets/test-ball/v1/not-in-manifest.webp";
    await env.BUCKET.put(extra, new Uint8Array([7]));
    try {
      const result = await publishStory(env, seeded.storyId);
      if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
      const keys = await listKeys(`releases/${result.releaseId}/assets/test-ball/v1/`);
      expect(keys).toEqual([`releases/${result.releaseId}/assets/test-ball/v1/default.webp`]);
    } finally {
      await env.BUCKET.delete(extra);
    }
  });

  it("publish rejects an asset prefix without a trailing slash", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const [ball] = await db.select().from(asset).where(eq(asset.key, "test-ball"));
    const where = and(eq(assetVersion.assetId, ball!.id), eq(assetVersion.version, 1));
    await db.update(assetVersion).set({ r2Prefix: "assets/test-ball/v1" }).where(where);
    try {
      await expect(publishStory(env, seeded.storyId)).rejects.toThrow("assets/test-ball/v1");
    } finally {
      await db.update(assetVersion).set({ r2Prefix: "assets/test-ball/v1/" }).where(where);
    }
    expect(await releaseRows(db, seeded.storyId)).toEqual([]);
  });

  it("REG-01.S4 a new asset version leaves release 1 with its copy of the old version", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const first = await publishStory(env, seeded.storyId);
    if (!first.ok) throw new Error(`publish failed: ${JSON.stringify(first)}`);
    const bearV1 = `releases/${first.releaseId}/assets/test-bear/v1/`;
    const before = await hashes(bearV1);
    expect(Object.keys(before).length).toBeGreaterThan(0);

    // Version 2 of test-bear, with new bytes, becomes the active version.
    const [bear] = await db.select().from(asset).where(eq(asset.key, "test-bear"));
    const [v1] = await db
      .select()
      .from(assetVersion)
      .where(and(eq(assetVersion.assetId, bear!.id), eq(assetVersion.version, 1)));
    await db.update(assetVersion).set({ active: false }).where(eq(assetVersion.assetId, bear!.id));
    await db
      .insert(assetVersion)
      .values({ ...v1!, id: newId(), version: 2, r2Prefix: "assets/test-bear/v2/", active: true, createdAt: new Date().toISOString() })
      .onConflictDoNothing();
    for (const file of manifestFiles(v1!.manifest)) await env.BUCKET.put(`assets/test-bear/v2/${file}`, new Uint8Array([9, 9, 9, 9]));

    const page1 = seeded.pageIds[0]!;
    const saved = await saveHumanRevision(db, {
      storyId: seeded.storyId,
      kind: "scene",
      pageId: page1,
      content: testScene(),
      basis: { [`page_text:${page1}`]: seeded.text[page1]! },
      assetVersions: { ...SCENE_ASSET_VERSIONS, "test-bear": 2 },
      basedOn: seeded.scene[page1]!,
    });
    expect(saved.status).toBe("moved");
    const second = await publishStory(env, seeded.storyId);
    if (!second.ok) throw new Error(`publish failed: ${JSON.stringify(second)}`);

    expect(await hashes(bearV1)).toEqual(before);
    const page = ReleasePageSchema.parse(await readJson(`releases/${first.releaseId}/pages/${page1}.json`));
    expect(page.assets["test-bear"]!.base).toBe("assets/test-bear/v1/");
    const page2 = ReleasePageSchema.parse(await readJson(`releases/${second.releaseId}/pages/${page1}.json`));
    expect(page2.assets["test-bear"]!.base).toBe("assets/test-bear/v2/");
  });

  it("PUB-01.S10 a release holds the backdrop of each page", async () => {
    const db = getDb(env.DB);
    const seeded = await seedPublishableStory(env);
    const [page1, page2] = [seeded.pageIds[0]!, seeded.pageIds[1]!];
    const saved = await saveHumanRevision(db, {
      storyId: seeded.storyId,
      kind: "scene",
      pageId: page2,
      content: { ...testScene(), backdrop: "riverbank" },
      basis: { [`page_text:${page2}`]: seeded.text[page2]! },
      assetVersions: { ...SCENE_ASSET_VERSIONS, riverbank: 1 },
      basedOn: seeded.scene[page2]!,
    });
    expect(saved.status).toBe("moved");
    const result = await publishStory(env, seeded.storyId);
    if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
    const root = `releases/${result.releaseId}/`;

    // The whole version: also `day` and `cloudy`, which no page uses (pages use `sky: "night"`).
    const meadow = ["cloudy.svg", "day.svg", "dusk.svg", "night.svg"].map((f) => `${root}assets/meadow/v1/${f}`);
    expect(await listKeys(`${root}assets/meadow/v1/`)).toEqual(meadow);
    const riverbank = ["day.webp", "dusk.webp", "night.webp"].map((f) => `${root}assets/riverbank/v1/${f}`);
    expect(await listKeys(`${root}assets/riverbank/v1/`)).toEqual(riverbank);

    const p1 = ReleasePageSchema.parse(await readJson(`${root}pages/${page1}.json`));
    expect(p1.scene.backdrop).toBe("meadow");
    expect(p1.assets).toHaveProperty("meadow");
    expect(p1.assets).not.toHaveProperty("riverbank");
    const p2 = ReleasePageSchema.parse(await readJson(`${root}pages/${page2}.json`));
    expect(p2.scene.backdrop).toBe("riverbank");
    expect(p2.assets).toHaveProperty("riverbank");
  });
});
