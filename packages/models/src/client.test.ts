import { describe, expect, it } from "vitest";
import { createModelClient } from "./client";
import { loadModelConfig } from "./config";
import { ModelHttpError, ModelOutputError, UnsupportedAudioFormatError } from "./errors";
import { pcmToWav } from "./wav";
import { ascii, baseEnv, json, speechAnswer, stubFetch } from "./test-helpers";

const config = loadModelConfig(baseEnv);
const jsonRequest = {
  model: "scene" as const,
  system: "sys",
  user: "usr",
  schema: { type: "object" },
};
const speechRequest = { text: "Good night.", voice: "Kore" };

function chatAnswer(content: unknown, extra: Record<string, unknown> = {}) {
  return json({ choices: [{ message: { content } }], ...extra });
}

// Runs `promise` and returns what it rejects with.
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("generateJson", () => {
  it("SYS-05.S1 generateJson posts strict json_schema with mapped model id", async () => {
    const { fetch, calls } = stubFetch(() => chatAnswer("{}"));
    await createModelClient(config, { fetch }).generateJson(jsonRequest);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://text.example/v1/chat/completions");
    expect(call.headers.get("Authorization")).toBe("Bearer k");
    expect(call.headers.get("Content-Type")).toBe("application/json");
    expect(call.body).toEqual({
      model: "m-scene",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "scene", strict: true, schema: { type: "object" } },
      },
    });
  });

  it("SYS-05.S2 generateJson parses content and maps usage", async () => {
    const { fetch } = stubFetch(() =>
      chatAnswer('{"mood":"calm","n":2}', {
        model: "m-scene-served",
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      }),
    );
    const result = await createModelClient(config, { fetch }).generateJson(jsonRequest);
    expect(result).toEqual({
      value: { mood: "calm", n: 2 },
      usage: { inputTokens: 11, outputTokens: 7 },
      modelId: "m-scene-served",
    });

    const bare = stubFetch(() => chatAnswer("[1]"));
    const fallback = await createModelClient(config, { fetch: bare.fetch }).generateJson(jsonRequest);
    expect(fallback.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(fallback.modelId).toBe("m-scene");
  });

  it("generateJson 429 is retryable", async () => {
    const { fetch } = stubFetch(() => json({ error: { message: "slow down" } }, 429));
    const error = await rejection(createModelClient(config, { fetch }).generateJson(jsonRequest));
    expect(error).toBeInstanceOf(ModelHttpError);
    expect(error).toMatchObject({ status: 429, retryable: true });
  });

  it("generateJson 503 is retryable", async () => {
    const { fetch } = stubFetch(() => new Response("busy", { status: 503 }));
    const error = await rejection(createModelClient(config, { fetch }).generateJson(jsonRequest));
    expect(error).toBeInstanceOf(ModelHttpError);
    expect(error).toMatchObject({ status: 503, retryable: true });
  });

  it("generateJson 400 is not retryable", async () => {
    const longMessage = "x".repeat(300);
    const { fetch } = stubFetch(() => json({ error: { message: longMessage } }, 400));
    const error = await rejection(createModelClient(config, { fetch }).generateJson(jsonRequest));
    expect(error).toBeInstanceOf(ModelHttpError);
    expect(error).toMatchObject({ status: 400, retryable: false });
    expect((error as Error).message).toBe("Model request failed with HTTP 400");
    expect(error).toMatchObject({ providerMessage: "x".repeat(300) });
  });

  it("generateJson 401 keeps keys and provider text out of the message", async () => {
    const keyed = loadModelConfig({
      ...baseEnv,
      OPENAI_API_KEY: "sk-secret-123",
      TTS_API_KEY: "tts-secret-456",
      AI_GATEWAY_TOKEN: "gw-secret-789",
    });
    const text = `bad key sk-secret-123 tts-secret-456 gw-secret-789 ${"story text ".repeat(60)}`;
    const { fetch } = stubFetch(() => json({ error: { message: text } }, 401));
    const error = await rejection(createModelClient(keyed, { fetch }).generateJson(jsonRequest));
    expect(error).toBeInstanceOf(ModelHttpError);
    expect((error as Error).message).toBe("Model request failed with HTTP 401");
    const provider = (error as ModelHttpError).providerMessage ?? "";
    expect(provider.length).toBeGreaterThan(0);
    expect(provider.length).toBeLessThanOrEqual(300);
    expect(provider).toContain("[redacted]");
    for (const secret of ["sk-secret-123", "tts-secret-456", "gw-secret-789"]) {
      expect(provider).not.toContain(secret);
    }
  });

  it("generateJson network failure is retryable status 0", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof globalThis.fetch;
    const error = await rejection(createModelClient(config, { fetch }).generateJson(jsonRequest));
    expect(error).toBeInstanceOf(ModelHttpError);
    expect(error).toMatchObject({ status: 0, retryable: true });
  });

  it("generateJson non-JSON content throws ModelOutputError without content in message", async () => {
    const content = "SECRET-STORY-TEXT is not json";
    const { fetch } = stubFetch(() =>
      chatAnswer(content, { model: "m-scene-served", usage: { prompt_tokens: 5, completion_tokens: 3 } }),
    );
    const error = await rejection(createModelClient(config, { fetch }).generateJson(jsonRequest));
    expect(error).toBeInstanceOf(ModelOutputError);
    expect((error as Error).message).not.toContain("SECRET-STORY-TEXT");
    expect(error).toMatchObject({
      raw: content,
      modelId: "m-scene-served",
      usage: { inputTokens: 5, outputTokens: 3 },
    });
  });
});

describe("synthesizeSpeech", () => {
  it("synthesizeSpeech posts generateContent with voice", async () => {
    const { fetch, calls } = stubFetch(() => speechAnswer("audio/L16;rate=24000", new Uint8Array(480)));
    await createModelClient(config, { fetch }).synthesizeSpeech(speechRequest);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://tts.example/v1beta/models/m-tts:generateContent");
    expect(call.headers.get("x-goog-api-key")).toBe("tk");
    expect(call.headers.get("Content-Type")).toBe("application/json");
    expect(call.headers.get("Authorization")).toBeNull();
    expect(call.body).toEqual({
      contents: [{ parts: [{ text: "Good night." }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      },
    });
  });

  it("SYS-05.S3 synthesizeSpeech wraps L16 rate=24000 as WAV", async () => {
    const pcm = new Uint8Array(48000).map((_, i) => i % 251);
    const { fetch } = stubFetch(() => speechAnswer("audio/L16;codec=pcm;rate=24000", pcm));
    const result = await createModelClient(config, { fetch }).synthesizeSpeech(speechRequest);
    const view = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength);
    expect(result.contentType).toBe("audio/wav");
    expect(ascii(result.bytes, 0, 4)).toBe("RIFF");
    expect(ascii(result.bytes, 8, 4)).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1); // PCM format
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(24000); // sample rate
    expect(view.getUint32(28, true)).toBe(48000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(result.bytes.subarray(44)).toEqual(pcm);
    expect(result.durationMs).toBe(1000);
  });

  it("synthesizeSpeech passes RIFF bytes through and reads duration", async () => {
    const wav = pcmToWav(new Uint8Array(4800), 24000, 1);
    const { fetch } = stubFetch(() => speechAnswer("application/octet-stream", wav));
    const result = await createModelClient(config, { fetch }).synthesizeSpeech(speechRequest);
    expect(result.bytes).toEqual(wav);
    expect(result.contentType).toBe("audio/wav");
    expect(result.durationMs).toBe(100);
  });

  it("synthesizeSpeech rejects audio/mpeg", async () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
    const { fetch } = stubFetch(() => speechAnswer("audio/mpeg", mp3));
    const error = await rejection(createModelClient(config, { fetch }).synthesizeSpeech(speechRequest));
    expect(error).toBeInstanceOf(UnsupportedAudioFormatError);
    expect((error as Error).message).toContain("audio/mpeg");
    expect(error).toMatchObject({ modelId: "m-tts", usage: null });
  });

  it("synthesizeSpeech rejects PCM without rate", async () => {
    const { fetch } = stubFetch(() => speechAnswer("audio/L16;codec=pcm", new Uint8Array(480)));
    const error = await rejection(createModelClient(config, { fetch }).synthesizeSpeech(speechRequest));
    expect(error).toBeInstanceOf(UnsupportedAudioFormatError);
    expect(error).toMatchObject({ modelId: "m-tts", usage: null });
  });

  it("synthesizeSpeech missing inlineData throws ModelOutputError", async () => {
    const { fetch } = stubFetch(() => json({ candidates: [{ content: { parts: [{ text: "no audio" }] } }] }));
    const error = await rejection(createModelClient(config, { fetch }).synthesizeSpeech(speechRequest));
    expect(error).toBeInstanceOf(ModelOutputError);
    expect(error).toMatchObject({ modelId: "m-tts", usage: null });
  });

  it("synthesizeSpeech 429 is retryable", async () => {
    const { fetch } = stubFetch(() => json({ error: { message: "quota" } }, 429));
    const error = await rejection(createModelClient(config, { fetch }).synthesizeSpeech(speechRequest));
    expect(error).toBeInstanceOf(ModelHttpError);
    expect(error).toMatchObject({ status: 429, retryable: true });
  });

  it("SYS-05.S4 synthesizeSpeech in development posts to Google AI Studio directly", async () => {
    const devConfig = loadModelConfig({
      ...baseEnv,
      OPENAI_BASE_URL: "http://127.0.0.1:3425/v1",
      TTS_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
    });
    const { fetch, calls } = stubFetch(() => speechAnswer("audio/L16;rate=24000", new Uint8Array(480)));
    await createModelClient(devConfig, { fetch }).synthesizeSpeech(speechRequest);
    expect(calls.map((call) => call.url)).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/models/m-tts:generateContent",
    ]);
  });

  it("SYS-05.S5 synthesizeSpeech on Cloudflare posts to AI Gateway google-ai-studio", async () => {
    const gateway = "https://gateway.ai.cloudflare.com/v1/acct/gw";
    const cfConfig = loadModelConfig({
      ...baseEnv,
      OPENAI_BASE_URL: `${gateway}/openrouter`,
      TTS_BASE_URL: `${gateway}/google-ai-studio/v1beta`,
    });
    const { fetch, calls } = stubFetch(() => speechAnswer("audio/L16;rate=24000", new Uint8Array(480)));
    await createModelClient(cfConfig, { fetch }).synthesizeSpeech(speechRequest);
    expect(calls.map((call) => call.url)).toEqual([
      `${gateway}/google-ai-studio/v1beta/models/m-tts:generateContent`,
    ]);
  });
});

it("sends cf-aig-authorization when AI_GATEWAY_TOKEN is set", async () => {
  const answer = (call: { url: string }) =>
    call.url.endsWith("/chat/completions")
      ? chatAnswer("{}")
      : speechAnswer("audio/L16;rate=24000", new Uint8Array(480));

  const withToken = stubFetch(answer);
  const tokenClient = createModelClient(loadModelConfig({ ...baseEnv, AI_GATEWAY_TOKEN: "t" }), {
    fetch: withToken.fetch,
  });
  await tokenClient.generateJson(jsonRequest);
  await tokenClient.synthesizeSpeech(speechRequest);
  expect(withToken.calls.map((call) => call.headers.get("cf-aig-authorization"))).toEqual([
    "Bearer t",
    "Bearer t",
  ]);

  const without = stubFetch(answer);
  const plainClient = createModelClient(config, { fetch: without.fetch });
  await plainClient.generateJson(jsonRequest);
  await plainClient.synthesizeSpeech(speechRequest);
  expect(without.calls.map((call) => call.headers.has("cf-aig-authorization"))).toEqual([false, false]);
});

// A 2xx answer whose body fails while it is read.
function brokenBody(): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.error(new TypeError("terminated"));
    },
  });
  return new Response(stream, { status: 200 });
}

describe("body read after a 2xx", () => {
  it("generateJson body read failure is retryable status 0", async () => {
    const { fetch } = stubFetch(() => brokenBody());
    const error = await rejection(createModelClient(config, { fetch }).generateJson(jsonRequest));
    expect(error).toBeInstanceOf(ModelHttpError);
    expect(error).toMatchObject({ status: 0, retryable: true });
  });

  it("generateJson body that is not JSON throws ModelOutputError", async () => {
    const { fetch } = stubFetch(() => new Response("<html>ok</html>", { status: 200 }));
    const error = await rejection(createModelClient(config, { fetch }).generateJson(jsonRequest));
    expect(error).toBeInstanceOf(ModelOutputError);
    expect(error).toMatchObject({ modelId: "m-scene" });
  });

  it("synthesizeSpeech body read failure is retryable status 0", async () => {
    const { fetch } = stubFetch(() => brokenBody());
    const error = await rejection(createModelClient(config, { fetch }).synthesizeSpeech(speechRequest));
    expect(error).toBeInstanceOf(ModelHttpError);
    expect(error).toMatchObject({ status: 0, retryable: true });
  });

  it("synthesizeSpeech body that is not JSON throws ModelOutputError", async () => {
    const { fetch } = stubFetch(() => new Response("<html>ok</html>", { status: 200 }));
    const error = await rejection(createModelClient(config, { fetch }).synthesizeSpeech(speechRequest));
    expect(error).toBeInstanceOf(ModelOutputError);
    expect(error).toMatchObject({ modelId: "m-tts" });
  });
});
