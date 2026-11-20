import type { ShelfResponse } from "./schemas";

// The shelf (ADR 0017, design "6. API" > "Shelf"). One statement. It reads
// only `story.id`, the pointer, and `withdrawn_through` from `story`, so no
// draft value reaches a child (AGENTS section 5). The pointer is the latest release: it moves only
// to a higher number of the same story. Order: the first release time of the
// story, newest first, then the story ID descending. `created_at` is ISO 8601
// text in one fixed form, so text order is time order.
const SHELF_SQL = `SELECT s.id AS storyId,
       s.published_release_id AS pointer,
       r.id AS releaseId,
       r.story_id AS releaseStoryId,
       r.number AS number,
       s.withdrawn_through AS withdrawnThrough,
       r.title AS title,
       r.created_at AS publishedAt,
       (SELECT MIN(f.created_at) FROM release f WHERE f.story_id = s.id) AS firstAt
FROM story s
LEFT JOIN release r ON r.id = s.published_release_id
WHERE s.published_release_id IS NOT NULL
ORDER BY firstAt DESC, s.id DESC`;

type ShelfRow = {
  storyId: string;
  pointer: string;
  releaseId: string | null;
  releaseStoryId: string | null;
  number: number | null;
  withdrawnThrough: number;
  title: string | null;
  publishedAt: string | null;
  firstAt: string | null;
};

type SkipReason = "missing_release" | "wrong_story";

// No title and no text in the log (AGENTS section 5).
function logSkip(storyId: string, releaseId: string, reason: SkipReason) {
  console.error(JSON.stringify({ event: "shelf_skipped", storyId, releaseId, reason }));
}

// A broken pointer gives no entry and one log line. It is never repaired.
export async function loadShelf(d1: D1Database): Promise<ShelfResponse> {
  const { results } = await d1.prepare(SHELF_SQL).all<ShelfRow>();
  const books: ShelfResponse["books"] = [];
  for (const row of results) {
    if (row.releaseId === null) {
      logSkip(row.storyId, row.pointer, "missing_release");
      continue;
    }
    if (row.releaseStoryId !== row.storyId) {
      logSkip(row.storyId, row.pointer, "wrong_story");
      continue;
    }
    // Taken off the shelf (decision 20). Not a broken pointer: no log line.
    if (row.number! <= row.withdrawnThrough) continue;
    books.push({ releaseId: row.releaseId, title: row.title!, publishedAt: row.publishedAt! });
  }
  return { books };
}
