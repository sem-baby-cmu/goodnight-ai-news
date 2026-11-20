import { ModelOutputError, UnsupportedAudioFormatError } from "@storybook/models";
import { eq } from "drizzle-orm";
import { type HeadKey, type Heads, getDb, revision } from "../../db";
import { answerOf, providerErrorOf, storedCall } from "../model-call";
import { type FaultContext, seams } from "../seams";
import { frozenRegistry } from "./freeze";
import { type PageStepResult, writePageRevision, writeProviderError } from "./page-revision";

export { AUDIO_EXT } from "../model-call";

export type AudioStepResult = PageStepResult;

export async function audioStep(env: Env, runId: string, storyId: string, pageId: string): Promise<AudioStepResult> {
  const db = getDb(env.DB);
  const registry = await frozenRegistry(db, runId);
  const client = seams.modelClient(env, { registry });
  const ctx: FaultContext = { runId, storyId, step: `audio:${pageId}`, pageId, purpose: "first" };
  const textKey: HeadKey = `page_text:${pageId}`;
  const model = env.MODEL_TTS ?? "";

  const stored = await storedCall(
    { env, db, ctx },
    {
      basisKeys: [textKey],
      targetKeys: [`audio:${pageId}`],
      model,
      call: async (basis: Heads) => {
        const [text] = await db.select({ content: revision.content }).from(revision).where(eq(revision.id, basis[textKey]!));
        try {
          const speech = await client.synthesizeSpeech({ text: (text!.content as { text: string }).text, voice: env.TTS_VOICE });
          return {
            result: { kind: "answer" as const, value: { contentType: speech.contentType, durationMs: speech.durationMs } },
            bytes: { data: speech.bytes, contentType: speech.contentType },
            modelId: model,
            usage: speech.usage,
          };
        } catch (err) {
          // A TTS output error is stored, not retried (implementation decisions R25b, R26b).
          if (err instanceof ModelOutputError || err instanceof UnsupportedAudioFormatError) {
            return { result: { kind: "output_error" as const, message: err.message.slice(0, 200) }, modelId: err.modelId, usage: err.usage };
          }
          throw err;
        }
      },
    },
  );
  const providerError = providerErrorOf(stored.result);
  if (providerError) return writeProviderError(db, ctx, "audio", stored, providerError);

  const { revisionId, head } = await writePageRevision(db, ctx, {
    kind: "audio",
    call: stored,
    status: "ok",
    content: answerOf(stored.result),
    r2Key: stored.r2Key,
    assetVersions: null,
    error: null,
  });
  return { revisionId, status: "ok", head };
}
