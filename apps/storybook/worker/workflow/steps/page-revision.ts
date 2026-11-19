import { type Db, type HeadKey, type RevisionKind, commitHead, headKey, insertRevisions } from "../../db";
import type { ProviderErrorInfo, StoredCall } from "../model-call";
import { type FaultContext, seams } from "../seams";

export type PageStepResult = {
  revisionId: string;
  status: "ok" | "needs_review";
  head: "moved" | "superseded";
  providerError?: ProviderErrorInfo;
};

// Writes one AI revision of a page target from a stored call, then moves the
// head with the call's stored basis and expected head (amendment R58).
export async function writePageRevision(
  db: Db,
  ctx: FaultContext,
  input: {
    kind: Extract<RevisionKind, "scene" | "audio">;
    call: StoredCall;
    status: "ok" | "needs_review";
    content: unknown;
    r2Key: string | null;
    assetVersions: Record<string, number> | null;
    error: unknown;
  },
): Promise<{ revisionId: string; head: "moved" | "superseded" }> {
  const key: HeadKey = headKey(input.kind, ctx.pageId);
  const [revisionId] = await insertRevisions(db, [
    {
      storyId: ctx.storyId,
      kind: input.kind,
      pageId: ctx.pageId,
      origin: "ai",
      callId: input.call.callId,
      status: input.status,
      content: input.content,
      r2Key: input.r2Key,
      basis: input.call.basis,
      assetVersions: input.assetVersions,
      error: input.error,
    },
  ]);
  await seams.at("after_revisions", ctx);
  const head = await commitHead(db, {
    storyId: ctx.storyId,
    moves: { [key]: revisionId! },
    basis: input.call.basis,
    expected: { [key]: input.call.expectedHeads[key] ?? null },
  });
  return { revisionId: revisionId!, head };
}

// The `needs_review` revision for a provider or TTS output error (invariant 8).
export async function writeProviderError(
  db: Db,
  ctx: FaultContext,
  kind: "scene" | "audio",
  call: StoredCall,
  providerError: ProviderErrorInfo,
): Promise<PageStepResult> {
  const { revisionId, head } = await writePageRevision(db, ctx, {
    kind,
    call,
    status: "needs_review",
    content: null,
    r2Key: null,
    assetVersions: null,
    error: { providerStatus: providerError.status, message: providerError.message },
  });
  return { revisionId, status: "needs_review", head, providerError };
}
