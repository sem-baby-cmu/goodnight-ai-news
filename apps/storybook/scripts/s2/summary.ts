// S2 metrics (#26 key invariants). Every number comes from the stored rows.
// A page passes when a scene revision with status `ok` exists whose call is a
// call of this run with step `scene:<pageId>`.
import { type S2Rows, json } from "./rows";

export type Summary = {
  runId: string;
  status: string;
  scriptOk: boolean;
  pages: number;
  okFirstTry: number;
  okAfterRepair: number;
  needsReview: number;
  failed: number;
  superseded: number;
  audioOk: number;
  wallMs: number | null;
  inputTokens: number;
  outputTokens: number;
  repairs: number;
  issueCodes: Record<string, number>;
};

function count(into: Record<string, number>, code: string): void {
  into[code] = (into[code] ?? 0) + 1;
}

// Issue codes of a stored failed attempt. A provider error has no issues.
function codesOf(error: unknown): string[] {
  const e = error as { issues?: Array<{ code?: unknown }>; providerStatus?: unknown } | null;
  if (e && e.providerStatus !== undefined) return ["provider_error"];
  return (e?.issues ?? []).map((i) => String(i.code));
}

export function summarize(rows: S2Rows): Summary {
  const calls = new Map(rows.calls.map((c) => [c.call_id, c]));
  const stepOf = (callId: string) => calls.get(callId)?.step;
  const outline = rows.revisions.find((r) => r.kind === "outline" && stepOf(r.call_id) === "script");
  const pages = ((json(outline?.content ?? null) as { pages?: Array<{ pageId: string }> } | null)?.pages ?? []).map((p) => p.pageId);
  const s: Summary = {
    runId: rows.runId,
    status: rows.run.status,
    scriptOk: outline !== undefined,
    pages: pages.length,
    okFirstTry: 0,
    okAfterRepair: 0,
    needsReview: 0,
    failed: 0,
    superseded: 0,
    audioOk: 0,
    wallMs: rows.run.finished_at ? Date.parse(rows.run.finished_at) - Date.parse(rows.run.created_at) : null,
    inputTokens: 0,
    outputTokens: 0,
    repairs: rows.calls.filter((c) => c.purpose === "repair").length,
    issueCodes: {},
  };
  for (const pageId of pages) {
    const step = `scene:${pageId}`;
    const scenes = rows.revisions.filter((r) => r.kind === "scene" && stepOf(r.call_id) === step);
    const scene = scenes.find((r) => r.status === "ok") ?? scenes[0];
    if (scene?.status === "ok") {
      if (rows.calls.some((c) => c.step === step && c.purpose === "repair")) s.okAfterRepair++;
      else s.okFirstTry++;
    } else if (scene?.status === "needs_review") {
      s.needsReview++;
      for (const code of codesOf(json(scene.error))) count(s.issueCodes, code);
    } else {
      // No scene, or `superseded`, which needs operator edits: a bug.
      s.failed++;
      if (scene?.status === "superseded") s.superseded++;
    }
  }
  s.audioOk = rows.revisions.filter((r) => r.kind === "audio" && r.status === "ok" && stepOf(r.call_id)?.startsWith("audio:")).length;
  for (const c of rows.calls) {
    // Text tokens only: TTS tokens have other prices (#65).
    if (c.step.startsWith("audio:")) continue;
    const u = json(c.usage) as { inputTokens?: unknown; outputTokens?: unknown } | null;
    if (typeof u?.inputTokens === "number") s.inputTokens += u.inputTokens;
    if (typeof u?.outputTokens === "number") s.outputTokens += u.outputTokens;
  }
  return s;
}

export function formatRate(passes: number, pages: number): string {
  return pages === 0 ? `${passes}/0 = n/a` : `${passes}/${pages} = ${(passes / pages).toFixed(3)}`;
}

// S2 passes only when every script step succeeded and passes / pages >= 0.90.
export function verdict(summaries: Summary[]): { passes: number; pages: number; firstTry: number; verdict: "pass" | "fail" | "fail (script)" } {
  const passes = summaries.reduce((n, s) => n + s.okFirstTry + s.okAfterRepair, 0);
  const pages = summaries.reduce((n, s) => n + s.pages, 0);
  const firstTry = summaries.reduce((n, s) => n + s.okFirstTry, 0);
  const result = summaries.some((s) => !s.scriptOk) ? "fail (script)" : pages > 0 && passes * 10 >= pages * 9 ? "pass" : "fail";
  return { passes, pages, firstTry, verdict: result };
}
