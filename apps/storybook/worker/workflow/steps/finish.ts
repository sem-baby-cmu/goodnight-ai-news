import type { Outline } from "@storybook/dsl";
import { eq } from "drizzle-orm";
import { type ErrorRecord, type RunStatus, getDb, loadStoryHeads, pageStates, run } from "../../db";
import { type ProviderErrorInfo, readStatusTag } from "../model-call";

// An error record names the run, story, page, step, and provider status. It
// never holds page text or model output.
export function toErrorRecord(input: {
  runId: string;
  storyId: string;
  pageId: string | null;
  step: string;
  err?: unknown;
  providerError?: ProviderErrorInfo;
}): ErrorRecord {
  const { runId, storyId, pageId, step } = input;
  if (input.providerError) {
    return { runId, storyId, pageId, step, providerStatus: input.providerError.status, message: input.providerError.message };
  }
  const status = (input.err as { status?: unknown } | null | undefined)?.status;
  // After a step boundary only the message is left: read its status tag.
  const tagged = readStatusTag(input.err instanceof Error ? input.err.message : String(input.err));
  const providerStatus = typeof status === "number" ? status : tagged.status;
  return { runId, storyId, pageId, step, providerStatus, message: tagged.message.slice(0, 300) };
}

// Parallel page steps push errors in any order. Sorted by step (stable, plain
// string compare), a replay writes the same `run.error` (review item 7).
const sortByStep = (errors: ErrorRecord[]) => [...errors].sort((a, b) => (a.step < b.step ? -1 : a.step > b.step ? 1 : 0));

// Sets the final run status from the heads. Never waits for an event.
export async function finishStep(
  env: Env,
  runId: string,
  storyId: string,
  input: { failed: boolean; errors: ErrorRecord[] },
): Promise<{ status: RunStatus }> {
  const db = getDb(env.DB);
  let status: RunStatus = "failed";
  if (!input.failed) {
    const loaded = await loadStoryHeads(db, storyId);
    const outlineId = loaded?.story.heads.outline;
    const outline = outlineId ? (loaded!.revisions.get(outlineId)?.content as Outline | undefined) : undefined;
    if (loaded && outline) {
      const states = pageStates({
        pageIds: outline.pages.map((p) => p.pageId),
        heads: loaded.story.heads,
        revisions: loaded.revisions,
      });
      status = states.every((p) => p.state === "ok") ? "draft_ready" : "needs_review";
    }
  }
  await db
    .update(run)
    .set({ status, error: { errors: sortByStep(input.errors) }, finishedAt: new Date().toISOString() })
    .where(eq(run.id, runId));
  return { status };
}
