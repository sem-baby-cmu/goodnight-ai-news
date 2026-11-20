import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Db, getDb, newId, release, story } from "../db";
import { publishStory } from "../publish/publish";
import { seedPublishableStory } from "../publish/test/fixtures";
import { newStory } from "../test/fixtures";
import { app } from "./app";
import { StoryDetailResponseSchema, StoryListResponseSchema } from "./schemas";

// POST /api/studio/stories/:id/withdrawal (ADR 0017 decision 20). Other tests
// can write to the same database and bucket, so each test reads only the
// rows, objects, and log calls of the story that it seeded.

const db = (): Db => getDb(env.DB);

afterEach(() => {
  vi.restoreAllMocks();
});

function call(method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit =
    body === undefined ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  return Promise.resolve(app.request(`http://localhost${path}`, init, env));
}

const withdraw = (storyId: string, body: unknown) => call("POST", `/api/studio/stories/${storyId}/withdrawal`, body);

async function publish(storyId: string): Promise<string> {
  const result = await publishStory(env, storyId);
  if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
  return result.releaseId;
}

// A story with releases 1 and 2; the pointer names release 2.
async function twoReleases(): Promise<{ storyId: string; r1: string; r2: string }> {
  const seeded = await seedPublishableStory(env);
  const r1 = await publish(seeded.storyId);
  const r2 = await publish(seeded.storyId);
  return { storyId: seeded.storyId, r1, r2 };
}

async function storyRow(storyId: string) {
  const [row] = await db().select().from(story).where(eq(story.id, storyId));
  if (!row) throw new Error(`no story ${storyId}`);
  return row;
}

async function objects(releaseId: string): Promise<Array<{ key: string; etag: string }>> {
  const listed = await env.BUCKET.list({ prefix: `releases/${releaseId}/` });
  return listed.objects.map((o) => ({ key: o.key, etag: o.etag })).sort((a, b) => a.key.localeCompare(b.key));
}

// The `console.log` calls whose JSON names `storyId`.
function logsOf(spy: { mock: { calls: unknown[][] } }, storyId: string): string[] {
  return spy.mock.calls
    .map((c) => String(c[0]))
    .filter((text) => {
      try {
        return (JSON.parse(text) as { storyId?: unknown }).storyId === storyId;
      } catch {
        return false;
      }
    });
}

describe("POST /api/studio/stories/:id/withdrawal", () => {
  it("PUB-04.S1 a take-off records the number of the published release", async () => {
    const s = await twoReleases();
    expect((await storyRow(s.storyId)).withdrawnThrough).toBe(0);

    const res = await withdraw(s.storyId, { releaseId: s.r2 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ storyId: s.storyId, releaseId: s.r2, withdrawnThrough: 2 });
    expect((await storyRow(s.storyId)).withdrawnThrough).toBe(2);
  });

  it("PUB-04.S4 a take-off changes no release", async () => {
    const s = await twoReleases();
    const releases = () => db().select().from(release).where(eq(release.storyId, s.storyId)).orderBy(release.number);
    const before = { releases: await releases(), r1: await objects(s.r1), r2: await objects(s.r2), story: await storyRow(s.storyId) };
    expect(before.releases).toHaveLength(2);
    expect(before.r1.length).toBeGreaterThan(0);
    expect(before.r2.length).toBeGreaterThan(0);

    const res = await withdraw(s.storyId, { releaseId: s.r2 });
    expect(res.status).toBe(200);

    expect(await releases()).toEqual(before.releases);
    expect(await objects(s.r1)).toEqual(before.r1);
    expect(await objects(s.r2)).toEqual(before.r2);
    const after = await storyRow(s.storyId);
    expect(after.withdrawnThrough).toBe(2);
    expect({ ...after, withdrawnThrough: 0 }).toEqual(before.story);
    expect(after.publishedReleaseId).toBe(s.r2);
    expect(after.status).toBe("published");
    expect(after.heads).toEqual(before.story.heads);
    expect(after.headsVersion).toBe(before.story.headsVersion);
  });

  it("PUB-04.S5 the same take-off again changes nothing", async () => {
    const s = await twoReleases();
    const first = await withdraw(s.storyId, { releaseId: s.r2 });
    const second = await withdraw(s.storyId, { releaseId: s.r2 });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = await first.json();
    expect(await second.json()).toEqual(a);
    expect(a).toEqual({ storyId: s.storyId, releaseId: s.r2, withdrawnThrough: 2 });
    expect((await storyRow(s.storyId)).withdrawnThrough).toBe(2);
  });

  it("PUB-04.S6 a take-off of a release that is not the published one is refused", async () => {
    const s = await twoReleases();
    const res = await withdraw(s.storyId, { releaseId: s.r1 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "release_moved", current: s.r2 });
    expect((await storyRow(s.storyId)).withdrawnThrough).toBe(0);

    const shelf = await call("GET", "/api/shelf");
    expect(shelf.status).toBe(200);
    const books = ((await shelf.json()) as { books: Array<{ releaseId: string }> }).books;
    expect(books.filter((b) => [s.r1, s.r2].includes(b.releaseId)).map((b) => b.releaseId)).toEqual([s.r2]);
  });

  it("PUB-04.S7 a take-off of a story with no release is refused", async () => {
    const draft = await newStory(db());
    const before = await storyRow(draft.storyId);
    const res = await withdraw(draft.storyId, { releaseId: newId() });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_published" });
    expect(await storyRow(draft.storyId)).toEqual(before);
  });

  it("PUB-04.S8 a take-off of an unknown story gives 404", async () => {
    const res = await withdraw(newId(), { releaseId: newId() });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("PUB-04.S9 a take-off with a bad body gives 400", async () => {
    const seeded = await seedPublishableStory(env);
    await publish(seeded.storyId);
    const before = await storyRow(seeded.storyId);
    for (const bad of [{}, { releaseId: "x" }]) {
      const res = await withdraw(seeded.storyId, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      const body = (await res.json()) as { error: string; issues: unknown[] };
      expect(body.error).toBe("bad_request");
      expect(body.issues.length).toBeGreaterThan(0);
    }
    expect(await storyRow(seeded.storyId)).toEqual(before);
  });

  it("PUB-04.S11 a take-off writes one log line with no title", async () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    const s = await twoReleases();
    const manifest = (await (await env.BUCKET.get(`releases/${s.r2}/manifest.json`))!.json()) as { title: string };
    expect(manifest.title.length).toBeGreaterThan(0);

    const res = await withdraw(s.storyId, { releaseId: s.r2 });
    expect(res.status).toBe(200);

    const lines = logsOf(logs, s.storyId);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({ event: "withdrawal", storyId: s.storyId, releaseId: s.r2, number: 2 });
    expect(lines[0]).not.toContain(manifest.title);
  });

  it("PUB-04.S12 the Studio routes say what is on the shelf", async () => {
    const s = await twoReleases();
    expect((await withdraw(s.storyId, { releaseId: s.r2 })).status).toBe(200);
    const r3 = await publish(s.storyId);
    expect((await storyRow(s.storyId)).withdrawnThrough).toBe(2);
    const draft = await newStory(db());

    const list = await call("GET", "/api/studio/stories");
    expect(list.status).toBe(200);
    const listed = StoryListResponseSchema.parse(await list.json());
    const item = listed.stories.find((x) => x.id === s.storyId);
    expect(item).toMatchObject({ publishedReleaseId: r3, onShelf: true, publishedReleaseNumber: 3 });
    const draftItem = listed.stories.find((x) => x.id === draft.storyId);
    expect(draftItem).toMatchObject({ publishedReleaseId: null, onShelf: false, publishedReleaseNumber: null });

    const detail = await call("GET", `/api/studio/stories/${s.storyId}`);
    expect(detail.status).toBe(200);
    const body = StoryDetailResponseSchema.parse(await detail.json());
    expect(body.story.onShelf).toBe(true);
    expect(body.releases.map((r) => [r.id, r.number, r.withdrawn])).toEqual([
      [s.r1, 1, true],
      [s.r2, 2, true],
      [r3, 3, false],
    ]);
  });
});
