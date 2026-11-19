import {
  type AssetManifest,
  type PageScene,
  type ReleaseManifest,
  ReleaseManifestSchema,
  type ReleasePage,
  ReleasePageSchema,
} from "@storybook/dsl";

export type ReleaseAsset = { renderer: string; manifest: AssetManifest; base: string };

// The page JSON of a release (design "Release layout"). Paths are relative to
// the release root. A parse failure is a bug, not a user error, so it throws.
export function buildReleasePage(input: {
  pageId: string;
  text: string;
  audio: string;
  scene: PageScene;
  assets: Record<string, ReleaseAsset>;
}): ReleasePage {
  return ReleasePageSchema.parse({
    pageId: input.pageId,
    text: input.text,
    audio: input.audio,
    scene: input.scene,
    assets: input.assets,
  });
}

export function buildManifest(input: {
  storyId: string;
  releaseId: string;
  number: number;
  title: string;
  pageIds: string[];
}): ReleaseManifest {
  return ReleaseManifestSchema.parse({
    format: "storybook-mvp",
    formatVersion: 1,
    storyId: input.storyId,
    releaseId: input.releaseId,
    number: input.number,
    title: input.title,
    pages: input.pageIds.map((pageId) => ({ pageId, json: `pages/${pageId}.json` })),
  });
}
