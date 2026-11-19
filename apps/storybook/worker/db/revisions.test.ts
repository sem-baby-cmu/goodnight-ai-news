import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newCall, newStory } from "../test/fixtures";
import { getDb } from "./client";
import { newId } from "./ids";
import { insertRevisions } from "./revisions";
import { type NewRevision, revision } from "./schema";

describe("revisions", () => {
  it("SYS-02.S1 insertRevisions: a retried insert returns the original id and adds no row", async () => {
    const db = getDb(env.DB);
    const { storyId, runId, sourceRevisionId } = await newStory(db);
    const callId = await newCall(db, runId, "script");
    const row = { storyId, kind: "outline" as const, origin: "ai" as const, callId, status: "ok" as const, basis: { source: sourceRevisionId } };
    const [first] = await insertRevisions(db, [{ ...row, content: { title: "first" } }]);
    const retryId = newId();
    const [second] = await insertRevisions(db, [{ ...row, id: retryId, content: { title: "retry" } }]);
    expect(second).toBe(first);
    const rows = await db.select().from(revision).where(eq(revision.callId, callId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toEqual({ title: "first" });
    expect(await db.select().from(revision).where(eq(revision.id, retryId))).toEqual([]);
  });

  it("insertRevisions: nine rows in one call", async () => {
    const db = getDb(env.DB);
    const { storyId, runId, sourceRevisionId } = await newStory(db);
    const callId = await newCall(db, runId, "script");
    const basis = { source: sourceRevisionId };
    const pages = Array.from({ length: 8 }, () => newId());
    const rows: NewRevision[] = [
      { storyId, kind: "outline" as const, origin: "ai" as const, callId, status: "ok" as const, basis, content: {} },
      ...pages.map((pageId) => ({
        storyId,
        kind: "page_text" as const,
        pageId,
        origin: "ai" as const,
        callId,
        status: "ok" as const,
        basis,
        content: { text: "Text." },
      })),
    ];
    const ids = await insertRevisions(db, rows);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
    const stored = await db.select().from(revision).where(eq(revision.callId, callId));
    expect(stored).toHaveLength(9);
    // Same order as the input.
    for (const [i, id] of ids.entries()) {
      const s = stored.find((r) => r.id === id)!;
      expect(s.kind).toBe(rows[i]!.kind);
      expect(s.pageId).toBe(rows[i]!.pageId ?? "");
    }
    // A retry of the whole call returns the same IDs and adds nothing.
    expect(await insertRevisions(db, rows.map((r) => ({ ...r, id: newId() })))).toEqual(ids);
    expect(await db.select().from(revision).where(eq(revision.callId, callId))).toHaveLength(9);
  });

  it("insertRevisions: human rows with null call_id never conflict", async () => {
    const db = getDb(env.DB);
    const { storyId } = await newStory(db);
    const pageId = newId();
    const row = { storyId, kind: "page_text" as const, pageId, origin: "human" as const, callId: null, status: "ok" as const, basis: {} };
    const a = await insertRevisions(db, [{ ...row, content: { text: "A." } }]);
    const b = await insertRevisions(db, [{ ...row, content: { text: "B." } }]);
    expect(a[0]).not.toBe(b[0]);
    const stored = await db.select().from(revision).where(eq(revision.pageId, pageId));
    expect(stored).toHaveLength(2);
  });
});
