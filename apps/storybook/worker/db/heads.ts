import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "./client";
import { type HeadKey, type Heads, revision, story } from "./schema";

export class HeadCasExhaustedError extends Error {
  constructor(storyId: string, attempts: number) {
    super(`heads of story ${storyId} did not move after ${attempts} attempts`);
    this.name = "HeadCasExhaustedError";
  }
}

// Moves heads by compare-and-set on `heads_version` (design "3. Calls,
// revisions, and heads"; implementation decision R56 for the order).
//
// Per attempt:
// 1. Read `heads` and `heads_version`.
// 2. `pending` = the keys of `moves` whose head is neither the target nor a
//    newer revision (a greater UUID v7). None pending: "moved", no write.
// 3. A `basis` or `expected` entry does not match: mark the revisions of the
//    pending keys superseded, move nothing, return "superseded".
// 4. Write `heads` with only the pending keys, where `heads_version` is
//    still the value read. One changed row wins; zero rows: try again.
//
// "moved" means every key now holds its target or a newer revision.
export async function commitHead(
  db: Db,
  input: { storyId: string; moves: Heads; basis: Heads; expected?: Partial<Record<HeadKey, string | null>> },
  opts?: { maxAttempts?: number; beforeUpdate?: () => Promise<void> },
): Promise<"moved" | "superseded"> {
  const maxAttempts = opts?.maxAttempts ?? 5;
  const moveKeys = Object.keys(input.moves) as HeadKey[];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const [row] = await db
      .select({ heads: story.heads, headsVersion: story.headsVersion })
      .from(story)
      .where(eq(story.id, input.storyId));
    if (!row) throw new Error("story not found");
    const heads = row.heads;

    const pending = moveKeys.filter((key) => {
      const target = input.moves[key]!;
      const current = heads[key];
      return current !== target && !(current !== undefined && current > target);
    });
    if (pending.length === 0) return "moved";

    const basisMoved = (Object.keys(input.basis) as HeadKey[]).some((key) => heads[key] !== input.basis[key]);
    const expectedMoved = (Object.keys(input.expected ?? {}) as HeadKey[]).some(
      (key) => (heads[key] ?? null) !== input.expected![key],
    );
    if (basisMoved || expectedMoved) {
      await db
        .update(revision)
        .set({ status: "superseded" })
        .where(and(inArray(revision.id, pending.map((key) => input.moves[key]!)), ne(revision.status, "superseded")));
      return "superseded";
    }

    await opts?.beforeUpdate?.();
    const next: Heads = { ...heads };
    for (const key of pending) next[key] = input.moves[key]!;
    const result = await db
      .update(story)
      .set({ heads: next, headsVersion: sql`${story.headsVersion} + 1` })
      .where(and(eq(story.id, input.storyId), eq(story.headsVersion, row.headsVersion)))
      .run();
    if (result.meta.changes === 1) return "moved";
  }
  throw new HeadCasExhaustedError(input.storyId, maxAttempts);
}
