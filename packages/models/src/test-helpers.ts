// Shared helpers for the tests of this package. Not exported from index.ts.

export const baseEnv: Record<string, string> = {
  OPENAI_BASE_URL: "https://text.example/v1",
  OPENAI_API_KEY: "k",
  MODEL_SCRIPT: "m-script",
  MODEL_SCENE: "m-scene",
  MODEL_TTS: "m-tts",
  TTS_BASE_URL: "https://tts.example/v1beta",
  TTS_API_KEY: "tk",
  TTS_VOICE: "Kore",
};

export type Call = { url: string; headers: Headers; body: unknown };

// A fetch stub that records every call and answers with `respond`.
export function stubFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

// A Gemini generateContent answer with one inline audio part.
export function speechAnswer(mimeType: string, bytes: Uint8Array): Response {
  return json({
    candidates: [{ content: { parts: [{ inlineData: { mimeType, data: toBase64(bytes) } }] } }],
  });
}

export function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
