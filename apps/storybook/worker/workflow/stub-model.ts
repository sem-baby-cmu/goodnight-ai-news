import { PRIMITIVES, type RegistrySnapshot, type SceneDraft, type ScriptDraft } from "@storybook/dsl";
import { TEMPLATES } from "@storybook/layout";
import { type ModelClient, pcmToWav } from "@storybook/models";

// A model client with fixed answers (implementation decisions R12, R12b).
// `MODEL_MODE=stub` uses it with no plan; tests use it through `seams`.
// Non-test code: it imports nothing from test files.

type Speech = { bytes: Uint8Array; contentType: string; durationMs: number };

// One planned answer: a JSON value, a speech result, or an error to throw.
// `undefined` from a plan entry gives the default answer.
export type StubAnswer = { value: unknown } | { speech: Speech } | { error: unknown };

// Key: "script" | "scene:<n>" | "audio:<n>", where <n> is the 1-based page
// number. The function gets the attempt number of that key (1-based).
export type StubPlan = Record<string, (attempt: number) => StubAnswer | undefined>;

export type StubModel = {
  client: ModelClient;
  // Calls that returned a value, by key.
  answered: Record<string, number>;
  // All invocations, also those that threw, by key.
  attempts: Record<string, number>;
  // The largest number of scene and audio calls in progress at the same time.
  readonly maxInFlight: number;
};

const sortedKeys = (registry: RegistrySnapshot, kind: string) =>
  Object.keys(registry.assets)
    .filter((key) => registry.assets[key]!.kind === kind)
    .sort();

const SENTENCES = [
  "A small bear hears some good news.",
  "The bear tells a bunny friend.",
  "They walk to the park together.",
  "Many friends come to listen.",
  "Everyone smiles and claps.",
  "The day ends with a happy song.",
  "The stars come out at night.",
  "The friends go home to sleep.",
];

// The default script: `pages` pages with texts "Page <n>. <one short sentence>.".
export function stubScript(registry: RegistrySnapshot, pages = 6): ScriptDraft {
  const cast = sortedKeys(registry, "character").slice(0, 1);
  return {
    title: "The good news",
    cast,
    pages: Array.from({ length: pages }, (_, i) => ({
      beat: `Beat ${i + 1}: the friends share the news.`,
      text: `Page ${i + 1}. ${SENTENCES[i % SENTENCES.length]}`,
    })),
  };
}

// The default scene: the first template with a character slot. For each slot,
// the first key in sorted order of the matching kind that has a legal pose
// and expression pair. Slots that list `poses` stay empty, and a pose that
// some slot lists is never used (implementation decision R35). One `float`
// animation and one tap that plays the first sfx key.
export function stubScene(registry: RegistrySnapshot): SceneDraft {
  const template = TEMPLATES.find((t) => t.slots.some((s) => s.accepts === "character"));
  if (!template) throw new Error("stub: no template with a character slot");
  const reserved = new Set(TEMPLATES.flatMap((t) => t.slots.flatMap((s) => s.poses ?? [])));
  const layers: SceneDraft["layers"] = [];
  for (const slot of template.slots) {
    if (slot.poses) continue;
    for (const key of sortedKeys(registry, slot.accepts)) {
      const manifest = registry.assets[key]!.manifest;
      if (manifest.kind === "sfx") continue;
      const pair = manifest.legal.find((p) => !reserved.has(p.pose));
      if (!pair) continue;
      layers.push({ kind: slot.accepts, ref: key, pose: pair.pose, expression: pair.expression, slot: slot.id, flip: false });
      break;
    }
  }
  const first = layers[0];
  if (!first) throw new Error("stub: no asset with a legal pose and expression pair");
  const sfx = sortedKeys(registry, "sfx")[0];
  if (!sfx) throw new Error("stub: no sfx asset");
  return {
    templateId: template.id,
    sky: "day",
    layers,
    animations: [{ target: first.slot, primitive: "float", params: { ...PRIMITIVES.float.defaults }, trigger: "loop" }],
    interactions: [
      {
        on: { tap: first.slot },
        do: [{ action: "play_sfx", sfx }],
      },
    ],
  };
}

// 1 s of a 440 Hz sine tone at amplitude 0.2: 24 kHz, mono, 16-bit WAV
// (implementation decision R49).
export function stubSpeech(): Speech {
  const rate = 24_000;
  const pcm = new Uint8Array(rate * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < rate; i++) {
    view.setInt16(i * 2, Math.round(0.2 * 32767 * Math.sin((2 * Math.PI * 440 * i) / rate)), true);
  }
  return { bytes: pcmToWav(pcm, rate, 1), contentType: "audio/wav", durationMs: 1000 };
}

function pageNumber(text: string): number {
  const match = /Page (\d+)\./.exec(text);
  if (!match) throw new Error("stub: no page number in the request");
  return Number(match[1]);
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function createStubModel(opts: { registry: RegistrySnapshot; plan?: StubPlan }): StubModel {
  const answered: Record<string, number> = {};
  const attempts: Record<string, number> = {};
  let inFlight = 0;
  let maxInFlight = 0;

  // Counts the call, runs the plan entry, and falls back to the default.
  async function answer<T>(key: string, parallel: boolean, fallback: () => T, pick: (a: StubAnswer) => T): Promise<T> {
    const attempt = (attempts[key] = (attempts[key] ?? 0) + 1);
    if (parallel) {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
    }
    try {
      if (parallel) await tick();
      const planned = opts.plan?.[key]?.(attempt);
      if (planned && "error" in planned) throw planned.error;
      const result = planned ? pick(planned) : fallback();
      answered[key] = (answered[key] ?? 0) + 1;
      return result;
    } finally {
      if (parallel) inFlight--;
    }
  }

  const client: ModelClient = {
    async generateJson(req) {
      const key = req.model === "script" ? "script" : `scene:${pageNumber(req.user)}`;
      const value = await answer<unknown>(
        key,
        req.model === "scene",
        () => (req.model === "script" ? stubScript(opts.registry) : stubScene(opts.registry)),
        (a) => {
          if (!("value" in a)) throw new Error(`stub: plan for ${key} is not a JSON value`);
          return a.value;
        },
      );
      return { value: structuredClone(value), usage: { inputTokens: 0, outputTokens: 0 }, modelId: "stub" };
    },
    async synthesizeSpeech(req) {
      const key = `audio:${pageNumber(req.text)}`;
      return answer<Speech>(key, true, stubSpeech, (a) => {
        if (!("speech" in a)) throw new Error(`stub: plan for ${key} is not a speech result`);
        return a.speech;
      });
    },
  };

  return {
    client,
    answered,
    attempts,
    get maxInFlight() {
      return maxInFlight;
    },
  };
}
