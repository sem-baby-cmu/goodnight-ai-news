import { eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { type RevisionRow, type RunError, type RunScope, type SourceContent, type StoryRow, revision, run, story } from "./schema";

// One batch: the story (heads = { source }), the source revision, and a full
// run. All three or none; the order follows the foreign keys.
export async function createStory(
  db: Db,
  input: { storyId: string; sourceRevisionId: string; runId: string; source: SourceContent },
): Promise<void> {
  const createdAt = new Date().toISOString();
  await db.batch([
    db.insert(story).values({
      id: input.storyId,
      title: null,
      status: "draft",
      heads: { source: input.sourceRevisionId },
      headsVersion: 0,
      createdAt,
    }),
    db.insert(revision).values({
      id: input.sourceRevisionId,
      storyId: input.storyId,
      kind: "source",
      pageId: "",
      content: input.source,
      basis: {},
      origin: "human",
      callId: null,
      status: "ok",
      createdAt,
    }),
    db.insert(run).values({
      id: input.runId,
      storyId: input.storyId,
      scope: { kind: "full" },
      status: "queued",
      workflowInstanceId: input.runId,
      createdAt,
    }),
  ]);
}

export async function insertRun(db: Db, input: { runId: string; storyId: string; scope: RunScope }): Promise<void> {
  await db.insert(run).values({
    id: input.runId,
    storyId: input.storyId,
    scope: input.scope,
    status: "queued",
    workflowInstanceId: input.runId,
    createdAt: new Date().toISOString(),
  });
}

export async function markRunFailed(db: Db, runId: string, error: RunError): Promise<void> {
  await db.update(run).set({ status: "failed", error, finishedAt: new Date().toISOString() }).where(eq(run.id, runId));
}

// The story row and the revisions that its heads point at (at most 26).
export async function loadStoryHeads(
  db: Db,
  storyId: string,
): Promise<{ story: StoryRow; revisions: Map<string, RevisionRow> } | null> {
  const [row] = await db.select().from(story).where(eq(story.id, storyId));
  if (!row) return null;
  const ids = [...new Set(Object.values(row.heads).filter((id): id is string => id !== undefined))];
  const revisions = new Map<string, RevisionRow>();
  if (ids.length > 0) {
    for (const r of await db.select().from(revision).where(inArray(revision.id, ids))) revisions.set(r.id, r);
  }
  return { story: row, revisions };
}
