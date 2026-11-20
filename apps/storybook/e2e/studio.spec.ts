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
// `count` pages from the release fixture pages (repeated past 4, with new
// page IDs); `stale` and `review` name the page numbers with a problem.
function buildPages(count: number, { stale, review }: { stale?: number; review?: number } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const p = releasePages[i % releasePages.length]!;
    const pageId = i < releasePages.length ? p.pageId : uuid(0x600 + i);
    return pageFrom({ ...p, pageId }, i + 1, stale, review);
  });
}

function pageFrom(p: ReleasePage, number: number, stale?: number, review?: number) {
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
  if (number === stale) {
    page.state = "stale";
    page.problems = [{ target: "scene", reason: "stale" }];
  }
  if (number === review) {
    page.state = "needs_review";
    page.problems = [{ target: "audio", reason: "needs_review" }];
    page.audio = revision("audio", p.pageId, {
      status: "needs_review",
      error: { providerStatus: 400, message: "The voice is not available." },
    });
  }
  return page;
}

const storyPages = buildPages(4, { stale: 2, review: 3 });

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

// One answer of the fake API, keyed by "METHOD /path".
type Handler = (route: Route) => Promise<void>;

const jsonAnswer =
  (body: unknown, status = 200): Handler =>
  (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// Answers /api/studio/* from the fixtures above, with `overrides` first.
// Returns the requests that had no answer, so a test can fail on them.
async function routeStudioApi(page: Page, overrides: Record<string, Handler> = {}): Promise<StudioApi> {
  const api: StudioApi = { unrouted: [], missingFiles: [] };
  const table: Record<string, Handler> = {
    "GET /api/studio/stories": jsonAnswer(storyList),
    [`GET /api/studio/stories/${STORY_ID}`]: jsonAnswer(storyDetail),
    "GET /api/studio/registry": jsonAnswer(registry),
    ...overrides,
  };
  await page.route("**/api/studio/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const key = `${request.method()} ${pathname}`;
    const handler = table[key];
    if (handler !== undefined) return handler(route);
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

// ---- Frames of the ainews-ui review of #23 ("Frames I need in the CI
// screenshots"). Each test answers every request it makes.

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: import("@playwright/test").Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, what).not.toBeNull();
  return box ?? { x: 0, y: 0, width: 0, height: 0 };
}

// Within 1 CSS px (rounding only).
function expectPx(actual: number, expected: number, what: string) {
  expect(Math.abs(actual - expected), `${what}: ${actual} px, expected ${expected} px`).toBeLessThanOrEqual(1);
}

// A shot of `locator` with 12 px around it: the Sun ring reaches 9 px outside.
async function shotAround(page: Page, locator: import("@playwright/test").Locator, name: string) {
  const b = await boxOf(locator, name);
  await page.screenshot({
    path: path.join(SHOTS, `${name}.png`),
    animations: "disabled",
    clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.width + 24, height: b.height + 24 },
  });
}

const shotOf = (locator: import("@playwright/test").Locator, name: string) =>
  locator.screenshot({ path: path.join(SHOTS, `${name}.png`), animations: "disabled" });

// Presses Tab until `locator` has the focus (keyboard only, never `focus()`).
async function tabTo(page: Page, locator: import("@playwright/test").Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("Tab never reached the control");
}

// A promise that a held route waits for.
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open: () => open() };
}

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

function storyWith(id: string, over: Record<string, unknown>) {
  return { ...storyDetail, story: { ...storyDetail.story, id }, ...over };
}

const FAILED_ID = uuid(0x104);
const OUTLINE_FAILED_ID = uuid(0x105);
const READY_ID = uuid(0x106);
const NO_PAGES_ID = uuid(0x107);
const MISSING_ID = uuid(0x1ff);
const FAILED_RUN = uuid(0x501);
const OUTLINE_FAILED_RUN = uuid(0x502);

const errorRecord = (storyId: string, runId: string, step: string, pageId: string | null, message: string) => ({
  runId,
  storyId,
  pageId,
  step,
  providerStatus: 400,
  message,
});

// A failed run without an outline head: the `script` step failed.
const failedStory = storyWith(FAILED_ID, {
  heads: {},
  pages: [],
  releases: [],
  story: { ...storyDetail.story, id: FAILED_ID, status: "draft", publishedReleaseId: null, onShelf: false },
  latestRun: {
    id: FAILED_RUN,
    status: "failed",
    scope: { kind: "full" },
    error: { errors: [errorRecord(FAILED_ID, FAILED_RUN, "script", null, "The outline did not pass the checks.")] },
  },
});
const failedRun = {
  run: {
    id: FAILED_RUN,
    storyId: FAILED_ID,
    scope: { kind: "full" },
    status: "failed",
    error: failedStory.latestRun.error,
    createdAt: AT,
    finishedAt: AT,
    workflowStatus: "errored",
  },
  steps: [{ step: "script", state: "failed" }],
};

// A failed run with an outline head: 8 pages, the scenes of pages 3 and 6 failed.
const eightPages = buildPages(8);
const outlineFailedErrors = [3, 6].map((n) =>
  errorRecord(OUTLINE_FAILED_ID, OUTLINE_FAILED_RUN, `scene:${eightPages[n - 1]!.pageId}`, eightPages[n - 1]!.pageId, "The model refused."),
);
const outlineFailedStory = storyWith(OUTLINE_FAILED_ID, {
  pages: eightPages,
  latestRun: { id: OUTLINE_FAILED_RUN, status: "failed", scope: { kind: "full" }, error: { errors: outlineFailedErrors } },
});
const outlineFailedRun = {
  run: {
    id: OUTLINE_FAILED_RUN,
    storyId: OUTLINE_FAILED_ID,
    scope: { kind: "full" },
    status: "failed",
    error: { errors: outlineFailedErrors },
    createdAt: AT,
    finishedAt: AT,
    workflowStatus: "complete",
  },
  steps: [
    { step: "script", state: "done" },
    ...eightPages.map((p, i) => ({ step: `scene:${p.pageId}`, state: i === 2 || i === 5 ? "failed" : "done" })),
    ...eightPages.map((p, i) => ({ step: `audio:${p.pageId}`, state: i === 2 || i === 5 ? "pending" : "done" })),
  ],
};

// Every page ok: the Publish card is Ready.
const readyStory = storyWith(READY_ID, { pages: buildPages(4) });
const noPagesStory = storyWith(NO_PAGES_ID, { pages: [], heads: {}, latestRun: null, releases: [] });

test("Studio frame 1: story view columns at 1440 and 1024", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  const api = await routeStudioApi(page);
  for (const [width, height, pages] of [
    [1440, 900, 978],
    [1024, 768, 594],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`/studio/stories/${STORY_ID}`);
    await settle(page, PREVIEWS);
    // One page in review (page 3).
    await expect(page.getByText("provider error: The voice is not available.")).toBeVisible();
    expectPx((await boxOf(region(page, "Pages"), "Pages")).width, pages, `Pages at ${width}`);
    // The side column is as wide as each of its cards.
    expectPx((await boxOf(region(page, "Publish"), "Publish")).width, 360, `side column (Publish) at ${width}`);
    expectPx((await boxOf(region(page, "Releases"), "Releases")).width, 360, `side column (Releases) at ${width}`);
    await shot(page, `studio-columns-${width}x${height}`);
  }
  expect(api.unrouted).toEqual([]);
  expect(api.missingFiles).toEqual([]);
});

test("Studio frame 2: Start again at rest, focused, and pressed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  const api = await routeStudioApi(page, {
    [`GET /api/studio/stories/${FAILED_ID}`]: jsonAnswer(failedStory),
    [`GET /api/studio/runs/${FAILED_RUN}`]: jsonAnswer(failedRun),
    // The click at the end of the press: the server refuses, nothing else is requested.
    [`POST /api/studio/stories/${FAILED_ID}/runs`]: jsonAnswer({ error: "full_run_not_allowed" }, 409),
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`/studio/stories/${FAILED_ID}?runId=${FAILED_RUN}`);
  const button = page.getByRole("button", { name: "Start again" });
  await expect(button).toBeVisible();
  await expect(page.getByRole("group", { name: "script: 0 of 1 done, 1 failed" })).toBeVisible();
  await settle(page);
  await shotAround(page, button, "studio-start-again-rest-1024x768");

  await tabTo(page, button);
  await expect(button).toBeFocused();
  await shotAround(page, button, "studio-start-again-focus-1024x768");

  const b = await boxOf(button, "Start again");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await shotAround(page, button, "studio-start-again-pressed-1024x768");
  await page.mouse.up();
  await expect(page.getByText("A full run is not allowed for this story.")).toBeVisible();

  expect(api.unrouted).toEqual([]);
});

test("Studio frame 3: a failed run with an outline head", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  const api = await routeStudioApi(page, {
    [`GET /api/studio/stories/${OUTLINE_FAILED_ID}`]: jsonAnswer(outlineFailedStory),
    [`GET /api/studio/runs/${OUTLINE_FAILED_RUN}`]: jsonAnswer(outlineFailedRun),
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`/studio/stories/${OUTLINE_FAILED_ID}?runId=${OUTLINE_FAILED_RUN}`);
  const row = page.getByRole("group", { name: "scene: 6 of 8 done, 2 failed" });
  await expect(row).toContainText("6 of 8 done, 2 failed");
  const notice = page.getByRole("alert").filter({ hasText: "The run failed." });
  await expect(notice).toContainText("scene, page 3: The model refused.");
  await expect(notice).toContainText("scene, page 6: The model refused.");
  await expect(notice).toContainText("Open a page to make its scene or audio again.");
  await expect(notice.getByRole("button")).toHaveCount(0);
  const icon = await boxOf(notice.locator("svg").first(), "notice icon");
  expectPx(icon.width, 20, "notice icon width");
  expectPx(icon.height, 20, "notice icon height");
  await settle(page, eightPages.length);
  await shotOf(region(page, "Run"), "studio-run-failed-outline-1024x768");
  expect(api.unrouted).toEqual([]);
  expect(api.missingFiles).toEqual([]);
});

test("Studio frame 4: focus on a segment, the field, a title link, and Source article", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  const api = await routeStudioApi(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  const pasteText = page.getByRole("button", { name: "Paste text" });
  const articleUrl = page.getByRole("button", { name: "Article URL" });

  await page.goto("/studio");
  await expect(page.getByRole("link", { name: "A draft about the river" })).toBeVisible();
  await settle(page);
  // The selected segment is the one Tab stop of the group; the arrow key moves to the other.
  await tabTo(page, pasteText);
  await shotAround(page, pasteText, "studio-focus-segment-selected-1024x768");
  await page.keyboard.press("ArrowRight");
  await expect(articleUrl).toBeFocused();
  await shotAround(page, articleUrl, "studio-focus-segment-other-1024x768");

  const field = page.getByRole("textbox");
  await tabTo(page, field);
  await shotAround(page, field, "studio-focus-field-text-1024x768");

  const title = page.getByRole("link", { name: "A draft about the river" });
  await tabTo(page, title);
  await shotAround(page, title, "studio-focus-title-link-1024x768");

  // The URL field: select "Article URL" with the keyboard, then Tab to the field.
  await page.goto("/studio");
  await expect(title).toBeVisible();
  await tabTo(page, pasteText);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(articleUrl).toHaveAttribute("aria-pressed", "true");
  await tabTo(page, field);
  await expect(field).toHaveAttribute("type", "url");
  await shotAround(page, field, "studio-focus-field-url-1024x768");

  await page.goto(`/studio/stories/${STORY_ID}`);
  await settle(page, PREVIEWS);
  const source = page.getByRole("link", { name: "Source article" });
  await tabTo(page, source);
  await shotAround(page, source, "studio-focus-source-article-1024x768");

  expect(api.unrouted).toEqual([]);
  expect(api.missingFiles).toEqual([]);
});

test("Studio frame 5: the selected segment under hover keeps Card and Teal", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  const api = await routeStudioApi(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/studio");
  const segment = page.getByRole("button", { name: "Paste text" });
  await expect(segment).toHaveAttribute("aria-pressed", "true");
  await settle(page);

  // Tailwind `hover:` is inside @media (hover: hover): a touch context would test nothing.
  expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(true);
  const look = () =>
    segment.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
  const before = await look();
  expect(before).toEqual({ background: "rgb(255, 253, 248)", color: "rgb(15, 102, 94)" });
  await segment.hover();
  expect(await look()).toEqual(before);
  await shotAround(page, segment, "studio-hover-segment-selected-1024x768");
  expect(api.unrouted).toEqual([]);
});

test("Studio frame 6: a long title and an Off the shelf row do not scroll sideways", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  const long = "The little robot and the pond friends who built a bridge across the river at dawn";
  expect(long.length).toBeGreaterThanOrEqual(60);
  const api = await routeStudioApi(page, {
    "GET /api/studio/stories": jsonAnswer({
      stories: storyList.stories.map((s) => (s.id === STORY_ID ? { ...s, title: long } : s)),
    }),
  });
  for (const [width, height, form, list] of [
    [1024, 768, 331, 623],
    [1440, 900, 440, 898],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/studio");
    await expect(page.getByRole("link", { name: long })).toBeVisible();
    await expect(page.getByText("Off the shelf")).toHaveCount(1);
    await settle(page);
    const page_ = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(page_.scroll, `page width at ${width}`).toBeLessThanOrEqual(page_.client);
    const table = await page.locator('[data-slot="table-container"]').evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(table.scroll, `table width at ${width}`).toBeLessThanOrEqual(table.client);
    expectPx((await boxOf(region(page, "New story"), "New story")).width, form, `New story at ${width}`);
    expectPx((await boxOf(region(page, "Stories"), "Stories")).width, list, `Stories at ${width}`);
    await shot(page, `studio-list-long-${width}x${height}`);
  }
  expect(api.unrouted).toEqual([]);
});

test("Studio frame 7: the Releases card in its 360 px column", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  const api = await routeStudioApi(page);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.goto(`/studio/stories/${STORY_ID}`);
    await settle(page, PREVIEWS);
    const card = region(page, "Releases");
    expectPx((await boxOf(card, "Releases")).width, 360, `Releases at ${width}`);
    const chip = await boxOf(card.getByText("On the shelf"), "On the shelf");
    const open = await boxOf(card.getByLabel("Open release 2"), "Open release 2");
    // One line: the same vertical centre (within 2 px), the button right of the chip.
    expect(
      Math.abs(chip.y + chip.height / 2 - (open.y + open.height / 2)),
      `centres of the chip and Open at ${width}`,
    ).toBeLessThanOrEqual(2);
    expect(open.x).toBeGreaterThanOrEqual(chip.x + chip.width);
    await shotOf(card, `studio-releases-${width}x${height}`);
  }
  expect(api.unrouted).toEqual([]);
  expect(api.missingFiles).toEqual([]);
});

test("Studio frame 8: the Publish card Blocked, Ready, Done, and with no answer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  let publish: Handler = jsonAnswer(
    { releaseId: uuid(0x204), number: 3, manifestUrl: `/content/releases/${uuid(0x204)}/manifest.json`, playerUrl: `/read/${uuid(0x204)}` },
    201,
  );
  const api = await routeStudioApi(page, {
    [`GET /api/studio/stories/${READY_ID}`]: jsonAnswer(readyStory),
    [`POST /api/studio/stories/${READY_ID}/releases`]: (route) => publish(route),
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  const card = region(page, "Publish");

  // Blocked: page 2 has a stale scene, page 3 needs review.
  await page.goto(`/studio/stories/${STORY_ID}`);
  await settle(page, PREVIEWS);
  await expect(card.getByText("page 2: stale scene")).toBeVisible();
  await expect(card.getByRole("button", { name: /^Publish/ })).toBeDisabled();
  await shotOf(card, "studio-publish-blocked-1024x768");

  // Ready.
  await page.goto(`/studio/stories/${READY_ID}`);
  await settle(page, readyStory.pages.length);
  await expect(card.getByText("All pages are ready.")).toBeVisible();
  await shotOf(card, "studio-publish-ready-1024x768");

  // Done, after a 201.
  await card.getByRole("button", { name: "Publish release 3" }).click();
  await expect(card.getByText("Release 3 published.")).toBeVisible();
  await shotOf(card, "studio-publish-done-1024x768");

  // No answer.
  publish = (route) => route.abort("failed");
  await page.goto(`/studio/stories/${READY_ID}`);
  await settle(page, readyStory.pages.length);
  await card.getByRole("button", { name: "Publish release 3" }).click();
  await expect(card.getByText("No answer came from the server.")).toBeVisible();
  await expect(
    card.getByText("It is not known if the release was published. Check the Releases card before you try again."),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("(0)");
  await shotOf(card, "studio-publish-no-answer-1024x768");

  expect(api.unrouted).toEqual([]);
  expect(api.missingFiles).toEqual([]);
});

test("Studio frame 9: Loading, Story not found, and No pages yet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  const list = gate();
  const story = gate();
  const api = await routeStudioApi(page, {
    "GET /api/studio/stories": async (route) => {
      await list.opened;
      return jsonAnswer(storyList)(route);
    },
    [`GET /api/studio/stories/${STORY_ID}`]: async (route) => {
      await story.opened;
      return jsonAnswer(storyDetail)(route);
    },
    [`GET /api/studio/stories/${MISSING_ID}`]: jsonAnswer({ error: "not_found" }, 404),
    [`GET /api/studio/stories/${NO_PAGES_ID}`]: jsonAnswer(noPagesStory),
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  const main = page.locator("main");

  await page.goto("/studio");
  await expect(page.getByText("Loading the stories.")).toBeVisible();
  await settle(page);
  await shotOf(main, "studio-loading-list-1024x768");
  list.open();
  await expect(page.getByRole("link", { name: "A draft about the river" })).toBeVisible();

  await page.goto(`/studio/stories/${STORY_ID}`);
  await expect(page.getByText("Loading the story.")).toBeVisible();
  await expect(page.getByLabel("Back to stories")).toBeVisible();
  await settle(page);
  await shotOf(main, "studio-loading-story-1024x768");
  story.open();
  await settle(page, PREVIEWS);

  await page.goto(`/studio/stories/${MISSING_ID}`);
  await expect(page.getByText("Story not found.")).toBeVisible();
  await expect(page.getByLabel("Back to stories")).toBeVisible();
  await settle(page);
  await shotOf(main, "studio-not-found-1024x768");

  await page.goto(`/studio/stories/${NO_PAGES_ID}`);
  await expect(page.getByText("No pages yet.")).toBeVisible();
  await settle(page);
  await shotOf(main, "studio-no-pages-1024x768");

  expect(api.unrouted).toEqual([]);
  expect(api.missingFiles).toEqual([]);
});
