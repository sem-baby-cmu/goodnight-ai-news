// Recorded fake data for the S2 driver tests: the D1 rows of one run, in the
// shape that `wrangler d1 execute --json` returns (JSON columns as text).
// No model was called to make them.
import type { RegistrySnapshot } from "@storybook/dsl";
import type { S2Rows } from "../../scripts/s2/rows";

export const RUN_ID = "01900000-0000-7000-8000-00000000a001";
export const STORY_ID = "01900000-0000-7000-8000-00000000a002";
export const OTHER_RUN_CALL = "01900000-0000-7000-8000-00000000a0ff";
export const PAGE = [1, 2, 3, 4, 5, 6].map((n) => `01900000-0000-7000-8000-0000000001a${n}`);
const BEAR = "01900000-0000-7000-8000-0000000002b1";
const BUNNY = "01900000-0000-7000-8000-0000000002b2";

const box = { x: 0, y: 0, w: 400, h: 800 };
const character = {
  kind: "character" as const,
  poses: [{ id: "stand", file: "stand-happy.webp", foot: { x: 200, y: 800 }, box, face: { x: 120, y: 60, w: 160, h: 160 }, expression: "happy" }],
  expressions: ["happy"],
  legal: [{ pose: "stand", expression: "happy" }],
  flippable: true,
};

export function registry(): RegistrySnapshot {
  return {
    assets: {
      bear: { kind: "character", renderer: "webp", version: 1, manifest: character },
      bunny: { kind: "character", renderer: "webp", version: 1, manifest: character },
    },
  };
}

export function okScene(): unknown {
  return {
    templateId: "two-friends",
    sky: "day",
    layers: [
      { instanceId: BEAR, kind: "character", ref: "bear", pose: "stand", expression: "happy", slot: "left" },
      { instanceId: BUNNY, kind: "character", ref: "bunny", pose: "stand", expression: "happy", slot: "right" },
    ],
    animations: [{ target: BEAR, primitive: "float", params: { amplitude: 0.01, period: 4 }, trigger: "loop" }],
    interactions: [{ on: { tap: BEAR }, do: [{ action: "play_animation", target: BEAR, primitive: "pop" }] }],
  };
}

// A scene that parses but names a slot the template does not have.
export function badScene(): unknown {
  const scene = okScene() as { layers: Array<{ slot: string }> };
  scene.layers[1]!.slot = "nowhere";
  return scene;
}

const outline = {
  title: "Two friends and a camera",
  ageBand: "5-7",
  cast: ["bear", "bunny"],
  pages: PAGE.map((pageId, i) => ({ pageId, beat: `Beat ${i + 1}.` })),
};

const usage = (inputTokens: number, outputTokens: number) => JSON.stringify({ inputTokens, outputTokens });
const call = (n: number) => `01900000-0000-7000-8000-0000000003${String(n).padStart(2, "0")}`;
const rev = (n: number) => `01900000-0000-7000-8000-0000000004${String(n).padStart(2, "0")}`;

type Call = S2Rows["calls"][number];
type Revision = S2Rows["revisions"][number];

function c(n: number, step: string, pageId: string, purpose: "first" | "repair", model: string, result: unknown, u: string | null): Call {
  return { call_id: call(n), step, page_id: pageId, purpose, model, usage: u, result: JSON.stringify(result) };
}

function r(n: number, kind: string, pageId: string, status: string, content: unknown, error: unknown, callId: string): Revision {
  return {
    id: rev(n),
    kind,
    page_id: pageId,
    status,
    content: content === null ? null : JSON.stringify(content),
    error: error === null ? null : JSON.stringify(error),
    call_id: callId,
  };
}

// Pages 1 to 6 cover: ok on first try, ok after repair, needs_review after
// repair, provider error, no scene revision, and ok on first try again.
// Rows are not in outline order on purpose.
export function fakeRun(): S2Rows {
  const s = (i: number) => `scene:${PAGE[i]}`;
  const calls: Call[] = [
    c(1, "script", "", "first", "script-model", { answer: outline }, usage(1000, 400)),
    c(12, s(1), PAGE[1]!, "repair", "scene-model", { answer: okScene() }, usage(300, 120)),
    c(11, s(1), PAGE[1]!, "first", "scene-model", { answer: badScene() }, usage(200, 100)),
    c(10, s(0), PAGE[0]!, "first", "scene-model", { answer: okScene() }, usage(200, 100)),
    c(13, s(2), PAGE[2]!, "first", "scene-model", { answer: badScene() }, usage(200, 100)),
    c(14, s(2), PAGE[2]!, "repair", "scene-model", { answer: badScene() }, usage(300, 120)),
    c(15, s(3), PAGE[3]!, "first", "scene-model", { providerError: { status: 503, message: "busy" } }, null),
    c(16, s(5), PAGE[5]!, "first", "scene-model", { answer: okScene() }, usage(200, 100)),
    c(20, `audio:${PAGE[0]}`, PAGE[0]!, "first", "tts-model", { r2Key: "calls/x.wav" }, null),
  ];
  const text = (n: number, i: number) => r(n, "page_text", PAGE[i]!, "ok", { text: `Page ${i + 1} is here.` }, null, call(1));
  const revisions: Revision[] = [
    r(1, "outline", "", "ok", outline, null, call(1)),
    ...PAGE.map((_, i) => text(10 + i, i)),
    r(20, "scene", PAGE[0]!, "ok", okScene(), null, call(10)),
    r(21, "scene", PAGE[1]!, "ok", okScene(), null, call(12)),
    r(22, "scene", PAGE[2]!, "needs_review", badScene(), { issues: [{ path: "layers.1.slot", code: "unknown_slot", message: "x" }] }, call(14)),
    r(23, "scene", PAGE[3]!, "needs_review", null, { providerStatus: 503, message: "busy" }, call(15)),
    r(24, "scene", PAGE[5]!, "ok", okScene(), null, call(16)),
    r(30, "audio", PAGE[0]!, "ok", null, null, call(20)),
  ];
  return {
    runId: RUN_ID,
    storyId: STORY_ID,
    run: {
      status: "needs_review",
      registry: JSON.stringify(registry()),
      created_at: "2026-11-20T10:00:00.000Z",
      finished_at: "2026-11-20T10:04:30.000Z",
    },
    calls,
    revisions,
  };
}
