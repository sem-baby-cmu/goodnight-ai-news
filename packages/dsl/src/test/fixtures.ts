import type { AssetManifest, PoseEntry, RegistrySnapshot } from "../registry";
import type { PageScene } from "../schemas";
import type { LayoutTemplate } from "../template";

// Shared test data. Every function returns a fresh copy, so a test can
// change it freely.

export const PIP_ID = "01900000-0000-7000-8000-000000000001";
export const OWL_ID = "01900000-0000-7000-8000-000000000002";
export const BALL_ID = "01900000-0000-7000-8000-000000000003";
export const TREE_ID = "01900000-0000-7000-8000-000000000004";
export const NEW_ID = "01900000-0000-7000-8000-0000000000ff";

const box = { x: 0, y: 0, w: 100, h: 200 };
const foot = { x: 50, y: 200 };
const face = { x: 25, y: 10, w: 50, h: 50 };

function pose(id: string, extra: Partial<PoseEntry> = {}): PoseEntry {
  return { id, file: `${id}.svg`, foot, box, ...extra };
}

function pipManifest(): AssetManifest {
  return {
    kind: "character",
    // `bust` and `front` exist for the slot pose tests (R35).
    poses: [pose("stand", { face }), pose("wave", { face }), pose("bust", { face }), pose("front", { face })],
    expressions: ["happy", "sad"],
    legal: [
      { pose: "stand", expression: "happy" },
      { pose: "stand", expression: "sad" },
      { pose: "wave", expression: "happy" },
      { pose: "bust", expression: "happy" },
      { pose: "front", expression: "happy" },
    ],
    flippable: true,
    parts: ["part-eyes", "part-arm-left"],
  };
}

export function registry(): RegistrySnapshot {
  return {
    assets: {
      pip: { kind: "character", renderer: "svg-rig", version: 1, manifest: pipManifest() },
      owl: {
        kind: "character",
        renderer: "webp",
        version: 1,
        manifest: {
          kind: "character",
          poses: [pose("perch", { file: "perch-calm.webp", face, expression: "calm" })],
          expressions: ["calm"],
          legal: [{ pose: "perch", expression: "calm" }],
          flippable: false,
        },
      },
      tree: {
        kind: "scenery",
        renderer: "svg",
        version: 1,
        manifest: { kind: "scenery", poses: [pose("default")], expressions: [], legal: [], flippable: false },
      },
      ball: {
        kind: "prop",
        renderer: "webp",
        version: 1,
        manifest: {
          kind: "prop",
          poses: [pose("default", { file: "default.webp" })],
          expressions: [],
          legal: [],
          flippable: false,
        },
      },
      boing: {
        kind: "sfx",
        renderer: "audio",
        version: 1,
        manifest: { kind: "sfx", file: "boing.mp3", durationMs: 400 },
      },
    },
  };
}

export function twoFriends(): LayoutTemplate {
  return {
    id: "two-friends",
    stage: { width: 1600, height: 1200 },
    slots: [
      { id: "left", accepts: "character", footX: 500, footY: 1100, height: 700, minScale: 0.8, z: 2 },
      { id: "right", accepts: "character", footX: 1100, footY: 1100, height: 700, minScale: 0.8, z: 2 },
      { id: "ground-1", accepts: "prop", footX: 800, footY: 1150, height: 200, minScale: 0.7, z: 3 },
      { id: "sky-1", accepts: "scenery", footX: 800, footY: 600, height: 500, minScale: 0.7, z: 1 },
    ],
  };
}

// A template with a bust slot, for the slot pose tests (R35).
export function soloCenter(): LayoutTemplate {
  return {
    id: "solo-center",
    stage: { width: 1600, height: 1200 },
    slots: [
      {
        id: "bust",
        accepts: "character",
        footX: 800,
        footY: 1200,
        height: 900,
        minScale: 0.8,
        z: 2,
        poses: ["bust"],
      },
    ],
  };
}

export function ctx(): { registry: RegistrySnapshot; templates: LayoutTemplate[] } {
  return { registry: registry(), templates: [twoFriends()] };
}

export function validScene(): PageScene {
  return {
    templateId: "two-friends",
    sky: "day",
    layers: [
      { instanceId: PIP_ID, kind: "character", ref: "pip", pose: "stand", expression: "happy", slot: "left" },
      { instanceId: OWL_ID, kind: "character", ref: "owl", pose: "perch", expression: "calm", slot: "right" },
      { instanceId: BALL_ID, kind: "prop", ref: "ball", pose: "default", slot: "ground-1" },
      { instanceId: TREE_ID, kind: "scenery", ref: "tree", pose: "default", slot: "sky-1" },
    ],
    animations: [{ target: PIP_ID, primitive: "float", params: { amplitude: 0.01, period: 4 }, trigger: "loop" }],
    interactions: [
      {
        on: { tap: PIP_ID },
        do: [
          { action: "play_animation", target: PIP_ID, primitive: "pop" },
          { action: "play_sfx", sfx: "boing" },
          { action: "show_bubble", target: PIP_ID, text: "Hello, friend!" },
          { action: "set_expression", target: PIP_ID, expression: "sad" },
          { action: "set_pose", target: PIP_ID, pose: "wave" },
        ],
      },
    ],
  };
}
