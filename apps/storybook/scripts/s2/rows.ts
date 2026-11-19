// The D1 rows of one S2 run, as `wrangler d1 execute --json` returns them:
// JSON columns arrive as text. The driver reads them with the three queries of
// the #26 refinement; nothing here comes from the driver's own view of the run.

export type CallRow = {
  call_id: string;
  step: string;
  page_id: string;
  purpose: "first" | "repair";
  model: string;
  usage: string | null;
  result: string | null;
};

export type RevisionRow = {
  id: string;
  kind: string;
  page_id: string;
  status: string;
  content: string | null;
  error: string | null;
  call_id: string;
};

export type RunRow = {
  status: string;
  registry: string | null;
  created_at: string;
  finished_at: string | null;
};

export type S2Rows = { runId: string; storyId: string; run: RunRow; calls: CallRow[]; revisions: RevisionRow[] };

export function json(text: string | null): unknown {
  return text === null ? null : (JSON.parse(text) as unknown);
}

const UUID = /^[0-9a-f-]{36}$/;

// An ID goes into SQL text only after this check (#26 step 4.4).
export function sqlId(name: string, id: unknown): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new Error(`${name} is not a UUID`);
  return id;
}

export function rowQueries(runId: string): [calls: string, revisions: string, run: string] {
  const id = sqlId("runId", runId);
  return [
    `SELECT c.call_id, c.step, c.page_id, c.purpose, c.model, c.usage, c.result FROM call_log c WHERE c.run_id = '${id}'`,
    `SELECT r.id, r.kind, r.page_id, r.status, r.content, r.error, r.call_id FROM revision r JOIN call_log c ON c.call_id = r.call_id WHERE c.run_id = '${id}'`,
    `SELECT status, registry, created_at, finished_at FROM run WHERE id = '${id}'`,
  ];
}
