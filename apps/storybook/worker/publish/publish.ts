import type { AssetManifest, Outline, PageScene } from "@storybook/dsl";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type Db, getDb } from "../db/client";
import { newId } from "../db/ids";
import { type PageState, assetKeysOfScene, pageStates } from "../db/staleness";
import { loadStoryHeads } from "../db/stories";
import { type HeadKey, type RevisionRow, asset, assetVersion, release, story } from "../db/schema";
import { type ReleaseAsset, buildManifest, buildReleasePage } from "./build";
import { COPY_CONCURRENCY, copyObject, inPool } from "./copy";

export type BlockingItem = {
  pageId: string | null;
  page: number | null;
  target: "outline" | "page_text" | "scene" | "audio";
  reason: "missing" | "needs_review" | "stale";
  message: string;
};

export type PublishResult =
  | { ok: true; releaseId: string; number: number; manifestKey: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "blocked"; blocking: BlockingItem[] }
  | { ok: false; reason: "conflict" };

// Every file that a manifest names.
function manifestFiles(m: AssetManifest): string[] {
  return m.kind === "sfx" ? [m.file] : [...new Set(m.poses.map((p) => p.file))];
}

const LABEL = { page_text: "text", scene: "scene", audio: "audio" } as const;

// What stops a publish. It never reads revision content, so a provider-error
// head (`needs_review`, content null) blocks like any other (R26).
export function blockingItems(outline: Outline | null, states: PageState[]): BlockingItem[] {
  if (!outline) return [{ pageId: null, page: null, target: "outline", reason: "missing", message: "missing outline" }];
  if (outline.pages.length === 0) {
    return [{ pageId: null, page: null, target: "outline", reason: "missing", message: "outline has no pages" }];
  }
  return states
    .filter((s) => s.state !== "ok")
    .flatMap((s) =>
      s.problems.map((p) => ({
        pageId: s.pageId,
        page: s.number,
        target: p.target,
        reason: p.reason,
        message: `page ${s.number}: ${p.reason} ${LABEL[p.target]}`,
      })),
    );
}

// The pointer moves only to a release of the same story with a higher
// number, so a late, older publish cannot move it back. The number comes from
// the release row, not from the caller; without a release row of this story,
// nothing changes. It sets `status = published` in the same statement.
function pointerUpdate(db: Db, storyId: string, releaseId: string) {
  const number = sql`(SELECT n.number FROM release n WHERE n.id = ${releaseId} AND n.story_id = ${storyId})`;
  return db
    .update(story)
    .set({ publishedReleaseId: releaseId, status: "published" })
    .where(
      and(
        eq(story.id, storyId),
        sql`${number} IS NOT NULL`,
        sql`(story.published_release_id IS NULL OR (SELECT r.number FROM release r WHERE r.id = story.published_release_id) < ${number})`,
      ),
    );
}

// Returns true when the pointer moved.
export async function movePointer(db: Db, storyId: string, releaseId: string): Promise<boolean> {
  const result = await pointerUpdate(db, storyId, releaseId).run();
  return result.meta.changes === 1;
}

const NUMBER_CONFLICT = /UNIQUE constraint failed: release\.story_id, release\.number/;

function isNumberConflict(err: unknown): boolean {
  const e = err as { message?: unknown; cause?: { message?: unknown } } | null;
  return [e?.message, e?.cause?.message].some((m) => typeof m === "string" && NUMBER_CONFLICT.test(m));
}

function headRevision(heads: Partial<Record<HeadKey, string>>, revisions: Map<string, RevisionRow>, key: HeadKey): RevisionRow {
  const id = heads[key];
  const rev = id === undefined ? undefined : revisions.get(id);
  if (!rev) throw new Error(`head revision missing: ${key}`);
  return rev;
}

// Publishes the story from one snapshot of its heads (design "7. Publish").
// Order: block check, asset copies, audio copies, page JSON, manifest, then
// one D1 batch with the release row and the pointer.
export async function publishStory(env: Env, storyId: string): Promise<PublishResult> {
  const db = getDb(env.DB);
  const loaded = await loadStoryHeads(db, storyId);
  if (!loaded) return { ok: false, reason: "not_found" };
  const { heads, headsVersion } = loaded.story;
  const { revisions } = loaded;

  // 1. Block before any write.
  const outlineRev = heads.outline === undefined ? undefined : revisions.get(heads.outline);
  // An outline head that needs review has no usable page list (implementation
  // decision: it blocks as one outline item).
  if (outlineRev?.status === "needs_review") {
    const message = "needs_review outline";
    return { ok: false, reason: "blocked", blocking: [{ pageId: null, page: null, target: "outline", reason: "needs_review", message }] };
  }
  const outline = (outlineRev?.content as Outline | undefined) ?? null;
  const pageIds = outline?.pages.map((p) => p.pageId) ?? [];
  const blocking = blockingItems(outline, outline ? pageStates({ pageIds, heads, revisions }) : []);
  if (blocking.length > 0) return { ok: false, reason: "blocked", blocking };

  // 2. Release number and prefix.
  const [max] = await db
    .select({ next: sql<number>`COALESCE(MAX(${release.number}), 0) + 1` })
    .from(release)
    .where(eq(release.storyId, storyId));
  const number = Number(max!.next);
  const releaseId = newId();
  const root = `releases/${releaseId}/`;

  const pages = pageIds.map((pageId) => {
    const scene = headRevision(heads, revisions, `scene:${pageId}`);
    const content = scene.content as PageScene;
    const versions = scene.assetVersions ?? {};
    const keys = assetKeysOfScene(content);
    for (const key of keys) if (versions[key] === undefined) throw new Error(`asset version missing for ${key}`);
    return {
      pageId,
      text: (headRevision(heads, revisions, `page_text:${pageId}`).content as { text: string }).text,
      audio: headRevision(heads, revisions, `audio:${pageId}`),
      scene: content,
      assets: keys.map((key) => ({ key, version: versions[key]! })),
    };
  });

  // 3. Asset versions that the snapshot scenes record (Q3).
  const wanted = new Map<string, { key: string; version: number }>();
  for (const p of pages) for (const a of p.assets) wanted.set(`${a.key}@${a.version}`, a);
  const rows = wanted.size
    ? await db
        .select({
          key: asset.key,
          version: assetVersion.version,
          renderer: assetVersion.renderer,
          manifest: assetVersion.manifest,
          r2Prefix: assetVersion.r2Prefix,
        })
        .from(assetVersion)
        .innerJoin(asset, eq(asset.id, assetVersion.assetId))
        .where(inArray(asset.key, [...new Set([...wanted.values()].map((a) => a.key))]))
    : [];
  const byVersion = new Map(rows.map((r) => [`${r.key}@${r.version}`, r]));
  const releaseAssets = new Map<string, ReleaseAsset>();
  for (const [id, a] of wanted) {
    const row = byVersion.get(id);
    if (!row) throw new Error(`asset version not found: ${a.key} v${a.version}`);
    if (!row.r2Prefix.startsWith("assets/") || !row.r2Prefix.endsWith("/")) {
      throw new Error(`asset prefix must start with assets/ and end with /: ${row.r2Prefix}`);
    }
    releaseAssets.set(id, { renderer: row.renderer, manifest: row.manifest, base: row.r2Prefix });
  }
  // Only the files that each manifest names; a missing one throws before any
  // D1 write.
  const files = [...releaseAssets.values()].flatMap((a) => manifestFiles(a.manifest).map((file) => a.base + file));
  await inPool([...new Set(files)], COPY_CONCURRENCY, (key) => copyObject(env.BUCKET, key, root + key));

  // 4. Audio.
  const audioPaths = new Map<string, string>();
  await inPool(pages, COPY_CONCURRENCY, async (p) => {
    const src = p.audio.r2Key;
    const ext = src?.match(/\.([a-z0-9]+)$/i)?.[1];
    if (!src || !ext) throw new Error(`audio key without an extension: ${src}`);
    const path = `audio/${p.pageId}.${ext}`;
    await copyObject(env.BUCKET, src, root + path);
    audioPaths.set(p.pageId, path);
  });

  // 5. Page JSON.
  const json = { httpMetadata: { contentType: "application/json" } };
  for (const p of pages) {
    const assets: Record<string, ReleaseAsset> = {};
    for (const a of p.assets) assets[a.key] = releaseAssets.get(`${a.key}@${a.version}`)!;
    const page = buildReleasePage({ pageId: p.pageId, text: p.text, audio: audioPaths.get(p.pageId)!, scene: p.scene, assets });
    await env.BUCKET.put(`${root}pages/${p.pageId}.json`, JSON.stringify(page), json);
  }

  // 6. Manifest last.
  const manifestKey = `${root}manifest.json`;
  const manifest = buildManifest({ storyId, releaseId, number, title: outline!.title, pageIds });
  await env.BUCKET.put(manifestKey, JSON.stringify(manifest), json);

  // 7. Release row and pointer in one batch. A lost number race rolls back.
  try {
    await db.batch([
      db.insert(release).values({
        id: releaseId,
        storyId,
        number,
        manifestKey,
        snapshot: { heads, headsVersion },
        createdAt: new Date().toISOString(),
      }),
      pointerUpdate(db, storyId, releaseId),
    ]);
  } catch (err) {
    if (isNumberConflict(err)) return { ok: false, reason: "conflict" };
    throw err;
  }
  return { ok: true, releaseId, number, manifestKey };
}
