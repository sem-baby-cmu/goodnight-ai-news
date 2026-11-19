// Internal: the Gemini generateContent request for TTS, and the decoding of its
// answer. Not exported from index.ts. scripts/probe-tts.ts imports it directly.
import type { ModelConfig } from "./config";
import { ModelOutputError, UnsupportedAudioFormatError } from "./errors";
import { isWav, pcmToWav, wavDurationMs, wavInfo } from "./wav";

const noContext = { modelId: "", usage: null };

export type SpeechRequest = { url: string; init: { method: "POST"; headers: Record<string, string>; body: string } };

export function buildSpeechRequest(config: ModelConfig, req: { text: string; voice: string }): SpeechRequest {
  const headers: Record<string, string> = {
    "x-goog-api-key": config.tts.apiKey,
    "Content-Type": "application/json",
  };
  if (config.gatewayToken) headers["cf-aig-authorization"] = `Bearer ${config.gatewayToken}`;
  return {
    url: `${config.tts.baseUrl}/models/${config.models.tts}:generateContent`,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice } } },
        },
      }),
    },
  };
}

type InlineData = { mimeType?: unknown; data?: unknown };

// The first inline data part of the first candidate, or undefined.
export function findInlineData(json: unknown): InlineData | undefined {
  const parts = (json as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: InlineData }> } }> })
    ?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return undefined;
  return parts.find((part) => part?.inlineData !== undefined)?.inlineData;
}

// Throws ModelOutputError (not a bare DOMException) for invalid base64.
export function base64ToBytes(data: string): Uint8Array {
  let text: string;
  try {
    text = atob(data);
  } catch {
    throw new ModelOutputError("Speech audio data is not valid base64", noContext);
  }
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function mimeParams(mimeType: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of mimeType.split(";").slice(1)) {
    const [key, value] = part.split("=");
    if (key && value !== undefined) params[key.trim()] = value.trim();
  }
  return params;
}

function positiveInteger(text: string | undefined): number | undefined {
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return value > 0 ? value : undefined;
}

// Accepts exactly two shapes: WAV bytes (whatever the MIME type says), or
// 16-bit PCM with `rate=` in the MIME type. Anything else throws. No sample
// rate is ever guessed.
export function decodeSpeechResponse(json: unknown): { bytes: Uint8Array; contentType: "audio/wav"; durationMs: number } {
  const inline = findInlineData(json);
  if (!inline || typeof inline.data !== "string") {
    throw new ModelOutputError("Speech response has no inline audio data", noContext);
  }
  const mimeType = typeof inline.mimeType === "string" ? inline.mimeType : "";
  const raw = base64ToBytes(inline.data);

  if (isWav(raw)) {
    return { bytes: raw, contentType: "audio/wav", durationMs: wavDurationMs(wavInfo(raw)) };
  }

  const lower = mimeType.toLowerCase();
  if (lower.startsWith("audio/l16") || lower.startsWith("audio/pcm")) {
    const params = mimeParams(lower);
    const rate = positiveInteger(params.rate);
    const channels = params.channels === undefined ? 1 : positiveInteger(params.channels);
    if (rate === undefined || channels === undefined) {
      throw new UnsupportedAudioFormatError(`PCM audio without a valid rate or channel count: ${mimeType}`, noContext);
    }
    const bytes = pcmToWav(raw, rate, channels);
    return { bytes, contentType: "audio/wav", durationMs: wavDurationMs(wavInfo(bytes)) };
  }

  throw new UnsupportedAudioFormatError(`Unsupported audio format: ${mimeType || "(no MIME type)"}`, noContext);
}
