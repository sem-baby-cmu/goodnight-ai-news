export type ModelConfig = {
  baseUrl: string; // OpenAI-compatible text API: AI Gateway to OpenRouter, or the local gateway
  apiKey: string;
  gatewayToken?: string; // AI Gateway token, sent as cf-aig-authorization on both routes
  models: { script: string; scene: string; tts: string }; // model IDs from env
  tts: { baseUrl: string; apiKey: string; voice: string }; // Google AI Studio, directly or through AI Gateway
};

const REQUIRED = [
  "OPENAI_BASE_URL",
  "OPENAI_API_KEY",
  "MODEL_SCRIPT",
  "MODEL_SCENE",
  "MODEL_TTS",
  "TTS_BASE_URL",
  "TTS_API_KEY",
  "TTS_VOICE",
] as const;

type RequiredName = (typeof REQUIRED)[number];

function stripSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

// Reads the model configuration from environment variables. Throws one error
// that names every missing or empty variable. Values never appear in errors.
export function loadModelConfig(env: Record<string, string | undefined>): ModelConfig {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error("Missing environment variables: " + missing.join(", "));
  }
  const value = (name: RequiredName) => env[name] as string;
  const config: ModelConfig = {
    baseUrl: stripSlash(value("OPENAI_BASE_URL")),
    apiKey: value("OPENAI_API_KEY"),
    models: { script: value("MODEL_SCRIPT"), scene: value("MODEL_SCENE"), tts: value("MODEL_TTS") },
    tts: { baseUrl: stripSlash(value("TTS_BASE_URL")), apiKey: value("TTS_API_KEY"), voice: value("TTS_VOICE") },
  };
  if (env.AI_GATEWAY_TOKEN) config.gatewayToken = env.AI_GATEWAY_TOKEN;
  return config;
}
