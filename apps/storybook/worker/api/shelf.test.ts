import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Db, getDb, newId, release, story } from "../db";
import { publishStory } from "../publish/publish";
import { seedPublishableStory } from "../publish/test/fixtures";
import { newStory } from "../test/fixtures";
import { app } from "./app";
import { type ShelfResponse, ShelfResponseSchema } from "./schemas";

// Other tests can write stories to the same database. So each test keeps
// only the entries whose `releaseId` it seeded, and the log calls whose
// `storyId` it seeded.

type Book = ShelfResponse["books"][number];

const db = (): Db => getDb(env.DB);

afterEach(() => {
  vi.restoreAllMocks();
});

const shelf = (method = "GET", e: Env = env) => Promise.resolve(app.request("http://localhost/api/shelf", { method }, e));

async function shelfBooks(): Promise<Book[]> {
  const res = await shelf();
  expect(res.status).toBe(200);
  return ((await res.json()) as ShelfResponse).books;
}

const only = (books: Book[], releaseIds: string[]) => books.filter((b) => releaseIds.includes(b.releaseId));

async function readJson(key: string): Promise<unknown> {
  const obj = await env.BUCKET.get(key);
  if (!obj) throw new Error(`missing ${key}`);
  return obj.json();
}

// A story from `seedPublishableStory`, published once. Returns the release ID.
async function published(): Promise<{ storyId: string; releaseId: string }> {
  const seeded = await seedPublishableStory(env);
  const result = await publishStory(env, seeded.storyId);
  if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
  return { storyId: seeded.storyId, releaseId: result.releaseId };
}

// A release row with an explicit time and title. It does not move the pointer.
async function addRelease(storyId: string, number: number, createdAt: string, title = "A Book"): Promise<string> {
  const id = newId();
  await db()
    .insert(release)
    .values({
      id,
      storyId,
      number,
      title,
      manifestKey: `releases/${id}/manifest.json`,
      snapshot: { heads: {}, headsVersion: 0 },
      createdAt,
    });
  return id;
}

async function point(storyId: string, releaseId: string): Promise<void> {
  await env.DB.prepare("UPDATE story SET published_release_id = ?, status = 'published' WHERE id = ?")
    .bind(releaseId, storyId)
    .run();
}

// The `console.error` calls whose JSON names `storyId`.
function logsOf(spy: { mock: { calls: unknown[][] } }, storyId: string): string[] {
  return spy.mock.calls
    .map((call) => String(call[0]))
    .filter((text) => {
      try {
        return (JSON.parse(text) as { storyId?: unknown }).storyId === storyId;
      } catch {
        return false;
      }
    });
}

describe("GET /api/shelf", () => {
  it("PUB-03.S1 the shelf lists the latest release of each published story", async () => {
    const a = await published();
    const b = await published();
    const draft = await newStory(db());
    await db().update(story).set({ title: "Draft Only Title" }).where(eq(story.id, draft.storyId));

    const res = await shelf();
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as unknown;
    ShelfResponseSchema.parse(body);
    const all = (body as ShelfResponse).books;
    const books = only(all, [a.releaseId, b.releaseId]);
    expect(books).toHaveLength(2);

    for (const s of [a, b]) {
      const [row] = await db().select({ pointer: story.publishedReleaseId }).from(story).where(eq(story.id, s.storyId));
      expect(row!.pointer).toBe(s.releaseId);
      const [rel] = await db().select({ createdAt: release.createdAt }).from(release).where(eq(release.id, s.releaseId));
      const manifest = (await readJson(`releases/${s.releaseId}/manifest.json`)) as { title: string };
      const entry = books.find((x) => x.releaseId === s.releaseId);
      expect(entry).toBeDefined();
      expect(entry!.title).toBe(manifest.title);
      expect(entry!.publishedAt).toBe(rel!.createdAt);
    }
    expect(text).not.toContain(draft.storyId);
    expect(text).not.toContain("Draft Only Title");
  });

  it("PUB-03.S2 an entry has three fields only", async () => {
    const seeded = await seedPublishableStory(env);
    const result = await publishStory(env, seeded.storyId);
    if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);

    const res = await shelf();
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as ShelfResponse;
    expect(Object.keys(body)).toEqual(["books"]);
    const [entry] = only(body.books, [result.releaseId]);
    expect(entry).toBeDefined();
    expect(Object.keys(entry!).sort()).toEqual(["publishedAt", "releaseId", "title"]);
    expect(text).not.toContain(seeded.storyId);
    expect(text).not.toContain(seeded.outlineId);
  });

  it("PUB-03.S3 the newest story is first", async () => {
    const a = await newStory(db());
    const b = await newStory(db());
    const relA = await addRelease(a.storyId, 1, "2026-11-19T08:00:00.000Z");
    const relB = await addRelease(b.storyId, 1, "2026-11-19T09:00:00.000Z");
    await point(a.storyId, relA);
    await point(b.storyId, relB);

    const books = only(await shelfBooks(), [relA, relB]);
    expect(books.map((x) => x.releaseId)).toEqual([relB, relA]);
  });

  it("PUB-03.S4 a new release keeps the place of its book", async () => {
    const a = await newStory(db());
    const b = await newStory(db());
    const t1 = "2026-11-19T08:00:00.000Z";
    const t2 = "2026-11-19T09:00:00.000Z";
    const t3 = "2026-11-19T10:00:00.000Z";
    const a1 = await addRelease(a.storyId, 1, t1);
    const b1 = await addRelease(b.storyId, 1, t2);
    const a2 = await addRelease(a.storyId, 2, t3);
    await point(a.storyId, a2);
    await point(b.storyId, b1);

    const all = await shelfBooks();
    const books = only(all, [a1, a2, b1]);
    expect(books.map((x) => x.releaseId)).toEqual([b1, a2]);
    expect(books[1]!.publishedAt).toBe(t3);
    expect(all.map((x) => x.releaseId)).not.toContain(a1);
  });

  it("PUB-03.S5 a failed publish is not on the shelf", async () => {
    const seeded = await seedPublishableStory(env);
    const manifests: string[] = [];
    const bucket = new Proxy(env.BUCKET, {
      get(target, prop) {
        if (prop === "put") {
          return async (...args: Parameters<R2Bucket["put"]>) => {
            if (args[0].endsWith("/manifest.json")) manifests.push(args[0]);
            return target.put(...args);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    // The batch that writes the release row and the pointer fails.
    const d1 = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "batch") {
          return async () => {
            throw new Error("d1 down");
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(publishStory({ ...env, BUCKET: bucket, DB: d1 } as Env, seeded.storyId)).rejects.toThrow("d1 down");

    expect(manifests).toHaveLength(1);
    const failedId = manifests[0]!.split("/")[1]!;
    expect(await env.BUCKET.get(`releases/${failedId}/manifest.json`)).not.toBeNull();
    expect(await db().select().from(release).where(eq(release.storyId, seeded.storyId))).toEqual([]);
    const [row] = await db().select({ pointer: story.publishedReleaseId }).from(story).where(eq(story.id, seeded.storyId));
    expect(row!.pointer).toBeNull();

    expect((await shelfBooks()).map((x) => x.releaseId)).not.toContain(failedId);
  });

  it("PUB-03.S7 the shelf response is not stored", async () => {
    await published();
    const res = await shelf();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("PUB-03.S8 a database failure gives 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      prepare: () => {
        throw new Error("d1 down");
      },
    } as unknown as D1Database;
    const res = await app.request("http://localhost/api/shelf", {}, { ...env, DB: failing });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });

  it("PUB-03.S9 the shelf route is read-only", async () => {
    const s = await published();
    const before = {
      story: await db().select().from(story).where(eq(story.id, s.storyId)),
      release: await db().select().from(release).where(eq(release.storyId, s.storyId)),
    };
    const res = await shelf("POST");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    const after = {
      story: await db().select().from(story).where(eq(story.id, s.storyId)),
      release: await db().select().from(release).where(eq(release.storyId, s.storyId)),
    };
    expect(after).toEqual(before);
  });

  it("PUB-03.S10 stories with the same first release time are in descending story ID order", async () => {
    const x = await newStory(db());
    const y = await newStory(db());
    const [a, b] = x.storyId < y.storyId ? [x, y] : [y, x];
    const at = "2026-11-19T08:00:00.000Z";
    const relA = await addRelease(a.storyId, 1, at);
    const relB = await addRelease(b.storyId, 1, at);
    await point(a.storyId, relA);
    await point(b.storyId, relB);

    const books = only(await shelfBooks(), [relA, relB]);
    expect(books.map((r) => r.releaseId)).toEqual([relB, relA]);
  });

  it("PUB-03.S11 a pointer to a missing release gives no entry", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = await newStory(db());
    const b = await newStory(db());
    const relA = await addRelease(a.storyId, 1, "2026-11-19T08:00:00.000Z", "Sound Book Title");
    await point(a.storyId, relA);
    const pointer = newId();
    await point(b.storyId, pointer);
    await db().update(story).set({ title: "Secret Draft Title" }).where(eq(story.id, b.storyId));

    const res = await shelf();
    expect(res.status).toBe(200);
    const text = await res.text();
    const all = (JSON.parse(text) as ShelfResponse).books;
    expect(only(all, [relA, pointer]).map((x) => x.releaseId)).toEqual([relA]);
    expect(text).not.toContain("Secret Draft Title");

    const lines = logsOf(logs, b.storyId);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({ event: "shelf_skipped", storyId: b.storyId, releaseId: pointer, reason: "missing_release" });
    const logged = logs.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
    expect(logged).not.toContain("Secret Draft Title");
    expect(logged).not.toContain("Sound Book Title");
  });

  it("PUB-03.S12 a pointer to a release of another story gives no entry", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = await newStory(db());
    const b = await newStory(db());
    const relA = await addRelease(a.storyId, 1, "2026-11-19T08:00:00.000Z", "Title Of Book A");
    await point(a.storyId, relA);
    await point(b.storyId, relA);

    const books = only(await shelfBooks(), [relA]);
    expect(books).toHaveLength(1);
    expect(books[0]!.releaseId).toBe(relA);

    const lines = logsOf(logs, b.storyId);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({ event: "shelf_skipped", storyId: b.storyId, releaseId: relA, reason: "wrong_story" });
    expect(lines[0]).not.toContain("Title Of Book A");
  });
});
