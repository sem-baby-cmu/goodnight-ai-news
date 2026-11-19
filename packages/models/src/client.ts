import type { ModelConfig } from "./config";
import { ModelHttpError, ModelOutputError, UnsupportedAudioFormatError } from "./errors";
import { buildSpeechRequest, decodeSpeechResponse } from "./tts";

export type JsonSchema = Record<string, unknown>;
export type Usage = { inputTokens: number; outputTokens: number };

export interface ModelClient {
  generateJson(req: {
    model: "script" | "scene";
    system: string;
    user: string;
    schema: JsonSchema;
  }): Promise<{ value: unknown; usage: Usage; modelId: string }>;
  synthesizeSpeech(req: {
    text: string;
    voice: string;
  }): Promise<{ bytes: Uint8Array; contentType: string; durationMs: number }>;
}

const TIMEOUT_MS = 180_000;
const MAX_PROVIDER_MESSAGE = 200;

type ChatBody = {
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

// The provider's `error.message`, cut to 200 characters, or "".
async function providerMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    const message = body?.error?.message;
    return typeof message === "string" ? message.slice(0, MAX_PROVIDER_MESSAGE) : "";
  } catch {
    return "";
  }
}

// One request. Classifies failures; never retries and never deduplicates.
async function send(doFetch: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await doFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const kind = error instanceof Error ? error.name : "unknown error";
    throw new ModelHttpError(`Model request failed before an answer (${kind})`, { status: 0, retryable: true });
  }
  if (!res.ok) {
    const message = await providerMessage(res);
    throw new ModelHttpError(`Model request failed with HTTP ${res.status}${message ? `: ${message}` : ""}`, {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
    });
  }
  return res;
}

export function createModelClient(config: ModelConfig, deps: { fetch?: typeof fetch } = {}): ModelClient {
  // Call the global fetch through a wrapper: Workers reject an unbound `fetch`.
  const doFetch: typeof fetch = deps.fetch ?? ((input, init) => fetch(input, init));

  return {
    async generateJson(req) {
      const configuredId = config.models[req.model];
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      };
      if (config.gatewayToken) headers["cf-aig-authorization"] = `Bearer ${config.gatewayToken}`;
      const res = await send(doFetch, `${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: configuredId,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: req.model, strict: true, schema: req.schema },
          },
        }),
      });

      let body: ChatBody;
      try {
        body = (await res.json()) as ChatBody;
      } catch {
        throw new ModelOutputError("Model response body is not JSON", { modelId: configuredId, usage: null });
      }
      const usage: Usage = {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      };
      const modelId = typeof body.model === "string" ? body.model : configuredId;
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new ModelOutputError("Model response has no message content", { modelId, usage });
      }
      try {
        return { value: JSON.parse(content) as unknown, usage, modelId };
      } catch {
        throw new ModelOutputError("Model message content is not valid JSON", { modelId, usage, raw: content });
      }
    },

    async synthesizeSpeech(req) {
      const { url, init } = buildSpeechRequest(config, req);
      const res = await send(doFetch, url, init);
      try {
        let json: unknown;
        try {
          json = await res.json();
        } catch {
          throw new ModelOutputError("Speech response body is not JSON", { modelId: "", usage: null });
        }
        return decodeSpeechResponse(json);
      } catch (error) {
        // The decoders have no response context; add the model ID here. TTS
        // reports no usage, so `usage` stays null (implementation decision R25b).
        if (error instanceof ModelOutputError || error instanceof UnsupportedAudioFormatError) {
          error.modelId = config.models.tts;
        }
        throw error;
      }
    },
  };
}
