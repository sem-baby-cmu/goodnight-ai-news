import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb, loadActiveRegistry } from "../db";
import { seedRegistry } from "../test/fixtures";
import { seams } from "./seams";

const MODEL_ENV = {
  OPENAI_BASE_URL: "https://text.example/v1",
  OPENAI_API_KEY: "test-key",
  MODEL_SCRIPT: "m-script",
  MODEL_SCENE: "m-scene",
  MODEL_TTS: "m-tts",
  TTS_BASE_URL: "https://tts.example/v1beta",
  TTS_API_KEY: "test-tts-key",
  TTS_VOICE: "Kore",
};

const request = { model: "script" as const, system: "s", user: "u", schema: { type: "object" } };

afterEach(() => vi.restoreAllMocks());

describe("seams.modelClient", () => {
  it("seams.modelClient with no MODEL_MODE builds the real client from env", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ model: "m-script", choices: [{ message: { content: '{"ok":true}' } }] }),
    );
    const real = { ...env, ...MODEL_ENV, MODEL_MODE: undefined };
    const answer = await seams.modelClient(real, { registry }).generateJson(request);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(`${MODEL_ENV.OPENAI_BASE_URL}/chat/completions`);
    // The stub answers with model ID "stub" and a script draft.
    expect(answer.modelId).toBe("m-script");
    expect(answer.value).toEqual({ ok: true });
  });

  it('seams.modelClient with MODEL_MODE="stub" gives the stub and makes no fetch', async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const answer = await seams.modelClient({ ...env, MODEL_MODE: "stub" }, { registry }).generateJson(request);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(answer.modelId).toBe("stub");
  });
});
