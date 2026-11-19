import { describe, expect, it } from "vitest";
import { loadModelConfig } from "./config";
import { baseEnv } from "./test-helpers";

describe("loadModelConfig", () => {
  it("loadModelConfig reads all variables", () => {
    expect(loadModelConfig({ ...baseEnv, AI_GATEWAY_TOKEN: "t" })).toEqual({
      baseUrl: "https://text.example/v1",
      apiKey: "k",
      gatewayToken: "t",
      models: { script: "m-script", scene: "m-scene", tts: "m-tts" },
      tts: { baseUrl: "https://tts.example/v1beta", apiKey: "tk", voice: "Kore" },
    });
    expect(loadModelConfig(baseEnv).gatewayToken).toBeUndefined();
    expect(loadModelConfig({ ...baseEnv, AI_GATEWAY_TOKEN: "" }).gatewayToken).toBeUndefined();
  });

  it("loadModelConfig lists every missing name and no values", () => {
    const env = { OPENAI_API_KEY: "secret-value", MODEL_TTS: "", AI_GATEWAY_TOKEN: "" };
    let message = "";
    try {
      loadModelConfig(env);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(
      "Missing environment variables: OPENAI_BASE_URL, MODEL_SCRIPT, MODEL_SCENE, MODEL_TTS, TTS_BASE_URL, TTS_API_KEY, TTS_VOICE",
    );
    expect(message).not.toContain("secret-value");
    expect(message).not.toContain("AI_GATEWAY_TOKEN");
  });

  it("loadModelConfig strips trailing slash", () => {
    const config = loadModelConfig({
      ...baseEnv,
      OPENAI_BASE_URL: "https://text.example/v1/",
      TTS_BASE_URL: "https://tts.example/v1beta/",
    });
    expect(config.baseUrl).toBe("https://text.example/v1");
    expect(config.tts.baseUrl).toBe("https://tts.example/v1beta");
  });
});
