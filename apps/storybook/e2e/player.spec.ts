import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page, type Response, type Route, test } from "@playwright/test";
import { makeSilentWav } from "./wav";

// Browser tests of the book route (#22 Part A). Every request under
// /content/releases/ is answered here from e2e/fixtures/release/.

const ID = "01936b2a-0000-7000-8000-000000000001";
const MISSING_ID = "01936b2a-0000-7000-8000-0000000000ff";
const ROOT = `/content/releases/${ID}/`;
const DIR = path.join(import.meta.dirname, "fixtures", "release");
const read = (rel: string) => readFileSync(path.join(DIR, rel));

type PageJson = {
  pageId: string;
  text: string;
  audio: string;
  scene: { sky: string; layers: { instanceId: string; ref: string }[] };
  assets: Record<string, unknown>;
};
const manifest = JSON.parse(read("manifest.json").toString()) as { title: string; pages: { pageId: string; json: string }[] };
const pages = manifest.pages.map((p) => JSON.parse(read(p.json).toString()) as PageJson);
const REFERENCE_TEXT =
  "The little rabbit carried a basket of berries across the meadow before breakfast. Her friend the hedgehog waited beside the river with a blanket and two yellow cups. Together they watched the morning clouds sail slowly over the green hills.";
const PAPER = "rgb(255, 248, 236)";

type PlayRecord = { id: string | undefined; src: string; event: string | null };
type PauseRecord = PlayRecord & { path: string };
declare global {
  interface Window {
    __fetches: { url: string; cache: string }[];
    __plays: PlayRecord[];
    __playElements: HTMLMediaElement[];
    __pauses: PauseRecord[];
    __startEnabled: boolean;
  }
}

// An answer for one release path: a status and body, "hold" (answered when
// `release()` is called), or "hang" (never answered).
type Answer = { status: number; body?: string | Buffer; contentType?: string } | "hold" | "hang";

const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".wav": "audio/wav",
};

class Net {
  requests: { path: string; method: string; postData: string | null }[] = [];
  answer: (rel: string) => Answer | undefined = () => undefined;
  private held: { route: Route; rel: string }[] = [];

  count(rel: string): number {
    return this.requests.filter((r) => r.path === ROOT + rel).length;
  }

  async release(): Promise<void> {
    const held = this.held;
    this.held = [];
    for (const { route, rel } of held) await route.fulfill(fileAnswer(rel));
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    this.requests.push({ path: url.pathname, method: request.method(), postData: request.postData() });
    if (!url.pathname.startsWith(ROOT)) return route.fulfill({ status: 404, body: "" });
    const rel = url.pathname.slice(ROOT.length);
    const custom = this.answer(rel);
    if (custom === "hang") return;
    if (custom === "hold") {
      this.held.push({ route, rel });
      return;
    }
    if (custom) return route.fulfill({ status: custom.status, body: custom.body ?? "", contentType: custom.contentType });
    return route.fulfill(fileAnswer(rel));
  }
}

function fileAnswer(rel: string): { status: number; body: string | Buffer; contentType?: string } {
  if (rel.endsWith(".wav")) return { status: 200, body: Buffer.from(makeSilentWav(1000)), contentType: "audio/wav" };
  const file = path.join(DIR, rel);
  if (rel.includes("..") || !existsSync(file)) return { status: 404, body: "" };
  return { status: 200, body: readFileSync(file), contentType: TYPES[path.extname(rel)] };
}

async function setup(page: Page): Promise<Net> {
  const net = new Net();
  await page.addInitScript(() => {
    window.__fetches = [];
    window.__plays = [];
    window.__playElements = [];
    window.__pauses = [];
    window.__startEnabled = false;
    const originalFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url = input instanceof Request ? input.url : String(input);
      window.__fetches.push({ url, cache: init?.cache ?? "default" });
      return originalFetch(input, init);
    };
    const media = HTMLMediaElement.prototype;
    const play = media.play;
    media.play = function (this: HTMLMediaElement) {
      window.__plays.push({ id: this.dataset.testid, src: this.src, event: window.event?.type ?? null });
      window.__playElements.push(this);
      return play.call(this);
    };
    const pause = media.pause;
    media.pause = function (this: HTMLMediaElement) {
      window.__pauses.push({ id: this.dataset.testid, src: this.src, event: window.event?.type ?? null, path: location.pathname });
      return pause.call(this);
    };
    // Records whether "Start" was ever enabled (PLY-06.S7, S12).
    new MutationObserver(() => {
      const start = document.querySelector('button[aria-label="Start the story"]');
      if (start && start.getAttribute("aria-disabled") !== "true") window.__startEnabled = true;
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await page.route("**/content/releases/**", (route) => net.handle(route));
  return net;
}

const startButton = (page: Page) => page.getByRole("button", { name: "Start the story" });
const nextButton = (page: Page) => page.getByRole("button", { name: "Next page" });
const previousButton = (page: Page) => page.getByRole("button", { name: "Previous page" });
const homeButton = (page: Page) => page.getByRole("button", { name: "Home" });
const pill = (page: Page) => page.getByRole("status").filter({ hasText: "/" });
const narration = (page: Page) => page.getByTestId("narration");
const pictureArea = (page: Page) => page.getByTestId("picture-area");
const narrationPanel = (page: Page) => page.getByTestId("narration-panel");
const restingLine = (page: Page) => page.getByText("This book is sleeping. Come back soon.");
const plays = (page: Page) => page.evaluate(() => window.__plays);
const narrationPlays = async (page: Page) => (await plays(page)).filter((p) => p.id === "narration-audio");

async function open(page: Page, id = ID) {
  await page.goto(`/read/${id}`);
}

async function ready(page: Page) {
  await expect(startButton(page)).toBeVisible();
  await expect(startButton(page)).not.toHaveAttribute("aria-disabled", "true");
}

async function startBook(page: Page) {
  await ready(page);
  await startButton(page).click();
  await expect(narration(page)).toHaveText(pages[0]!.text);
}

// Goes from page 1 to page `n` (1-based) with "next".
async function turnTo(page: Page, n: number) {
  for (let i = 2; i <= n; i++) {
    await nextButton(page).click();
    await expect(narration(page)).toHaveText(pages[i - 1]!.text);
  }
}

type Box = { x: number; y: number; width: number; height: number };
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, "element has a box").not.toBeNull();
  return b!;
}

// The page text fits in the narration panel: the panel (the element with
// the set height) does not scroll, and the text box lies inside the content
// box of the padded box that holds it. Edges are rounded to whole CSS px
// (fractional device pixels at DPR 2.625), with no tolerance.
async function textFitsPanel(page: Page): Promise<boolean> {
  const panelScrolls = await narrationPanel(page).evaluate((el) => el.scrollHeight > el.clientHeight);
  const inContent = await narration(page).evaluate((el) => {
    const holder = el.parentElement!;
    const style = getComputedStyle(holder);
    const outer = holder.getBoundingClientRect();
    const text = el.getBoundingClientRect();
    const r = Math.round;
    return (
      r(text.top) >= r(outer.top + parseFloat(style.paddingTop)) &&
      r(text.bottom) <= r(outer.bottom - parseFloat(style.paddingBottom)) &&
      r(text.left) >= r(outer.left + parseFloat(style.paddingLeft)) &&
      r(text.right) <= r(outer.right - parseFloat(style.paddingRight))
    );
  });
  return !panelScrolls && inContent;
}

// `pip` has a `float` loop, so its box never stops moving and
// `locator.click()` waits for a stable box until the timeout. A real
// pointer tap on the middle of the box, as a child taps a moving picture.
async function tapPip(page: Page) {
  const b = await box(page.getByRole("button", { name: "pip" }));
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;
const gap = (a: Box, b: Box) =>
  Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height));
const expectSameBox = (a: Box, b: Box, name: string) => {
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(a[key] - b[key]), `${name} ${key}`).toBeLessThanOrEqual(1);
};
const inViewport = (b: Box, page: Page) => {
  const v = page.viewportSize()!;
  return b.x >= 0 && b.y >= 0 && b.x + b.width <= v.width && b.y + b.height <= v.height;
};

function collectErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  return errors;
}

test("PLY-01.S1 the Player reads the one release in the URL", async ({ page }) => {
  const net = await setup(page);
  await open(page);
  await startBook(page);
  const content = net.requests.filter((r) => r.path.startsWith("/content/releases/"));
  expect(content[0]!.path).toBe(`${ROOT}manifest.json`);
  expect(content.every((r) => r.path.startsWith(ROOT))).toBe(true);
  const fetches = await page.evaluate(() => window.__fetches);
  const first = fetches.find((f) => new URL(f.url, page.url()).pathname.startsWith("/content/releases/"))!;
  expect(new URL(first.url, page.url()).pathname).toBe(`${ROOT}manifest.json`);
  expect(first.cache).toBe("no-cache");

  const ids = await page.locator("[data-instance-id]:not(.sv-margin)").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-instance-id")),
  );
  expect(ids.sort()).toEqual(pages[0]!.scene.layers.map((l) => l.instanceId).sort());
  expect((await narrationPlays(page)).some((p) => p.src.endsWith(ROOT + pages[0]!.audio))).toBe(true);
  await tapPip(page);
  await expect(page.getByText("Hello!")).toBeVisible();
});

test("PLY-02.S1 Start unlocks the audio", async ({ page }) => {
  await setup(page);
  await open(page);
  await startBook(page);
  expect(await narrationPlays(page)).toContainEqual({ id: "narration-audio", src: expect.stringMatching(new RegExp(`${pages[0]!.audio}$`)), event: "click" });
});

test("PLY-02.S2 a page turn plays the narration of the new page", async ({ page }) => {
  await setup(page);
  await open(page);
  await startBook(page);
  await nextButton(page).click();
  await expect(narration(page)).toHaveText(pages[1]!.text);
  let last = (await narrationPlays(page)).at(-1)!;
  expect(last.src.endsWith(ROOT + pages[1]!.audio)).toBe(true);
  expect(last.event).toBe("click");
  expect(await page.evaluate(() => document.querySelectorAll("audio").length)).toBe(2);

  await previousButton(page).click();
  await expect(narration(page)).toHaveText(pages[0]!.text);
  last = (await narrationPlays(page)).at(-1)!;
  expect(last.src.endsWith(ROOT + pages[0]!.audio)).toBe(true);
  expect(last.event).toBe("click");
  expect(await page.evaluate(() => document.querySelectorAll("audio").length)).toBe(2);
});

test("PLY-02.S3 sound effects use a second shared element", async ({ page }) => {
  await setup(page);
  await open(page);
  await startBook(page);
  await tapPip(page);
  await expect(page.getByText("Hello!")).toBeVisible();
  const all = await plays(page);
  const sfx = all.map((p, i) => ({ ...p, i })).filter((p) => p.id === "sfx-audio");
  expect(sfx.length).toBe(2);
  expect(sfx[1]!.src.endsWith(`${ROOT}assets/ding/v1/ding.wav`)).toBe(true);
  expect(sfx[1]!.event).toBe("click");
  const same = await page.evaluate(([a, b]) => window.__playElements[a!] === window.__playElements[b!], [sfx[0]!.i, sfx[1]!.i]);
  expect(same).toBe(true);
  const narrationSrc = await page.getByTestId("narration-audio").evaluate((el) => (el as HTMLAudioElement).src);
  expect(narrationSrc.endsWith(ROOT + pages[0]!.audio)).toBe(true);
});

test("PLY-02.S4 the narration text is below the stage", async ({ page }) => {
  await setup(page);
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1194, 834],
  ] as const) {
    await page.setViewportSize({ width, height });
    await open(page);
    await startBook(page);
    const contained = await page.evaluate(() =>
      document.querySelector('[data-testid="picture-area"]')!.contains(document.querySelector('[data-testid="narration"]')),
    );
    expect(contained, `${width} x ${height}`).toBe(false);
    const picture = await box(pictureArea(page));
    const text = await box(narration(page));
    expect(text.y).toBeGreaterThanOrEqual(picture.y + picture.height - 0.5);
    const size = await narration(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(18);
    expectSameBox(await box(page.locator(".sv-viewport")), picture, `${width} x ${height} viewport`);
  }
});

test("PLY-02.S5 no frame part lies over the picture", async ({ page }) => {
  await setup(page);
  for (const [width, height] of [
    [1194, 834],
    [390, 844],
    [667, 375],
  ] as const) {
    await page.setViewportSize({ width, height });
    await open(page);
    await startBook(page);
    await nextButton(page).click();
    const picture = await box(pictureArea(page));
    for (const [name, locator] of [
      ["Home", homeButton(page)],
      ["previous", previousButton(page)],
      ["next", nextButton(page)],
      ["pill", pill(page)],
    ] as const) {
      expect(intersects(await box(locator), picture), `${width} x ${height} ${name}`).toBe(false);
    }
  }
});

test("PLY-02.S6 the frame controls keep their gaps at 900 x 600", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await open(page);
  await startBook(page);
  await turnTo(page, 3);
  const picture = await box(pictureArea(page));
  const parts = [
    ["Home", await box(homeButton(page))],
    ["previous", await box(previousButton(page))],
    ["next", await box(nextButton(page))],
    ["pill", await box(pill(page))],
  ] as const;
  for (const [name, b] of parts) {
    const inGutter = b.x + b.width <= 96.5 || b.x >= 900 - 96.5;
    expect(inGutter, `${name} in a gutter`).toBe(true);
    expect(intersects(b, picture), `${name} over the picture`).toBe(false);
  }
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      expect(gap(parts[i]![1], parts[j]![1]), `${parts[i]![0]} to ${parts[j]![0]}`).toBeGreaterThanOrEqual(12);
    }
  }
});

test("PLY-02.S8 a silent clip that cannot play shows nothing", async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.addInitScript(() => {
    const media = HTMLMediaElement.prototype;
    const play = media.play;
    media.play = function (this: HTMLMediaElement) {
      const result = play.call(this);
      if (!this.src.startsWith("data:")) return result;
      result.catch(() => {});
      return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    };
  });
  await open(page);
  await startBook(page);
  await expect(nextButton(page)).toBeVisible();
  expect((await narrationPlays(page)).some((p) => p.src.endsWith(ROOT + pages[0]!.audio))).toBe(true);
  expect((await plays(page)).filter((p) => p.id === "sfx-audio")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("PLY-02.S9 a sound effect that cannot play is quiet", async ({ page }) => {
  const errors = collectErrors(page);
  const net = await setup(page);
  net.answer = (rel) => (rel === "assets/ding/v1/ding.wav" ? { status: 404 } : undefined);
  await open(page);
  await startBook(page);
  await tapPip(page);
  await expect(page.getByText("Hello!")).toBeVisible();
  await expect.poll(() => net.count("assets/ding/v1/ding.wav")).toBe(1);
  expect(errors).toEqual([]);
  const pauses = await page.evaluate(() => window.__pauses);
  expect(pauses.filter((p) => p.id === "narration-audio")).toHaveLength(0);
});

test("PLY-03.S1 the Player works in Safari on iPad and iPhone", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("webkit"), "WebKit projects only");
  await setup(page);
  await open(page);
  await startBook(page);
  expect(await page.locator("[data-instance-id]:not(.sv-margin)").count()).toBe(pages[0]!.scene.layers.length);
  await tapPip(page);
  await expect(page.getByText("Hello!")).toBeVisible();
  await nextButton(page).click();
  await expect(narration(page)).toHaveText(pages[1]!.text);
  const records = await narrationPlays(page);
  expect(records.filter((p) => p.event === "click").map((p) => p.src.slice(p.src.indexOf(ROOT)))).toEqual([
    ROOT + pages[0]!.audio,
    ROOT + pages[1]!.audio,
  ]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await startBook(page);
  const infinite = await page.evaluate(() =>
    document.getAnimations().some((a) => a.effect?.getComputedTiming().iterations === Infinity),
  );
  expect(infinite).toBe(false);
});

test("PLY-04.S15 the enter animations of page 1 wait for Start", async ({ page }) => {
  await setup(page);
  await open(page);
  await ready(page);
  await expect(page.locator(".sv-viewport")).toHaveAttribute("data-phase", "incoming");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.getAnimations().some((a) => a.effect?.getComputedTiming().iterations === Infinity && a.playState === "running"),
      ),
    )
    .toBe(true);
  // A late image fades in for 200 ms; after that no finite animation runs.
  await page.waitForTimeout(400);
  const finite = await page.evaluate(
    () => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.playState === "running").length,
  );
  expect(finite).toBe(0);
  await expect(page.getByRole("button", { name: "pip" })).toHaveCount(0);

  await startButton(page).click();
  await expect(page.locator(".sv-viewport")).toHaveAttribute("data-phase", "current");
  await expect(page.getByRole("button", { name: "pip" })).toHaveCount(1);
});

test("PLY-04.S16 the picture keeps its size and its place at Start", async ({ page }) => {
  const net = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  // The book is loaded and measured, but page 1 has not settled: Loading.
  net.answer = (rel) => (rel === "assets/meadow/v1/day.svg" ? "hold" : undefined);
  await open(page);
  await expect.poll(() => net.count("assets/meadow/v1/day.svg")).toBe(1);
  await expect(page.getByText("Opening the book")).toBeVisible();
  const loading = { picture: await box(pictureArea(page)), panel: await box(narrationPanel(page)) };
  expect((await box(page.getByTestId("top-bar"))).height).toBe(84);
  expect((await box(page.getByTestId("control-row"))).height).toBe(84);

  await net.release();
  await ready(page);
  const atReady = { picture: await box(pictureArea(page)), panel: await box(narrationPanel(page)) };
  expect((await box(page.getByTestId("top-bar"))).height).toBe(84);
  expect((await box(page.getByTestId("control-row"))).height).toBe(84);

  await startButton(page).click();
  await expect(narration(page)).toBeVisible();
  const started = { picture: await box(pictureArea(page)), panel: await box(narrationPanel(page)) };
  for (const [name, state] of [
    ["Ready", atReady],
    ["Start", started],
  ] as const) {
    expectSameBox(state.picture, loading.picture, `${name} picture`);
    expectSameBox(state.panel, loading.panel, `${name} panel`);
  }
});

test("PLY-04.S17 the Start gate fits its panel in every layout", async ({ page }) => {
  const net = await setup(page);
  const check = async (text: Locator, button: Locator, name: string) => {
    const panel = await box(narrationPanel(page));
    const t = await box(text);
    const b = await box(button);
    expect(inside(t, panel), `${name} text inside the panel`).toBe(true);
    expect(inside(b, panel), `${name} button inside the panel`).toBe(true);
    expect(intersects(t, b), `${name} text and button`).toBe(false);
    const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
    expect(fits, `${name} no scroll`).toBe(true);
  };
  for (const [width, height] of [
    [900, 600],
    [844, 600],
    [375, 553],
    [667, 375],
  ] as const) {
    const size = `${width} x ${height}`;
    await page.setViewportSize({ width, height });

    net.answer = (rel) => (rel === manifest.pages[0]!.json ? "hang" : undefined);
    await open(page);
    await expect(page.getByText("Opening the book")).toBeVisible();
    await check(page.getByText("Opening the book"), startButton(page), `${size} Loading`);

    net.answer = () => undefined;
    await open(page);
    await ready(page);
    await check(page.getByRole("heading", { name: manifest.title }), startButton(page), `${size} Ready`);

    await open(page, MISSING_ID);
    await expect(restingLine(page)).toBeVisible();
    await check(restingLine(page), homeButton(page), `${size} Resting`);
  }
});

test("PLY-04.S18 the panel has the height of the longest page before Ready", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await ready(page);
  // Page 3 needs more lines than the reference text at 22 px in 358 px.
  const lines = await page.evaluate(
    ([a, b]) =>
      [a!, b!].map((text) => {
        const el = document.createElement("div");
        el.style.cssText =
          "position:absolute;visibility:hidden;left:-10000px;top:0;width:358px;font:600 22px/1.45 'Baloo 2', ui-rounded, system-ui, sans-serif;text-wrap:pretty";
        el.textContent = text;
        document.body.append(el);
        const n = Math.round(el.offsetHeight / (22 * 1.45));
        el.remove();
        return n;
      }),
    [REFERENCE_TEXT, pages[2]!.text],
  );
  expect(lines[1]!).toBeGreaterThan(lines[0]!);

  const atReady = (await box(narrationPanel(page))).height;
  await startButton(page).click();
  for (let i = 1; i <= pages.length; i++) {
    if (i > 1) await nextButton(page).click();
    await expect(narration(page)).toHaveText(pages[i - 1]!.text);
    expect(Math.abs((await box(narrationPanel(page))).height - atReady), `page ${i}`).toBeLessThanOrEqual(0.5);
    if (i === 3) {
      expect(await textFitsPanel(page)).toBe(true);
    }
  }
});

test("PLY-06.S2 Home on the reading page shows the shelf", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await setup(page);
  await open(page);
  await startBook(page);
  await turnTo(page, 3);
  await homeButton(page).click();
  await expect(page.getByTestId("shelf-placeholder")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  const pauses = await page.evaluate(() => window.__pauses);
  for (const id of ["narration-audio", "sfx-audio"]) {
    const first = pauses.find((p) => p.id === id);
    expect(first, `${id} paused`).toBeTruthy();
    expect(first!.path).toBe(`/read/${ID}`);
  }
  expect(await page.locator("audio").count()).toBe(0);
  expect(dialogs).toEqual([]);
});

test("PLY-06.S5 a release that does not exist shows the Resting state", async ({ page }) => {
  const net = await setup(page);
  await open(page, MISSING_ID);
  await expect(restingLine(page)).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(homeButton(page)).toHaveText(/Home/);
  await expect(startButton(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
  const content = net.requests.filter((r) => r.path.startsWith("/content/"));
  expect(content.map((r) => r.path)).toEqual([`/content/releases/${MISSING_ID}/manifest.json`]);
  expect(await plays(page)).toEqual([]);
  expect(new URL(page.url()).pathname).toBe(`/read/${MISSING_ID}`);
});

test("PLY-06.S7 a file that Start waits for fails to load", async ({ page }) => {
  const net = await setup(page);
  net.answer = (rel) => (rel === manifest.pages[1]!.json ? { status: 500 } : undefined);
  await open(page);
  await expect(restingLine(page)).toBeVisible();
  expect(await page.evaluate(() => window.__startEnabled)).toBe(false);
  expect(net.count(manifest.pages[1]!.json)).toBe(1);
});

test("PLY-06.S8 Home in the Resting state shows the shelf", async ({ page }) => {
  await setup(page);
  await open(page, MISSING_ID);
  await expect(restingLine(page)).toBeVisible();
  await homeButton(page).click();
  await expect(page.getByTestId("shelf-placeholder")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("PLY-06.S9 a slow load does not rest", async ({ page }) => {
  const net = await setup(page);
  await page.clock.install();
  net.answer = (rel) => (rel === manifest.pages[0]!.json ? "hang" : undefined);
  await open(page);
  await expect(page.getByText("Opening the book")).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(page.getByText("Opening the book")).toBeVisible();
  await expect(homeButton(page)).toBeVisible();
  await expect(restingLine(page)).toHaveCount(0);
});

test("PLY-06.S10 a failed image after Start does not rest", async ({ page }) => {
  const net = await setup(page);
  net.answer = (rel) => (rel === "assets/dog/v1/stand.webp" ? { status: 404 } : undefined);
  await open(page);
  await startBook(page);
  await turnTo(page, 3);
  expect((await narrationPlays(page)).at(-1)!.src.endsWith(ROOT + pages[2]!.audio)).toBe(true);
  expect(await page.locator(".sv-viewport").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(PAPER);
  await expect(restingLine(page)).toHaveCount(0);
});

test("PLY-06.S11 a narration that fails after Start does not rest", async ({ page }) => {
  const errors = collectErrors(page);
  const net = await setup(page);
  net.answer = (rel) => (rel === pages[1]!.audio ? { status: 404 } : undefined);
  await open(page);
  await startBook(page);
  await nextButton(page).click();
  await expect(narration(page)).toHaveText(pages[1]!.text);
  await expect(pictureArea(page)).toBeVisible();
  await expect(previousButton(page)).toBeVisible();
  await expect(nextButton(page)).toBeVisible();
  await expect.poll(() => net.count(pages[1]!.audio)).toBe(1);
  expect(errors).toEqual([]);
  await nextButton(page).click();
  await expect(narration(page)).toHaveText(pages[2]!.text);
  await expect(restingLine(page)).toHaveCount(0);
});

test("PLY-06.S12 a backdrop that cannot be decoded shows the Resting state", async ({ page }) => {
  const net = await setup(page);
  const page1 = JSON.parse(read(manifest.pages[0]!.json).toString()) as PageJson & { scene: { backdrop: string } };
  page1.scene.backdrop = "pond";
  page1.assets.pond = {
    renderer: "webp",
    manifest: {
      kind: "backdrop",
      description: "a pond",
      size: { width: 2400, height: 1200 },
      variants: [{ sky: page1.scene.sky, file: "day.webp" }],
    },
    base: "assets/pond/v1/",
  };
  net.answer = (rel) => {
    if (rel === manifest.pages[0]!.json) return { status: 200, body: JSON.stringify(page1), contentType: "application/json" };
    if (rel === "assets/pond/v1/day.webp") return { status: 200, body: "not an image", contentType: "image/webp" };
    return undefined;
  };
  await open(page);
  await expect(restingLine(page)).toBeVisible();
  expect(await page.evaluate(() => window.__startEnabled)).toBe(false);
});

test("PLY-06.S13 a layer file that the sanitiser refuses shows the Resting state", async ({ page }) => {
  const net = await setup(page);
  net.answer = (rel) =>
    rel === "assets/pip/v1/stand.svg"
      ? { status: 200, body: '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', contentType: "image/svg+xml" }
      : undefined;
  await open(page);
  await expect(restingLine(page)).toBeVisible();
  expect(await page.evaluate(() => window.__startEnabled)).toBe(false);
});

test("PLY-06.S16 a release that was taken off the shelf shows the Resting state", async ({ page }) => {
  const net = await setup(page);
  net.answer = (rel) => (rel === "manifest.json" ? { status: 404 } : undefined);
  await open(page);
  await expect(restingLine(page)).toBeVisible();
  await expect(narration(page)).toHaveCount(0);
  await expect(page.locator(".sv-viewport")).toHaveCount(0);
  expect(await plays(page)).toEqual([]);
});

test("PLY-06.S17 a withdrawn book that the browser holds shows the Resting state", async ({ page }) => {
  const net = await setup(page);
  await open(page);
  await ready(page);
  net.answer = (rel) => (rel === "manifest.json" ? { status: 404 } : undefined);
  net.requests = [];
  await page.reload();
  await expect(restingLine(page)).toBeVisible();
  const content = net.requests.filter((r) => r.path.startsWith("/content/"));
  expect(content.map((r) => r.path)).toEqual([`${ROOT}manifest.json`]);
  const fetches = await page.evaluate(() => window.__fetches);
  const first = fetches.find((f) => f.url.includes("/content/releases/"))!;
  expect(first.url.endsWith(`${ROOT}manifest.json`)).toBe(true);
  expect(first.cache).toBe("no-cache");
});

test("PLY-06.S18 a book that is open stays open after a take-off", async ({ page }) => {
  const net = await setup(page);
  await open(page);
  await startBook(page);
  await nextButton(page).click();
  await expect(narration(page)).toHaveText(pages[1]!.text);
  net.answer = () => ({ status: 404 });
  await nextButton(page).click();
  await expect(narration(page)).toHaveText(pages[2]!.text);
  await expect(previousButton(page)).toBeVisible();
  await expect(nextButton(page)).toBeVisible();
  await expect(restingLine(page)).toHaveCount(0);
});

test("PLY-06.S19 a path that matches no route shows the shelf", async ({ page }) => {
  await setup(page);
  for (const target of ["/abc", "/read", `/read/${ID}/more`]) {
    await page.goto("/studio");
    const before = await page.evaluate(() => history.length);
    await page.goto(target);
    await expect(page.getByTestId("shelf-placeholder")).toBeVisible();
    expect(new URL(page.url()).pathname, target).toBe("/");
    expect(await page.evaluate(() => history.length), target).toBe(before + 1);
  }
});

test("PLY-06.S20 a book in Ready stays open after a take-off", async ({ page }) => {
  const net = await setup(page);
  await open(page);
  await ready(page);
  net.answer = () => ({ status: 404 });
  await startButton(page).click();
  await expect(narration(page)).toHaveText(pages[0]!.text);
  await expect(page.locator(".sv-viewport")).toBeVisible();
  await expect(nextButton(page)).toBeVisible();
  expect(net.count("manifest.json")).toBe(1);
  await expect(restingLine(page)).toHaveCount(0);
});

test("PLY-07.S1 a viewport under 365 px high uses the Short layout", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await open(page);
  await startBook(page);
  await nextButton(page).click();
  await expect(page.getByTestId("rail-left")).toBeVisible();
  await expect(page.getByTestId("rail-right")).toBeVisible();
  await expect(page.getByTestId("top-bar")).toHaveCount(0);
  await expect(page.getByTestId("control-row")).toHaveCount(0);
  for (const locator of [homeButton(page), previousButton(page), nextButton(page), pill(page)]) {
    expect(inViewport(await box(locator), page)).toBe(true);
  }
});

test("PLY-07.S2 a 40-word page fits at 568 x 320", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await open(page);
  await startBook(page);
  await turnTo(page, 3);
  const size = await narration(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(18);
  expect(await textFitsPanel(page)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  expect((await box(pictureArea(page))).height).toBeGreaterThanOrEqual(64);
});

test("PLY-07.S3 the Start gate of a Short viewport under 640 px wide is a stack", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await open(page);
  await ready(page);
  const panel = await box(narrationPanel(page));
  const title = await box(page.getByRole("heading", { name: manifest.title }));
  const start = await box(startButton(page));
  expect(title.y + title.height).toBeLessThanOrEqual(start.y + 0.5);
  expect(inside(title, panel)).toBe(true);
  expect(inside(start, panel)).toBe(true);
  expect(inViewport(await box(homeButton(page)), page)).toBe(true);
});

test("SYS-04.S1 reading, tapping, and turning pages sends no child data", async ({ page }) => {
  const requests: { url: string; method: string; postData: string | null; type: string }[] = [];
  // The handler has no await, so no promise can reject after the page closes (#112).
  // The `headerValue` promises are awaited below, while the page is still open.
  const pending: Promise<string | null>[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("data:")) requests.push({ url: r.url(), method: r.method(), postData: r.postData(), type: r.resourceType() });
  });
  const onResponse = (r: Response) => {
    pending.push(r.headerValue("set-cookie"));
  };
  page.on("response", onResponse);
  await setup(page);
  await open(page);
  await startBook(page);
  await tapPip(page);
  await expect(page.getByText("Hello!")).toBeVisible();
  await nextButton(page).click();
  await expect(narration(page)).toHaveText(pages[1]!.text);
  await previousButton(page).click();
  await expect(narration(page)).toHaveText(pages[0]!.text);

  // Stop collecting, then read every `Set-Cookie` header. A `headerValue` that rejects
  // here fails the test: nothing turns an error into "no cookie".
  page.off("response", onResponse);
  const values = await Promise.all(pending);
  const cookies = values.filter((value): value is string => value !== null);

  expect(requests.length).toBeGreaterThan(0);
  for (const r of requests) {
    const url = new URL(r.url);
    expect(r.method, r.url).toBe("GET");
    expect(r.postData, r.url).toBeNull();
    expect(url.origin, r.url).toBe("http://localhost:4317");
    expect(url.pathname.startsWith("/api/"), r.url).toBe(false);
    // The dev server adds a cache version (`?v=`, `?t=`) to its own module and style
    // URLs; a production build has none. Every other request must have no query.
    if (r.type !== "script" && r.type !== "stylesheet") expect(url.search, r.url).toBe("");
    if (url.pathname.startsWith("/content/")) expect(url.pathname.startsWith(ROOT), r.url).toBe(true);
  }
  expect(cookies).toEqual([]);
  const stored = await page.evaluate(() => ({
    cookie: document.cookie,
    local: localStorage.length,
    session: sessionStorage.length,
  }));
  expect(stored).toEqual({ cookie: "", local: 0, session: 0 });
});

// Screenshots of the Part A frames for the PR (#22, line 313). CI uploads
// test-results/screenshots/ as the `player-screenshots` artifact. The
// Chromium project only: one set of frames keeps the run short.
const SHOTS = path.join(import.meta.dirname, "..", "test-results", "screenshots");
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(SHOTS, `${name}.png`), animations: "disabled" });

test("Part A screenshots: Ready, reading page 1, and Resting", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  test.setTimeout(120_000);
  await setup(page);
  for (const [width, height] of [
    [1194, 834],
    [900, 600],
    [390, 844],
    [568, 320],
    [667, 375],
  ] as const) {
    await page.setViewportSize({ width, height });
    await open(page);
    await ready(page);
    await shot(page, `ready-${width}x${height}`);
    await startButton(page).click();
    await expect(narration(page)).toHaveText(pages[0]!.text);
    await shot(page, `reading-page-1-${width}x${height}`);
  }
  for (const [width, height] of [
    [1194, 834],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await open(page, MISSING_ID);
    await expect(restingLine(page)).toBeVisible();
    await shot(page, `resting-${width}x${height}`);
  }
});
