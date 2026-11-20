import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, type Route, test } from "@playwright/test";

// Browser tests of the Studio (#23). `vite dev` has no Worker, so every
// /api/studio/* request is answered here. The previews load the asset files
// of e2e/fixtures/release/. An /api/studio/* request with no answer here is
// recorded and aborted, and the test fails on it.

// The Studio is desktop first: no mobile viewport, no touch, CSS px = device px.
test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const SIZES = [
  [1024, 768],
  [1440, 900],
] as const;

const DIR = path.join(import.meta.dirname, "fixtures", "release");
const read = (rel: string) => readFileSync(path.join(DIR, rel));

type ReleasePage = {
  pageId: string;
  text: string;
  scene: unknown;
  assets: Record<string, { renderer: string; manifest: { kind: string }; base: string }>;
};
const manifest = JSON.parse(read("manifest.json").toString()) as { pages: { json: string }[] };
const releasePages = manifest.pages.map((p) => JSON.parse(read(p.json).toString()) as ReleasePage);

// ---- API fixtures, in the shapes of worker/api/schemas.ts.

const uuid = (n: number) => `01936b2a-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const AT = "2026-11-19T10:00:00.000Z";

const DRAFT_ID = uuid(0x101);
const STORY_ID = uuid(0x102);
const OFF_ID = uuid(0x103);
const RELEASE_1 = uuid(0x201);
const RELEASE_2 = uuid(0x202);
const OFF_RELEASE = uuid(0x203);

const storyList = {
  stories: [
    { id: DRAFT_ID, title: "A draft about the river", status: "draft", createdAt: AT, publishedReleaseId: null, onShelf: false, publishedReleaseNumber: null },
    { id: STORY_ID, title: "The little robot who helped the pond friends", status: "published", createdAt: AT, publishedReleaseId: RELEASE_2, onShelf: true, publishedReleaseNumber: 2 },
    { id: OFF_ID, title: "The fox who lost its hat", status: "published", createdAt: AT, publishedReleaseId: OFF_RELEASE, onShelf: false, publishedReleaseNumber: 2 },
  ],
};

// Every asset that a preview uses, active at version 1. Files are served
// from e2e/fixtures/release/assets/<key>/v1/.
const registryAssets = new Map<string, unknown>();
for (const page of releasePages) {
  for (const [key, asset] of Object.entries(page.assets)) {
    registryAssets.set(key, {
      key,
      kind: asset.manifest.kind,
      name: key,
      version: 1,
      renderer: asset.renderer,
      manifest: asset.manifest,
      base: `/api/studio/files/assets/${key}/v1/`,
    });
  }
}
const registry = { assets: [...registryAssets.values()], templates: [] };

let revisionNumber = 0x300;
function revision(kind: string, pageId: string, over: Record<string, unknown> = {}) {
  revisionNumber += 1;
  return {
    id: uuid(revisionNumber),
    kind,
    pageId,
    status: "ok",
    origin: "ai",
    content: null,
    error: null,
    basis: {},
    assetVersions: null,
    createdAt: AT,
    fileUrl: null,
    ...over,
  };
}

// The seeded story: page 2 has a stale scene, page 3 a needs_review audio
// (a provider error), the rest is ok. Release 1 is withdrawn, release 2 is on
// the shelf.
const storyPages = releasePages.map((p, i) => {
  const number = i + 1;
  const versions = Object.fromEntries(Object.keys(p.assets).map((key) => [key, 1]));
  const page = {
    pageId: p.pageId,
    number,
    beat: `Beat ${number}`,
    state: "ok",
    problems: [] as { target: string; reason: string }[],
    text: revision("page_text", p.pageId, { content: { text: p.text } }),
    scene: revision("scene", p.pageId, { content: p.scene, assetVersions: versions }),
    audio: revision("audio", p.pageId, { content: { durationMs: 1000 }, fileUrl: `/api/studio/files/calls/${p.pageId}.mp3` }),
  };
  if (number === 2) {
    page.state = "stale";
    page.problems = [{ target: "scene", reason: "stale" }];
  }
  if (number === 3) {
    page.state = "needs_review";
    page.problems = [{ target: "audio", reason: "needs_review" }];
    page.audio = revision("audio", p.pageId, {
      status: "needs_review",
      error: { providerStatus: 400, message: "The voice is not available." },
    });
  }
  return page;
});

const storyDetail = {
  story: {
    id: STORY_ID,
    title: "The little robot who helped the pond friends",
    status: "published",
    headsVersion: 12,
    publishedReleaseId: RELEASE_2,
    onShelf: true,
    createdAt: AT,
  },
  heads: { outline: uuid(0x400) },
  source: revision("source", "", {
    content: { text: "A pasted news text.", url: "https://example.com/news/pond", words: 640, truncated: false },
  }),
  pages: storyPages,
  releases: [
    { id: RELEASE_1, number: 1, createdAt: AT, withdrawn: true },
    { id: RELEASE_2, number: 2, createdAt: AT, withdrawn: false },
  ],
  latestRun: { id: uuid(0x500), status: "draft_ready", scope: { kind: "full" }, error: null },
};

const PREVIEWS = storyPages.length;

const TYPES: Record<string, string> = { ".svg": "image/svg+xml", ".webp": "image/webp" };

type StudioApi = { unrouted: string[]; missingFiles: string[] };

// Answers /api/studio/* from the fixtures above. Returns the requests that had
// no answer, so a test can fail on them.
async function routeStudioApi(page: Page): Promise<StudioApi> {
  const api: StudioApi = { unrouted: [], missingFiles: [] };
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/studio/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const key = `${request.method()} ${pathname}`;
    if (key === "GET /api/studio/stories") return json(route, storyList);
    if (key === `GET /api/studio/stories/${STORY_ID}`) return json(route, storyDetail);
    if (key === "GET /api/studio/registry") return json(route, registry);
    const files = "/api/studio/files/";
    if (request.method() === "GET" && pathname.startsWith(`${files}assets/`)) {
      const rel = pathname.slice(files.length);
      const file = path.join(DIR, rel);
      if (!rel.includes("..") && existsSync(file)) {
        return route.fulfill({ status: 200, body: readFileSync(file), contentType: TYPES[path.extname(rel)] });
      }
      api.missingFiles.push(pathname);
      return route.fulfill({ status: 404, body: "" });
    }
    api.unrouted.push(key);
    return route.abort("failed");
  });
  return api;
}

// Waits until the fonts are loaded and, when `previews` is given, until that
// many previews reported every asset as loaded or failed.
async function settle(page: Page, previews = 0): Promise<void> {
  if (previews > 0) {
    await expect(page.locator('.sv-viewport[data-settled="true"]')).toHaveCount(previews);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

// Screenshots for the PR (#23, R53). CI uploads test-results/screenshots/ as
// the `player-screenshots` artifact. The same helper as e2e/player.spec.ts.
const SHOTS = path.join(import.meta.dirname, "..", "test-results", "screenshots");
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(SHOTS, `${name}.png`), animations: "disabled" });

test("Studio screenshots: the stories list and a story view", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  test.setTimeout(120_000);
  const api = await routeStudioApi(page);

  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });

    await page.goto("/studio");
    await expect(page.getByRole("link", { name: "A draft about the river" })).toBeVisible();
    await expect(page.getByText("Off the shelf")).toHaveCount(1);
    await settle(page);
    await shot(page, `studio-list-${width}x${height}`);

    await page.goto(`/studio/stories/${STORY_ID}`);
    await expect(page.getByRole("heading", { name: storyDetail.story.title })).toBeVisible();
    await settle(page, PREVIEWS);
    await shot(page, `studio-story-${width}x${height}`);
  }

  expect(api.unrouted).toEqual([]);
  expect(api.missingFiles).toEqual([]);
});

// Still mode with the default fit `contain` fills a 1002:610 host box
// (D23-20): the box has that ratio, and the viewport covers the whole box,
// with no 4:3 letterbox.
test("Studio previews fill a 1002:610 host box", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  const api = await routeStudioApi(page);

  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.goto(`/studio/stories/${STORY_ID}`);
    await settle(page, PREVIEWS);

    const hosts = page.getByTestId("page-preview");
    await expect(hosts).toHaveCount(PREVIEWS);
    for (let i = 0; i < PREVIEWS; i++) {
      const host = hosts.nth(i);
      const box = await host.boundingBox();
      const view = await host.locator(".sv-viewport").boundingBox();
      expect(box, `host ${i} at ${width}x${height}`).not.toBeNull();
      expect(view, `viewport ${i} at ${width}x${height}`).not.toBeNull();
      if (box === null || view === null) return;

      const ratio = box.width / box.height;
      expect(Math.abs(ratio - 1002 / 610) / (1002 / 610), `ratio ${ratio} at ${width}x${height}`).toBeLessThan(0.01);
      for (const side of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(view[side] - box[side]), `${side} of preview ${i} at ${width}x${height}`).toBeLessThanOrEqual(1);
      }
    }
  }

  expect(api.unrouted).toEqual([]);
  expect(api.missingFiles).toEqual([]);
});
