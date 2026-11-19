import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newCall, newStory } from "../test/fixtures";
import { type Db, getDb } from "./client";
import { HeadCasExhaustedError, commitHead } from "./heads";
import { newId } from "./ids";
import { insertRevisions, saveHumanRevision } from "./revisions";
import { type Heads, type RevisionKind, revision, story } from "./schema";

async function readStory(db: Db, storyId: string) {
  const [s] = await db.select().from(story).where(eq(story.id, storyId));
  return s!;
}

async function statusOf(db: Db, id: string) {
  const [r] = await db.select({ status: revision.status }).from(revision).where(eq(revision.id, id));
  return r!.status;
}

// One AI revision of `kind` for `pageId`, with its own call.
async function aiRevision(db: Db, ids: { storyId: string; runId: string }, kind: RevisionKind, basis: Heads, pageId = "") {
  const callId = await newCall(db, ids.runId, kind, pageId);
  const [id] = await insertRevisions(db, [
    { storyId: ids.storyId, kind, pageId, origin: "ai", callId, status: "ok", basis, content: { kind } },
  ]);
  return id!;
}

describe("commitHead", () => {
  it("commitHead: moves the head and bumps heads_version", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const outline = await aiRevision(db, ids, "outline", basis);
    expect(await commitHead(db, { storyId: ids.storyId, moves: { outline }, basis })).toBe("moved");
    const s = await readStory(db, ids.storyId);
    expect(s.heads).toEqual({ source: ids.sourceRevisionId, outline });
    expect(s.headsVersion).toBe(1);
    expect(await statusOf(db, outline)).toBe("ok");
  });

  it("commitHead: basis mismatch marks the revision superseded and keeps the head", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const outline = await aiRevision(db, ids, "outline", { source: ids.sourceRevisionId });
    const result = await commitHead(db, { storyId: ids.storyId, moves: { outline }, basis: { source: newId() } });
    expect(result).toBe("superseded");
    const s = await readStory(db, ids.storyId);
    expect(s.heads).toEqual({ source: ids.sourceRevisionId });
    expect(s.headsVersion).toBe(0);
    expect(await statusOf(db, outline)).toBe("superseded");
  });

  it("commitHead: expected mismatch marks the revision superseded", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const first = await aiRevision(db, ids, "outline", basis);
    await commitHead(db, { storyId: ids.storyId, moves: { outline: first }, basis });
    const second = await aiRevision(db, ids, "outline", basis);
    // `null`: the key must have no head, but it has one.
    const result = await commitHead(db, { storyId: ids.storyId, moves: { outline: second }, basis, expected: { outline: null } });
    expect(result).toBe("superseded");
    expect((await readStory(db, ids.storyId)).heads.outline).toBe(first);
    expect(await statusOf(db, second)).toBe("superseded");
    expect(await statusOf(db, first)).toBe("ok");
  });

  it("commitHead: a retry after the head moved returns moved and writes nothing", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const outline = await aiRevision(db, ids, "outline", basis);
    const input = { storyId: ids.storyId, moves: { outline }, basis };
    expect(await commitHead(db, input)).toBe("moved");
    // The basis no longer matches: the source head moves.
    const newSource = newId();
    await insertRevisions(db, [
      { id: newSource, storyId: ids.storyId, kind: "source", origin: "human", callId: null, status: "ok", basis: {}, content: {} },
    ]);
    expect(await commitHead(db, { storyId: ids.storyId, moves: { source: newSource }, basis: {} })).toBe("moved");
    const before = await readStory(db, ids.storyId);

    expect(await commitHead(db, input)).toBe("moved");
    const after = await readStory(db, ids.storyId);
    expect(after.headsVersion).toBe(before.headsVersion);
    expect(after.heads).toEqual(before.heads);
    expect(await statusOf(db, outline)).toBe("ok");
  });

  it("commitHead: a retry never overwrites a newer head", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const [p1, p2] = [newId(), newId()];
    const callId = await newCall(db, ids.runId, "script");
    const row = { storyId: ids.storyId, origin: "ai" as const, callId, status: "ok" as const, basis };
    const [outline, t1, t2] = await insertRevisions(db, [
      { ...row, kind: "outline", content: {} },
      { ...row, kind: "page_text", pageId: p1, content: { text: "One." } },
      { ...row, kind: "page_text", pageId: p2, content: { text: "Two." } },
    ]);
    const script = {
      storyId: ids.storyId,
      moves: { outline: outline!, [`page_text:${p1}`]: t1!, [`page_text:${p2}`]: t2! } as Heads,
      basis,
    };
    expect(await commitHead(db, script)).toBe("moved");

    const human = await saveHumanRevision(db, {
      storyId: ids.storyId,
      kind: "page_text",
      pageId: p2,
      content: { text: "Two, by the operator." },
      basis: { outline: outline! },
      basedOn: t2!,
    });
    expect(human.status).toBe("moved");

    expect(await commitHead(db, script)).toBe("moved");
    const s = await readStory(db, ids.storyId);
    expect(s.heads[`page_text:${p2}`]).toBe(human.revisionId);
    expect(s.heads[`page_text:${p1}`]).toBe(t1);
    expect(await statusOf(db, t2!)).toBe("ok");
  });

  it("saveHumanRevision: a stale basedOn gives superseded with the current head", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const pageId = newId();
    const input = { storyId: ids.storyId, kind: "page_text" as const, pageId, content: { text: "A." }, basis: {} };
    const a = await saveHumanRevision(db, { ...input, basedOn: null });
    expect(a.status).toBe("moved");
    const b = await saveHumanRevision(db, { ...input, content: { text: "B." }, basedOn: null });
    expect(b).toEqual({ status: "superseded", revisionId: b.revisionId, currentId: a.revisionId });
    expect(await statusOf(db, b.revisionId)).toBe("superseded");
  });

  it("SYS-02.S2 commitHead: four concurrent commits to different keys all land", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const pages = [newId(), newId(), newId(), newId()];
    const revs = await Promise.all(pages.map((p) => aiRevision(db, ids, "scene", basis, p)));
    const results = await Promise.all(
      pages.map((p, i) => commitHead(db, { storyId: ids.storyId, moves: { [`scene:${p}`]: revs[i]! } as Heads, basis })),
    );
    expect(results).toEqual(["moved", "moved", "moved", "moved"]);
    const s = await readStory(db, ids.storyId);
    expect(s.headsVersion).toBe(4);
    for (const [i, p] of pages.entries()) expect(s.heads[`scene:${p}`]).toBe(revs[i]);
  });

  it("SYS-02.S3 commitHead: throws HeadCasExhaustedError after 5 lost races", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const outline = await aiRevision(db, ids, "outline", basis);
    let calls = 0;
    const beforeUpdate = async () => {
      calls++;
      await env.DB.prepare("UPDATE story SET heads_version = heads_version + 1 WHERE id = ?").bind(ids.storyId).run();
    };
    await expect(commitHead(db, { storyId: ids.storyId, moves: { outline }, basis }, { beforeUpdate })).rejects.toBeInstanceOf(
      HeadCasExhaustedError,
    );
    expect(calls).toBe(5);
    expect((await readStory(db, ids.storyId)).heads.outline).toBeUndefined();
  });

  it("commitHead: unknown story throws", async () => {
    await expect(commitHead(getDb(env.DB), { storyId: newId(), moves: { outline: newId() }, basis: {} })).rejects.toThrow(
      "story not found",
    );
  });
});
