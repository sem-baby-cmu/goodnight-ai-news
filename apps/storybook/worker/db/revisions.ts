import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "./client";
import { commitHead } from "./heads";
import { headKey, newId } from "./ids";
import { type Heads, type NewRevision, revision, story } from "./schema";

const rowKey = (callId: string, kind: string, pageId: string) => JSON.stringify([callId, kind, pageId]);

// Inserts revisions in one batch, one row per statement (D1 allows at most
// 100 bound parameters per statement). A row with a call ID that is already
// stored is a no-op, and its stored ID is returned. Returns the stored IDs in
// the order of `rows`.
export async function insertRevisions(db: Db, rows: NewRevision[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const createdAt = new Date().toISOString();
  const full = rows.map((r) => ({ ...r, id: r.id ?? newId(), pageId: r.pageId ?? "", createdAt: r.createdAt ?? createdAt }));
  const inserts: BatchItem<"sqlite">[] = full.map((r) =>
    r.callId
      ? db
          .insert(revision)
          .values(r)
          .onConflictDoNothing({ target: [revision.callId, revision.kind, revision.pageId] })
      : db.insert(revision).values(r),
  );
  const callIds = [...new Set(full.flatMap((r) => (r.callId ? [r.callId] : [])))];
  if (callIds.length > 100) throw new Error("insertRevisions: more than 100 call IDs in one batch");
  if (callIds.length === 0) {
    await db.batch(inserts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    return full.map((r) => r.id);
  }
  const select = db
    .select({ id: revision.id, callId: revision.callId, kind: revision.kind, pageId: revision.pageId })
    .from(revision)
    .where(inArray(revision.callId, callIds));
  const results = await db.batch([...inserts, select] as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  const stored = results[results.length - 1] as Array<{ id: string; callId: string | null; kind: string; pageId: string }>;
  const byKey = new Map(stored.map((s) => [rowKey(s.callId!, s.kind, s.pageId), s.id]));
  return full.map((r) => {
    if (!r.callId) return r.id;
    const id = byKey.get(rowKey(r.callId, r.kind, r.pageId));
    if (!id) throw new Error("revision row not found after insert");
    return id;
  });
}

// An operator's edit: a new human revision, then a head move that expects the
// head to still be `basedOn`.
export async function saveHumanRevision(
  db: Db,
  input: {
    storyId: string;
    kind: "page_text" | "scene";
    pageId: string;
    content: unknown;
    basis: Heads;
    assetVersions?: Record<string, number>;
    basedOn: string | null;
  },
): Promise<{ status: "moved"; revisionId: string } | { status: "superseded"; revisionId: string; currentId: string | null }> {
  const id = newId();
  await insertRevisions(db, [
    {
      id,
      storyId: input.storyId,
      kind: input.kind,
      pageId: input.pageId,
      content: input.content,
      basis: input.basis,
      assetVersions: input.assetVersions ?? null,
      origin: "human",
      callId: null,
      status: "ok",
    },
  ]);
  const key = headKey(input.kind, input.pageId);
  const result = await commitHead(db, {
    storyId: input.storyId,
    moves: { [key]: id },
    basis: input.basis,
    expected: { [key]: input.basedOn },
  });
  if (result === "moved") return { status: "moved", revisionId: id };
  const [row] = await db.select({ heads: story.heads }).from(story).where(eq(story.id, input.storyId));
  return { status: "superseded", revisionId: id, currentId: row?.heads[key] ?? null };
}
