import { AssetManifestSchema, type AssetManifest } from "@storybook/dsl";
import { type Db, getDb } from "../db/client";
import { newId } from "../db/ids";
import { asset, assetVersion } from "../db/schema";
import { createStory } from "../db/stories";
import { putCall } from "../db/calls";

const box = { x: 0, y: 0, w: 400, h: 800 };
const foot = { x: 200, y: 800 };
const face = { x: 120, y: 60, w: 160, h: 160 };

function characterManifest(): AssetManifest {
  const poses = ["stand", "wave"].flatMap((pose) =>
    ["happy", "calm"].map((expression) => ({ id: pose, file: `${pose}-${expression}.webp`, foot, box, face, expression })),
  );
  return {
    kind: "character",
    poses,
    expressions: ["happy", "calm"],
    legal: ["stand", "wave"].flatMap((pose) => ["happy", "calm"].map((expression) => ({ pose, expression }))),
    flippable: true,
  };
}

const SEED: Array<{ key: string; kind: "character" | "prop" | "scenery" | "sfx"; renderer: "webp" | "audio"; manifest: () => AssetManifest }> = [
  { key: "test-bear", kind: "character", renderer: "webp", manifest: characterManifest },
  { key: "test-bunny", kind: "character", renderer: "webp", manifest: characterManifest },
  {
    key: "test-ball",
    kind: "prop",
    renderer: "webp",
    manifest: () => ({ kind: "prop", poses: [{ id: "default", file: "default.webp", foot, box }], expressions: [], legal: [], flippable: false }),
  },
  {
    key: "test-tree",
    kind: "scenery",
    renderer: "webp",
    manifest: () => ({ kind: "scenery", poses: [{ id: "default", file: "default.webp", foot, box }], expressions: [], legal: [], flippable: false }),
  },
  { key: "test-pop", kind: "sfx", renderer: "audio", manifest: () => ({ kind: "sfx", file: "pop.mp3", durationMs: 300 }) },
];

function manifestFiles(m: AssetManifest): string[] {
  return m.kind === "sfx" ? [m.file] : [...new Set(m.poses.map((p) => p.file))];
}

// Inserts one active version of each test asset, and one small R2 object per
// manifest file. Safe to call more than once.
export async function seedRegistry(env: Env): Promise<void> {
  const db = getDb(env.DB);
  const createdAt = new Date().toISOString();
  for (const s of SEED) {
    const manifest = AssetManifestSchema.parse(s.manifest());
    await db.insert(asset).values({ id: newId(), key: s.key, kind: s.kind, name: s.key, createdAt }).onConflictDoNothing();
    const row = await db.query.asset.findFirst({ where: (a, { eq }) => eq(a.key, s.key) });
    const r2Prefix = `assets/${s.key}/v1/`;
    await db
      .insert(assetVersion)
      .values({ id: newId(), assetId: row!.id, version: 1, renderer: s.renderer, manifest, r2Prefix, active: true, createdAt })
      .onConflictDoNothing();
    for (const file of manifestFiles(manifest)) {
      await env.BUCKET.put(`${r2Prefix}${file}`, new Uint8Array([1, 2, 3]));
    }
  }
}

export const SOURCE = { text: "A short news text.", url: null, words: 4, truncated: false };

// A new story with its source revision and run.
export async function newStory(db: Db) {
  const ids = { storyId: newId(), sourceRevisionId: newId(), runId: newId() };
  await createStory(db, { ...ids, source: SOURCE });
  return ids;
}

// A stored call for `step` and `pageId` in `runId`. Returns its call ID.
export async function newCall(db: Db, runId: string, step: string, pageId = ""): Promise<string> {
  const callId = newId();
  await putCall(db, {
    callId,
    runId,
    step,
    pageId,
    purpose: "first",
    result: { ok: true },
    basis: {},
    expectedHeads: {},
    model: "test-model",
    createdAt: new Date().toISOString(),
  });
  return callId;
}
