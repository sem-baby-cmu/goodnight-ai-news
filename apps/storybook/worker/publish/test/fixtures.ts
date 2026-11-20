import type { Outline, PageScene } from "@storybook/dsl";
import { getDb } from "../../db/client";
import { commitHead } from "../../db/heads";
import { newId } from "../../db/ids";
import { insertRevisions } from "../../db/revisions";
import type { ExpectedHeads, HeadKey, Heads, NewRevision } from "../../db/schema";
import { createStory } from "../../db/stories";
import { SOURCE, seedRegistry } from "../../test/fixtures";

export type PublishableOptions = {
  pages?: number;
  missingAudioPage?: number;
  needsReviewScenePage?: number;
  staleScenePage?: number;
  missingTextPage?: number;
  missingScenePage?: number;
  staleAudioPage?: number;
};

export type PublishableStory = {
  storyId: string;
  pageIds: string[];
  outlineId: string;
  // Page ID -> revision ID, for each head that the fixture moved.
  text: Record<string, string>;
  scene: Record<string, string>;
  audio: Record<string, string>;
};

// The asset versions that every seeded scene records.
export const SCENE_ASSET_VERSIONS = { "test-bear": 1, "test-ball": 1, "test-pop": 1, meadow: 1 };

// A scene in which every layer has `at`, with one `play_sfx test-pop` tap.
export function testScene(): PageScene {
  const bear = newId();
  const ball = newId();
  return {
    templateId: "two-friends",
    backdrop: "meadow",
    sky: "night",
    layers: [
      {
        instanceId: bear,
        kind: "character",
        ref: "test-bear",
        pose: "stand",
        expression: "happy",
        slot: "left",
        at: { x: 0.3, y: 0.9, scale: 1, z: 1 },
      },
      { instanceId: ball, kind: "prop", ref: "test-ball", slot: "ground", at: { x: 0.7, y: 0.9, scale: 0.5, z: 2 } },
    ],
    animations: [{ target: bear, primitive: "float", params: { amplitude: 0.007, period: 4 }, trigger: "loop" }],
    interactions: [{ on: { tap: ball }, do: [{ action: "play_sfx", sfx: "test-pop" }] }],
  };
}

// 100 bytes, so a range request has room.
const AUDIO_BYTES = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

// A story that publish accepts, unless an option removes a head or makes one
// fail the block rules. Every revision is human (`callId` null). It does not
// run the Workflow.
export async function seedPublishableStory(env: Env, opts: PublishableOptions = {}): Promise<PublishableStory> {
  const db = getDb(env.DB);
  await seedRegistry(env);
  const pages = opts.pages ?? 2;
  const ids = { storyId: newId(), sourceRevisionId: newId(), runId: newId() };
  await createStory(db, { ...ids, source: SOURCE });
  const human = { storyId: ids.storyId, origin: "human" as const, callId: null };

  const pageIds = Array.from({ length: pages }, () => newId());
  const outline: Outline = {
    title: "The Little Test",
    ageBand: "5-7",
    cast: ["test-bear"],
    pages: pageIds.map((pageId, i) => ({ pageId, beat: `Beat ${i + 1}.` })),
  };
  const outlineId = newId();
  const rows: NewRevision[] = [
    { ...human, id: outlineId, kind: "outline", status: "ok", basis: { source: ids.sourceRevisionId }, content: outline },
  ];
  const moves: Heads = { outline: outlineId };
  const result: PublishableStory = { storyId: ids.storyId, pageIds, outlineId, text: {}, scene: {}, audio: {} };

  for (const [i, pageId] of pageIds.entries()) {
    const page = i + 1;
    const textId = newId();
    rows.push({ ...human, id: textId, kind: "page_text", pageId, status: "ok", basis: { outline: outlineId }, content: { text: `Page ${page} text.` } });
    if (opts.missingTextPage !== page) {
      moves[`page_text:${pageId}`] = textId;
      result.text[pageId] = textId;
    }

    const sceneId = newId();
    rows.push({
      ...human,
      id: sceneId,
      kind: "scene",
      pageId,
      status: opts.needsReviewScenePage === page ? "needs_review" : "ok",
      basis: { [`page_text:${pageId}`]: opts.staleScenePage === page ? newId() : textId },
      assetVersions: SCENE_ASSET_VERSIONS,
      content: testScene(),
    });
    if (opts.missingScenePage !== page) {
      moves[`scene:${pageId}`] = sceneId;
      result.scene[pageId] = sceneId;
    }

    if (opts.missingAudioPage !== page) {
      const audioId = newId();
      const r2Key = `calls/${audioId}.wav`;
      await env.BUCKET.put(r2Key, AUDIO_BYTES, { httpMetadata: { contentType: "audio/wav" } });
      rows.push({
        ...human,
        id: audioId,
        kind: "audio",
        pageId,
        status: "ok",
        basis: { [`page_text:${pageId}`]: opts.staleAudioPage === page ? newId() : textId },
        r2Key,
        content: null,
      });
      moves[`audio:${pageId}`] = audioId;
      result.audio[pageId] = audioId;
    }
  }

  await insertRevisions(db, rows);
  const expected: ExpectedHeads = {};
  for (const key of Object.keys(moves) as HeadKey[]) expected[key] = null;
  const moved = await commitHead(db, { storyId: ids.storyId, moves, basis: {}, expected });
  if (moved !== "moved") throw new Error("seedPublishableStory: heads did not move");
  return result;
}
