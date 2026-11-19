import type { RevisionRow, RunScope } from "../db";
import type { RevisionView, RunStep } from "./schemas";

// The API view of a revision. A stored file is served by
// `GET /api/studio/files/*`.
export function toRevisionView(row: RevisionRow): RevisionView {
  return {
    id: row.id,
    kind: row.kind,
    pageId: row.pageId,
    status: row.status,
    origin: row.origin,
    content: row.content ?? null,
    error: row.error ?? null,
    basis: row.basis as Record<string, string>,
    assetVersions: row.assetVersions ?? null,
    createdAt: row.createdAt,
    fileUrl: row.r2Key ? `/api/studio/files/${row.r2Key}` : null,
  };
}

// The steps of a run, in order. A full run: `script`, then `scene:<p>` and
// `audio:<p>` for each page of the outline head. A page run: its one step.
// `failed` wins over `done` (implementation decision R47).
export function runSteps(input: {
  scope: RunScope;
  pageIds: string[];
  done: ReadonlySet<string>;
  failed: ReadonlySet<string>;
}): RunStep[] {
  const names =
    input.scope.kind === "full"
      ? ["script", ...input.pageIds.flatMap((p) => [`scene:${p}`, `audio:${p}`])]
      : [`${input.scope.target}:${input.scope.pageId}`];
  return names.map((step) => ({
    step,
    state: input.failed.has(step) ? "failed" : input.done.has(step) ? "done" : "pending",
  }));
}
