import type { RegistrySnapshot } from "@storybook/dsl";
import { createModelClient, loadModelConfig, type ModelClient } from "@storybook/models";
import { createStubModel } from "./stub-model";

// The points where a test can stop a step (design "Testing Strategy").
// `after_model_call` is a test seam for SYS-01.S3.
export type FaultPoint = "before_model_call" | "after_model_call" | "after_call_log" | "after_revisions";

export type FaultContext = {
  runId: string;
  storyId: string;
  step: string;
  pageId: string;
  purpose: "first" | "repair";
};

// Test seam (implementation decisions R12, R12b). Production code reads both
// properties at call time; tests replace them and restore the defaults.
export const seams = {
  // `MODEL_MODE` is tested before `loadModelConfig`, so a stub deploy with no
  // model secrets does not throw.
  modelClient: (env: Env, opts: { registry: RegistrySnapshot }): ModelClient =>
    env.MODEL_MODE === "stub"
      ? createStubModel({ registry: opts.registry }).client
      : createModelClient(
          loadModelConfig({
            OPENAI_BASE_URL: env.OPENAI_BASE_URL,
            OPENAI_API_KEY: env.OPENAI_API_KEY,
            MODEL_SCRIPT: env.MODEL_SCRIPT,
            MODEL_SCENE: env.MODEL_SCENE,
            MODEL_TTS: env.MODEL_TTS,
            TTS_BASE_URL: env.TTS_BASE_URL,
            TTS_API_KEY: env.TTS_API_KEY,
            TTS_VOICE: env.TTS_VOICE,
            AI_GATEWAY_TOKEN: env.AI_GATEWAY_TOKEN,
          }),
        ),
  at: async (_point: FaultPoint, _ctx: FaultContext): Promise<void> => {},
};
