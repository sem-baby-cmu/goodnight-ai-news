// The probe steps. `probe-tts.ts` runs them; the tests import them.
// Never prints keys or full model output.
import { createModelClient } from "../src/client";
import { loadModelConfig, type ModelConfig } from "../src/config";
import { ModelHttpError } from "../src/errors";
import { base64ToBytes, buildSpeechRequest, decodeSpeechResponse, findInlineData, speechUsage } from "../src/tts";

const PROBE_TEXT = "Good night, little star.";

const PROBE_SCHEMA = {
  type: "object",
  properties: {
    mood: { enum: ["calm", "happy"] },
    n: { type: "integer", minimum: 1, maximum: 3 },
    tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["mood", "n", "tags", "note"],
  additionalProperties: false,
};

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown error";
}

// Parses a 2xx body. `undefined` means the body is not JSON.
function parseBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function probeGateway(config: ModelConfig) {
  const headers: Record<string, string> = { Authorization: `Bearer ${config.apiKey}` };
  if (config.gatewayToken) headers["cf-aig-authorization"] = `Bearer ${config.gatewayToken}`;
  try {
    const res = await fetch(`${config.baseUrl}/models`, { headers, signal: AbortSignal.timeout(30_000) });
    const result: Record<string, unknown> = { status: res.status };
    if (!res.ok) return result;
    const body = parseBody(await res.text()) as { data?: Array<Record<string, unknown>> } | undefined;
    if (body === undefined) return { ...result, bodyNotJson: true };
    const models = Array.isArray(body.data) ? body.data : [];
    const tts = models.find((model) => model.id === config.models.tts);
    result.modelCount = models.length;
    result.ttsModelListed = tts !== undefined;
    const modalities = tts?.modalities as { output?: unknown } | undefined;
    const architecture = tts?.architecture as { output_modalities?: unknown } | undefined;
    const output = modalities?.output ?? architecture?.output_modalities;
    if (output !== undefined) result.ttsModelOutput = output;
    return result;
  } catch (error) {
    return { status: 0, error: errorName(error) };
  }
}

export async function probeTts(config: ModelConfig) {
  const { url, init } = buildSpeechRequest(config, { text: PROBE_TEXT, voice: config.tts.voice });
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
    const result: Record<string, unknown> = { status: res.status };
    if (!res.ok) return result;
    const json = parseBody(await res.text());
    if (json === undefined) return { ...result, bodyNotJson: true };
    const inline = findInlineData(json);
    result.mimeType = typeof inline?.mimeType === "string" ? inline.mimeType : null;
    if (typeof inline?.data === "string") {
      try {
        const bytes = base64ToBytes(inline.data);
        result.decodedBytes = bytes.length;
        result.first4Ascii = String.fromCharCode(...bytes.subarray(0, 4));
      } catch (error) {
        result.base64Error = errorName(error);
      }
    }
    try {
      const decoded = decodeSpeechResponse(json);
      result.decode = { contentType: decoded.contentType, durationMs: decoded.durationMs };
    } catch (error) {
      result.decode = { error: errorName(error) };
    }
    // Token counts only (#65): the mapped usage and the field names of the usage block.
    const meta = (json as { usageMetadata?: unknown } | null)?.usageMetadata;
    result.usage = speechUsage(json);
    result.usageFields = typeof meta === "object" && meta !== null ? Object.keys(meta).sort() : null;
    return result;
  } catch (error) {
    return { status: 0, error: errorName(error) };
  }
}

function meetsSchema(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort().join(",");
  return (
    keys === "mood,n,note,tags" &&
    (v.mood === "calm" || v.mood === "happy") &&
    Number.isInteger(v.n) && (v.n as number) >= 1 && (v.n as number) <= 3 &&
    Array.isArray(v.tags) && v.tags.length >= 1 && v.tags.length <= 2 &&
    v.tags.every((tag) => typeof tag === "string") &&
    (v.note === null || typeof v.note === "string")
  );
}

async function probeJsonSchema(config: ModelConfig) {
  try {
    const { value } = await createModelClient(config).generateJson({
      model: "script",
      system: "Answer with JSON that matches the schema.",
      user: "Pick a mood, a number from 1 to 3, one or two short tags, and a short note or null.",
      schema: PROBE_SCHEMA,
    });
    return { status: 200, parsed: true, meetsSchema: meetsSchema(value) };
  } catch (error) {
    if (error instanceof ModelHttpError) return { status: error.status, parsed: false };
    return { status: 200, parsed: false, error: errorName(error) };
  }
}

export async function main(): Promise<number> {
  let config: ModelConfig;
  try {
    config = loadModelConfig(process.env);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  const call = process.argv.includes("--call");
  const report = {
    date: new Date().toISOString(),
    gateway: await probeGateway(config),
    tts: call ? await probeTts(config) : "skipped",
    jsonSchema: call ? await probeJsonSchema(config) : "skipped",
  };
  console.log(JSON.stringify(report));
  return 0;
}

