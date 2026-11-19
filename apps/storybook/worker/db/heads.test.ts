import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newCall, newStory } from "../test/fixtures";
import { getCall, putCall } from "./calls";
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
    expect(await commitHead(db, { storyId: ids.storyId, moves: { outline }, basis, expected: { outline: null } })).toBe("moved");
    const s = await readStory(db, ids.storyId);
    expect(s.heads).toEqual({ source: ids.sourceRevisionId, outline });
    expect(s.headsVersion).toBe(1);
    expect(await statusOf(db, outline)).toBe("ok");
  });

  it("commitHead: basis mismatch marks the revision superseded and keeps the head", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const outline = await aiRevision(db, ids, "outline", { source: ids.sourceRevisionId });
    const result = await commitHead(db, { storyId: ids.storyId, moves: { outline }, basis: { source: newId() }, expected: { outline: null } });
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
    await commitHead(db, { storyId: ids.storyId, moves: { outline: first }, basis, expected: { outline: null } });
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
    const input = { storyId: ids.storyId, moves: { outline }, basis, expected: { outline: null } };
    expect(await commitHead(db, input)).toBe("moved");
    // The basis no longer matches: the source head moves.
    const newSource = newId();
    await insertRevisions(db, [
      { id: newSource, storyId: ids.storyId, kind: "source", origin: "human", callId: null, status: "ok", basis: {}, content: {} },
    ]);
    expect(
      await commitHead(db, { storyId: ids.storyId, moves: { source: newSource }, basis: {}, expected: { source: ids.sourceRevisionId } }),
    ).toBe("moved");
    const before = await readStory(db, ids.storyId);

    expect(await commitHead(db, input)).toBe("moved");
    const after = await readStory(db, ids.storyId);
    expect(after.headsVersion).toBe(before.headsVersion);
    expect(after.heads).toEqual(before.heads);
    expect(await statusOf(db, outline)).toBe("ok");
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

  // R58: UUID v7 order is not creation order across isolates, so the test
  // IDs are chosen so that the newer revision has the smaller ID.
  async function reversedPair(db: Db, ids: { storyId: string; runId: string }, basis: Heads) {
    // Real v7 IDs with the first 8 hex digits replaced: `older` sorts last.
    const older = `ffffffff${newId().slice(8)}`;
    const newer = `00000000${newId().slice(8)}`;
    const row = { storyId: ids.storyId, kind: "outline" as const, origin: "ai" as const, status: "ok" as const, basis, content: {} };
    await insertRevisions(db, [
      { ...row, id: older, callId: await newCall(db, ids.runId, "outline") },
      { ...row, id: newer, callId: await newCall(db, ids.runId, "outline") },
    ]);
    return { older, newer };
  }

  it("commitHead: a newer revision with a smaller ID replaces the older head", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const { older, newer } = await reversedPair(db, ids, basis);
    expect(await commitHead(db, { storyId: ids.storyId, moves: { outline: older }, basis, expected: { outline: null } })).toBe("moved");
    // The newer step read the head after the older one moved it.
    expect(await commitHead(db, { storyId: ids.storyId, moves: { outline: newer }, basis, expected: { outline: older } })).toBe("moved");
    const s = await readStory(db, ids.storyId);
    expect(s.heads.outline).toBe(newer);
    expect(s.headsVersion).toBe(2);
    expect(await statusOf(db, newer)).toBe("ok");
  });

  it("commitHead: a late older revision with a greater ID is superseded and the newer head stays", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const { older, newer } = await reversedPair(db, ids, basis);
    // Both steps read the head as null. The newer one commits first.
    expect(await commitHead(db, { storyId: ids.storyId, moves: { outline: newer }, basis, expected: { outline: null } })).toBe("moved");
    expect(await commitHead(db, { storyId: ids.storyId, moves: { outline: older }, basis, expected: { outline: null } })).toBe(
      "superseded",
    );
    const s = await readStory(db, ids.storyId);
    expect(s.heads.outline).toBe(newer);
    expect(s.headsVersion).toBe(1);
    expect(await statusOf(db, older)).toBe("superseded");
    expect(await statusOf(db, newer)).toBe("ok");
  });

  it("saveHumanRevision: two saves on the same basedOn give one moved and one superseded", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const pageId = newId();
    const input = { storyId: ids.storyId, kind: "page_text" as const, pageId, basis: {} };
    const t0 = await saveHumanRevision(db, { ...input, content: { text: "T0." }, basedOn: null });
    expect(t0.status).toBe("moved");
    const results = await Promise.all([
      saveHumanRevision(db, { ...input, content: { text: "A." }, basedOn: t0.revisionId }),
      saveHumanRevision(db, { ...input, content: { text: "B." }, basedOn: t0.revisionId }),
    ]);
    const moved = results.filter((r) => r.status === "moved");
    const lost = results.filter((r) => r.status === "superseded");
    expect(moved).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toEqual({ status: "superseded", revisionId: lost[0]!.revisionId, currentId: moved[0]!.revisionId });
    expect((await readStory(db, ids.storyId)).heads[`page_text:${pageId}`]).toBe(moved[0]!.revisionId);
    expect(await statusOf(db, lost[0]!.revisionId)).toBe("superseded");
  });

  it("commitHead: an AI commit whose stored expected head is null loses to a human save on that key", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const pageId = newId();
    const key = `page_text:${pageId}` as const;
    const basis = { source: ids.sourceRevisionId };
    // The step reads its basis and expected heads, then the model runs.
    const callId = newId();
    await putCall(db, {
      callId,
      runId: ids.runId,
      step: "script",
      pageId: "",
      purpose: "first",
      result: { ok: true },
      basis,
      expectedHeads: { [key]: null },
      model: "test-model",
      createdAt: new Date().toISOString(),
    });
    const human = await saveHumanRevision(db, {
      storyId: ids.storyId,
      kind: "page_text",
      pageId,
      content: { text: "By the operator." },
      basis: {},
      basedOn: null,
    });
    expect(human.status).toBe("moved");
    const [ai] = await insertRevisions(db, [
      { storyId: ids.storyId, kind: "page_text", pageId, origin: "ai", callId, status: "ok", basis, content: { text: "By the model." } },
    ]);
    const stored = (await getCall(db, callId))!;
    const result = await commitHead(db, { storyId: ids.storyId, moves: { [key]: ai! }, basis: stored.basis, expected: stored.expectedHeads });
    expect(result).toBe("superseded");
    expect((await readStory(db, ids.storyId)).heads[key]).toBe(human.revisionId);
    expect(await statusOf(db, ai!)).toBe("superseded");
  });

  it("commitHead: expected must name every moved key", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const outline = await aiRevision(db, ids, "outline", basis);
    await expect(commitHead(db, { storyId: ids.storyId, moves: { outline }, basis, expected: {} })).rejects.toThrow(
      "expected must name every moved key",
    );
    expect((await readStory(db, ids.storyId)).headsVersion).toBe(0);
  });

  it("SYS-02.S2 commitHead: four concurrent commits to different keys all land", async () => {
    const db = getDb(env.DB);
    const ids = await newStory(db);
    const basis = { source: ids.sourceRevisionId };
    const pages = [newId(), newId(), newId(), newId()];
    const revs = await Promise.all(pages.map((p) => aiRevision(db, ids, "scene", basis, p)));
    const results = await Promise.all(
      pages.map((p, i) =>
        commitHead(db, { storyId: ids.storyId, moves: { [`scene:${p}`]: revs[i]! } as Heads, basis, expected: { [`scene:${p}`]: null } }),
      ),
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
    await expect(
      commitHead(db, { storyId: ids.storyId, moves: { outline }, basis, expected: { outline: null } }, { beforeUpdate }),
    ).rejects.toBeInstanceOf(
      HeadCasExhaustedError,
    );
    expect(calls).toBe(5);
    expect((await readStory(db, ids.storyId)).heads.outline).toBeUndefined();
  });

  it("commitHead: unknown story throws", async () => {
    await expect(commitHead(getDb(env.DB), { storyId: newId(), moves: { outline: newId() }, basis: {}, expected: { outline: null } })).rejects.toThrow(
      "story not found",
    );
  });
});
