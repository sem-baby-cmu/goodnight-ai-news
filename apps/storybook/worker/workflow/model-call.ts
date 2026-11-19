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
export function classifyProviderError(err: unknown): "retry" | { status: number; message: string } {
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
// decision R60). A `ModelHttpError` message holds no provider text.
const STATUS_TAG = /^\[provider status (\d{3})\] /;

export function withStatusTag(err: unknown): unknown {
  const status = (err as { status?: unknown } | null)?.status;
  // Only an HTTP status has a tag; a network failure (status 0) keeps its error.
  if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) return err;
  const message = err instanceof Error ? err.message : String(err);
  return Object.assign(new Error(`[provider status ${status}] ${message}`), { status });
}

// The status and the message without the tag.
export function readStatusTag(message: string): { status: number | null; message: string } {
  const match = STATUS_TAG.exec(message);
  return match ? { status: Number(match[1]), message: message.slice(match[0].length) } : { status: null, message };
}

// What `call_log.result` holds: a tagged envelope, so a model answer is never
// read as an internal marker (review item 1).
export type CallResult =
  | { kind: "answer"; value: unknown }
  | { kind: "provider_error"; status: number; message: string }
  | { kind: "unparsed"; raw: string; truncated?: true }
  | { kind: "output_error"; message: string };

// The raw output of an unparsed answer is kept, at most 65,536 characters
// (review item 2). It is stored, never logged.
export const MAX_RAW = 65_536;

export function unparsedResult(raw: string | undefined): CallResult {
  const text = raw ?? "";
  return text.length > MAX_RAW ? { kind: "unparsed", raw: text.slice(0, MAX_RAW), truncated: true } : { kind: "unparsed", raw: text };
}

export type CallOutput = {
  result: CallResult;
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
    if (!row) throw new NonRetryableError("story not found");
    basis = {};
    for (const key of args.basisKeys) {
      const id = row.heads[key];
      if (id === undefined) throw new NonRetryableError(`no head for basis key ${key}`);
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
    out = { result: { kind: "provider_error", status: info.status, message: info.message }, modelId: args.model, usage: null };
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
    result: out.result,
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

const kindOf = (result: unknown) => (result as { kind?: unknown } | null)?.kind;

// The stored provider error or TTS output error of a call, if it has one.
export function providerErrorOf(result: unknown): ProviderErrorInfo | undefined {
  const r = result as CallResult;
  if (kindOf(result) === "provider_error" && r.kind === "provider_error") return { status: r.status, message: r.message };
  if (kindOf(result) === "output_error" && r.kind === "output_error") return { status: null, message: r.message };
  return undefined;
}

export const isUnparsed = (result: unknown): result is Extract<CallResult, { kind: "unparsed" }> => kindOf(result) === "unparsed";

// The model answer of a stored call; `undefined` when the call has no answer.
export const answerOf = (result: unknown): unknown => (kindOf(result) === "answer" ? (result as { value: unknown }).value : undefined);

// A JSON schema that cannot be built (for example, no character in the
// registry) does not heal on retry (review item 3).
export function buildSchema(build: () => Record<string, unknown>): Record<string, unknown> {
  try {
    return build();
  } catch (err) {
    throw new NonRetryableError(err instanceof Error ? err.message : String(err));
  }
}
