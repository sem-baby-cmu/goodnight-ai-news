import { ModelHttpError } from "@storybook/models";
import { NonRetryableError } from "cloudflare:workflows";
import { type Db, type ExpectedHeads, type HeadKey, type Heads, getCall, makeCallId, putCall, story } from "../db";
import { eq } from "drizzle-orm";
import { type FaultContext, seams } from "./seams";

// A provider error that the platform does not retry (implementation decision R26b).
// `message` has at most 200 characters; `status` is null for a TTS output error.
export type ProviderErrorInfo = { status: number | null; message: string };

export const AUDIO_EXT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
};

const MAX_MESSAGE = 200;

// "retry": the platform retries the step. A `ProviderErrorInfo`: the step
// stores it and does not throw (implementation decisions R13, R26b).
// A `ModelHttpError` keeps provider text in `providerMessage`, never in
// `message`, so that field is used first (implementation decision).
export function classifyProviderError(err: unknown): "retry" | ProviderErrorInfo {
  if (err instanceof ModelHttpError) {
    if (err.retryable) return "retry";
    return { status: err.status, message: (err.providerMessage ?? err.message).slice(0, MAX_MESSAGE) };
  }
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== "number" || status === 0 || status === 429 || status >= 500) return "retry";
  if (status >= 400 && status <= 499) {
    const message = err instanceof Error ? err.message : String(err);
    return { status, message: message.slice(0, MAX_MESSAGE) };
  }
  return "retry";
}

// Workflows keep only `name` and `message` of a step error, so `status` is
// lost when a step fails after its retries. A retried provider error carries
// its status in a message tag, which `toErrorRecord` reads (implementation
// decision; deviation from "rethrow the error").
const STATUS_TAG = /^\[provider status (\d+)\] /;

function withStatusTag(err: unknown): unknown {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return err;
  const message = err instanceof Error ? err.message : String(err);
  return Object.assign(new Error(`[provider status ${status}] ${message}`), { status });
}

// The status and the message without the tag.
export function readStatusTag(message: string): { status: number | null; message: string } {
  const match = STATUS_TAG.exec(message);
  return match ? { status: Number(match[1]), message: message.slice(match[0].length) } : { status: null, message };
}

export type CallOutput = {
  result?: unknown;
  bytes?: { data: Uint8Array; contentType: string };
  modelId: string;
  usage: unknown;
};

export type StoredCall = {
  callId: string;
  result: unknown;
  r2Key: string | null;
  basis: Heads;
  expectedHeads: ExpectedHeads;
};

// The step pattern (design "3. Calls, revisions, and heads"; amendment R58).
// 1. A stored row for the call ID: use it; never call the model again.
// 2. Else read `basis` and the heads of `targetKeys` in one read (or take
//    both from `basisFrom`, for a repair), call the model, store bytes in R2,
//    then the `call_log` row. The row that `putCall` returns wins.
export async function storedCall(
  deps: { env: Env; db: Db; ctx: FaultContext },
  args: {
    basisKeys: HeadKey[];
    targetKeys: HeadKey[];
    basisFrom?: { basis: Heads; expectedHeads: ExpectedHeads };
    model: string;
    call: (basis: Heads) => Promise<CallOutput>;
  },
): Promise<StoredCall> {
  const { env, db, ctx } = deps;
  const callId = await makeCallId(ctx.runId, ctx.step, ctx.pageId, ctx.purpose);
  const found = await getCall(db, callId);
  if (found) return toStored(found);

  let basis: Heads;
  let expectedHeads: ExpectedHeads;
  if (args.basisFrom) {
    ({ basis, expectedHeads } = args.basisFrom);
  } else {
    const [row] = await db.select({ heads: story.heads }).from(story).where(eq(story.id, ctx.storyId));
    if (!row) throw new Error("story not found");
    basis = {};
    for (const key of args.basisKeys) {
      const id = row.heads[key];
      if (id === undefined) throw new Error(`no head for basis key ${key}`);
      basis[key] = id;
    }
    expectedHeads = {};
    for (const key of args.targetKeys) expectedHeads[key] = row.heads[key] ?? null;
  }

  await seams.at("before_model_call", ctx);
  let out: CallOutput;
  try {
    out = await args.call(basis);
  } catch (err) {
    const info = classifyProviderError(err);
    if (info === "retry") throw withStatusTag(err);
    out = { result: { providerError: info }, modelId: args.model, usage: null };
  }
  await seams.at("after_model_call", ctx);

  let r2Key: string | null = null;
  if (out.bytes) {
    const ext = AUDIO_EXT[out.bytes.contentType];
    if (!ext) throw new NonRetryableError(`unsupported audio type ${out.bytes.contentType}`);
    r2Key = `calls/${callId}.${ext}`;
    await env.BUCKET.put(r2Key, out.bytes.data, { httpMetadata: { contentType: out.bytes.contentType } });
  }
  const row = await putCall(db, {
    callId,
    runId: ctx.runId,
    step: ctx.step,
    pageId: ctx.pageId,
    purpose: ctx.purpose,
    result: out.result ?? null,
    r2Key,
    basis,
    expectedHeads,
    model: out.modelId,
    usage: out.usage ?? null,
    createdAt: new Date().toISOString(),
  });
  await seams.at("after_call_log", ctx);
  return toStored(row);
}

function toStored(row: { callId: string; result: unknown; r2Key: string | null; basis: Heads; expectedHeads: ExpectedHeads }): StoredCall {
  return { callId: row.callId, result: row.result, r2Key: row.r2Key, basis: row.basis, expectedHeads: row.expectedHeads };
}

// The stored provider error of a call result, if it has one.
export function providerErrorOf(result: unknown): ProviderErrorInfo | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const r = result as { providerError?: ProviderErrorInfo; outputError?: string };
  if (r.providerError) return r.providerError;
  if (typeof r.outputError === "string") return { status: null, message: r.outputError };
  return undefined;
}

export const isUnparsed = (result: unknown) =>
  typeof result === "object" && result !== null && (result as { unparsed?: unknown }).unparsed === true;
