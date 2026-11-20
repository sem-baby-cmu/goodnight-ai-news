import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

// The `worker` project loads `apps/storybook/.dev.vars` (wrangler
// `getVarsForDev`), which may hold real keys and `MODEL_MODE=real`. Its
// miniflare bindings in vitest.config.ts replace those values, so a worker
// test can never reach a model or TTS provider by accident (#73). A test that
// needs the real client passes its own env object.
it("worker tests run with MODEL_MODE stub and no provider keys", () => {
  expect({
    MODEL_MODE: env.MODEL_MODE,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
    TTS_BASE_URL: env.TTS_BASE_URL,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    TTS_API_KEY: env.TTS_API_KEY,
  }).toEqual({
    MODEL_MODE: "stub",
    OPENAI_BASE_URL: "http://127.0.0.1:9/no-network-in-tests",
    TTS_BASE_URL: "http://127.0.0.1:9/no-network-in-tests",
    OPENAI_API_KEY: "no-key-in-tests",
    TTS_API_KEY: "no-key-in-tests",
  });
});
