import {
  manifestFiles,
  type ReleaseManifest,
  ReleaseManifestSchema,
  type ReleasePage,
  ReleasePageSchema,
} from "@storybook/dsl";

// The value of UUID_V7 in worker/publish/content.ts (lower-case UUID v7).
export const RELEASE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function releaseRoot(releaseId: string): string {
  return "/content/releases/" + releaseId + "/";
}

// A path that stays below the release prefix: plain segments only.
export function isSafeRelativePath(path: string): boolean {
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\/?$/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "." && segment !== "..");
}

// The book cannot be shown. The Player shows the Resting state for it.
export class ReleaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseUnavailableError";
  }
}

export type LoadedRelease = { root: string; manifest: ReleaseManifest; pages: ReleasePage[] };

async function getJson(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = init === undefined ? await fetchImpl(url) : await fetchImpl(url, init);
  } catch {
    throw new ReleaseUnavailableError(`${url}: the request failed`);
  }
  if (!response.ok) throw new ReleaseUnavailableError(`${url}: status ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new ReleaseUnavailableError(`${url}: not JSON`);
  }
}

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown, url: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ReleaseUnavailableError(`${url}: schema`);
  return result.data;
}

function checkPage(page: ReleasePage, url: string): void {
  if (!isSafeRelativePath(page.audio)) throw new ReleaseUnavailableError(`${url}: audio path`);
  for (const [key, asset] of Object.entries(page.assets)) {
    if (!isSafeRelativePath(asset.base) || !asset.base.endsWith("/")) {
      throw new ReleaseUnavailableError(`${url}: base of ${key}`);
    }
    for (const file of manifestFiles(asset.manifest)) {
      if (!isSafeRelativePath(file)) throw new ReleaseUnavailableError(`${url}: file of ${key}`);
    }
  }
}

// The manifest is the enforcement point (ADR 0017): it is fetched with
// `no-cache`, and no other release file is requested before it is parsed.
async function loadManifest(releaseId: string, fetchImpl: typeof fetch): Promise<{ root: string; manifest: ReleaseManifest }> {
  if (!RELEASE_ID_RE.test(releaseId)) throw new ReleaseUnavailableError("not a release ID");
  const root = releaseRoot(releaseId);
  const manifestUrl = root + "manifest.json";
  const manifest = parse(ReleaseManifestSchema, await getJson(fetchImpl, manifestUrl, { cache: "no-cache" }), manifestUrl);
  if (manifest.releaseId !== releaseId) throw new ReleaseUnavailableError(`${manifestUrl}: another release`);
  for (const entry of manifest.pages) {
    if (!isSafeRelativePath(entry.json)) throw new ReleaseUnavailableError(`${manifestUrl}: page path`);
  }
  return { root, manifest };
}

async function loadPage(fetchImpl: typeof fetch, root: string, entry: { pageId: string; json: string }): Promise<ReleasePage> {
  const url = root + entry.json;
  const page = parse(ReleasePageSchema, await getJson(fetchImpl, url), url);
  if (page.pageId !== entry.pageId) throw new ReleaseUnavailableError(`${url}: another page`);
  checkPage(page, url);
  return page;
}

// Every page JSON is loaded before the book can be Ready.
export async function loadRelease(releaseId: string, fetchImpl: typeof fetch = fetch): Promise<LoadedRelease> {
  const { root, manifest } = await loadManifest(releaseId, fetchImpl);
  const pages = await Promise.all(manifest.pages.map((entry) => loadPage(fetchImpl, root, entry)));
  return { root, manifest, pages };
}

export type LoadedCover = { root: string; page: ReleasePage };

// The cover of a book on the shelf: the manifest, then page 1 JSON only
// (ADR 0017 decision 20, PLY-05.S19).
export async function loadCover(releaseId: string, fetchImpl: typeof fetch = fetch): Promise<LoadedCover> {
  const { root, manifest } = await loadManifest(releaseId, fetchImpl);
  const first = manifest.pages[0];
  if (!first) throw new ReleaseUnavailableError(`${root}manifest.json: no page`);
  return { root, page: await loadPage(fetchImpl, root, first) };
}
