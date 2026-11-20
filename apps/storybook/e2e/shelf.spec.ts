import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page, type Route, test } from "@playwright/test";
import { makeSilentWav } from "./wav";

// Browser tests of the shelf at / (#77). `GET /api/shelf` and every request
// under /content/releases/ are answered here; every book ID serves the
// release of e2e/fixtures/release/.

const DIR = path.join(import.meta.dirname, "fixtures", "release");
const read = (rel: string) => readFileSync(path.join(DIR, rel));
const PUBLISHED_AT = "2026-11-19T08:30:00.000Z";
const PAPER = "rgb(255, 248, 236)";
const DAY_SKY = "rgb(207, 230, 238)"; // #CFE6EE
const NIGHT_SKY = "rgb(47, 64, 102)"; // #2F4066
const FAULT_WORDS = /error|fail|wrong|problem/i;

type PageJson = { pageId: string; text: string; audio: string };
const manifest = JSON.parse(read("manifest.json").toString()) as { pages: { pageId: string; json: string }[] };
const pages = manifest.pages.map((p) => JSON.parse(read(p.json).toString()) as PageJson);
const PAGE1 = manifest.pages[0]!.json;

// Book n (1 to 7): a UUID v7, "Book n".
const idOf = (n: number) => `01936b2a-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`;
const rootOf = (n: number) => `/content/releases/${idOf(n)}/`;
type Book = { releaseId: string; title: string; publishedAt: string };
const bookOf = (n: number): Book => ({ releaseId: idOf(n), title: `Book ${n}`, publishedAt: PUBLISHED_AT });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

declare global {
  interface Window {
    __fetches: { url: string; cache: string }[];
  }
}

// An answer: a status and body, "hold" (answered when `release()` is
// called), or "hang" (never answered).
type Answer = { status: number; body?: string | Buffer; contentType?: string } | "hold" | "hang";
type Fulfil = { status: number; body: string | Buffer; contentType?: string };

const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".wav": "audio/wav",
};

class ShelfNet {
  books: Book[] = [];
  // Attempt 0 is the first `/api/shelf` request of the page.
  shelf: (attempt: number) => Answer | undefined = () => undefined;
  file: (id: string, rel: string) => Answer | undefined = () => undefined;
  shelfRequests: { method: string; query: string; postData: string | null }[] = [];
  requests: { id: string; rel: string; method: string; postData: string | null }[] = [];
  private heldShelf: Route[] = [];
  private heldFiles: { route: Route; id: string; rel: string }[] = [];

  get held(): number {
    return this.heldShelf.length + this.heldFiles.length;
  }

  ids(): string[] {
    return [...new Set(this.requests.map((r) => r.id))].sort();
  }

  async release(): Promise<void> {
    const shelf = this.heldShelf;
    const files = this.heldFiles;
    this.heldShelf = [];
    this.heldFiles = [];
    for (const route of shelf) await route.fulfill(this.shelfBody());
    for (const { route, id, rel } of files) await route.fulfill(fileAnswer(id, rel));
  }

  shelfBody(): Fulfil {
    return { status: 200, contentType: "application/json", body: JSON.stringify({ books: this.books }) };
  }

  async handleShelf(route: Route): Promise<void> {
    const request = route.request();
    const attempt = this.shelfRequests.length;
    this.shelfRequests.push({ method: request.method(), query: new URL(request.url()).search, postData: request.postData() });
    const custom = this.shelf(attempt);
    if (custom === "hang") return;
    if (custom === "hold") {
      this.heldShelf.push(route);
      return;
    }
    if (custom) return route.fulfill({ status: custom.status, body: custom.body ?? "", contentType: custom.contentType });
    return route.fulfill(this.shelfBody());
  }

  async handleFile(route: Route): Promise<void> {
    const request = route.request();
    const parts = new URL(request.url()).pathname.slice("/content/releases/".length).split("/");
    const id = parts[0]!;
    const rel = parts.slice(1).join("/");
    this.requests.push({ id, rel, method: request.method(), postData: request.postData() });
    const custom = this.file(id, rel);
    if (custom === "hang") return;
    if (custom === "hold") {
      this.heldFiles.push({ route, id, rel });
      return;
    }
    if (custom) return route.fulfill({ status: custom.status, body: custom.body ?? "", contentType: custom.contentType });
    return route.fulfill(fileAnswer(id, rel));
  }
}

// The fixture release for every ID; the manifest names the requested ID.
function fileAnswer(id: string, rel: string): Fulfil {
  if (rel === "manifest.json") {
    const body = JSON.stringify({ ...JSON.parse(read("manifest.json").toString()), releaseId: id });
    return { status: 200, body, contentType: "application/json" };
  }
  if (rel.endsWith(".wav")) return { status: 200, body: Buffer.from(makeSilentWav(1000)), contentType: "audio/wav" };
  const file = path.join(DIR, rel);
  if (rel.includes("..") || !existsSync(file)) return { status: 404, body: "" };
  return { status: 200, body: readFileSync(file), contentType: TYPES[path.extname(rel)] };
}

async function shelfSetup(
  page: Page,
  opts: { books?: number[]; shelf?: ShelfNet["shelf"]; file?: ShelfNet["file"] } = {},
): Promise<ShelfNet> {
  const net = new ShelfNet();
  net.books = (opts.books ?? []).map(bookOf);
  if (opts.shelf) net.shelf = opts.shelf;
  if (opts.file) net.file = opts.file;
  await page.addInitScript(() => {
    window.__fetches = [];
    const originalFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url = input instanceof Request ? input.url : String(input);
      window.__fetches.push({ url, cache: init?.cache ?? "default" });
      return originalFetch(input, init);
    };
  });
  await page.route(
    (url) => url.pathname === "/api/shelf",
    (route) => net.handleShelf(route),
  );
  await page.route(
    (url) => url.pathname.startsWith("/content/releases/"),
    (route) => net.handleFile(route),
  );
  return net;
}

const bookLink = (page: Page, n: number) => page.getByRole("link", { name: "Open the book: Book " + n });
const bookLinks = (page: Page) => page.getByRole("link", { name: /^Open the book: / });
const windowOf = (page: Page, n: number) => bookLink(page, n).getByTestId("cover-window");
const shelfMain = (page: Page) => page.getByTestId("shelf");
const boards = (page: Page) => page.getByTestId("shelf-board");
const plate = (page: Page) => page.getByTestId("shelf-plate");
const previousBooks = (page: Page) => page.getByRole("button", { name: "Previous books" });
const nextBooks = (page: Page) => page.getByRole("button", { name: "Next books" });
const lookAgain = (page: Page) => page.getByRole("button", { name: "Look again" });
const homeButton = (page: Page) => page.getByRole("button", { name: "Home" });
const startButton = (page: Page) => page.getByRole("button", { name: "Start the story" });
const nextPage = (page: Page) => page.getByRole("button", { name: "Next page" });
const narration = (page: Page) => page.getByTestId("narration");
const drawn = (page: Page) => page.locator('[data-cover="drawn"]');
const pathname = (page: Page) => new URL(page.url()).pathname;

async function ready(page: Page) {
  await expect(startButton(page)).toBeVisible();
  await expect(startButton(page)).not.toHaveAttribute("aria-disabled", "true");
}

async function startBook(page: Page) {
  await ready(page);
  await startButton(page).click();
  await expect(narration(page)).toHaveText(pages[0]!.text);
}

type Box = { x: number; y: number; width: number; height: number };
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, "element has a box").not.toBeNull();
  return b!;
}
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inViewport = (b: Box, page: Page) => {
  const v = page.viewportSize()!;
  return b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= v.width + 0.5 && b.y + b.height <= v.height + 0.5;
};
const noScroll = (page: Page) =>
  page.evaluate(() => {
    const s = document.scrollingElement!;
    return s.scrollHeight <= window.innerHeight && s.scrollWidth <= window.innerWidth;
  });

// The computed fill of every SVG part inside `locator` (the sign of a plate).
const fills = (locator: Locator) =>
  locator.evaluate((el) => [...el.querySelectorAll("svg *")].map((part) => getComputedStyle(part).fill));

function collectErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  return errors;
}

const wide = (page: Page) => page.setViewportSize({ width: 1194, height: 834 });

test("PLY-05.S1 the shelf is the home of the Player", async ({ page }) => {
  const net = await shelfSetup(page, { books: [1, 2] });
  await wide(page);
  await page.goto("/");
  await expect(bookLinks(page)).toHaveCount(2);
  await expect(bookLink(page, 1)).toContainText("Book 1");
  await expect(bookLink(page, 2)).toContainText("Book 2");
  await expect(bookLink(page, 1).locator('[data-cover="drawn"]')).toHaveCount(1);
  await expect(bookLink(page, 2).locator('[data-cover="drawn"]')).toHaveCount(1);
  await expect(homeButton(page)).toHaveCount(0);
  expect(net.shelfRequests).toHaveLength(1);
});

test("PLY-05.S2 the shelf waits with dots", async ({ page }) => {
  await shelfSetup(page, { books: [1, 2], shelf: () => "hang" });
  await wide(page);
  await page.goto("/");
  await expect(shelfMain(page)).toBeVisible();
  await expect(plate(page).locator("span")).toHaveCount(3);
  await expect(boards(page)).toHaveCount(2);
  await expect(page.getByRole("link")).toHaveCount(0);
});

test("PLY-05.S3 a tap on a book opens its release", async ({ page }) => {
  await shelfSetup(page, { books: [1, 2] });
  await page.goto("/");
  await expect(bookLink(page, 1)).toHaveAccessibleName("Open the book: Book 1");
  await bookLink(page, 1).click();
  await expect.poll(() => pathname(page)).toBe(`/read/${idOf(1)}`);
  await expect(startButton(page)).toBeVisible();
});

test("PLY-05.S4 the books stand in the order of the response", async ({ page }) => {
  await shelfSetup(page, { books: [3, 1, 2] });
  await wide(page);
  await page.goto("/");
  await expect(bookLinks(page)).toHaveCount(3);
  const hrefs = await bookLinks(page).evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(hrefs).toEqual([3, 1, 2].map((n) => `/read/${idOf(n)}`));
  // Layout positions (a tilt and hover move the boxes): one board, x order 3, 1, 2.
  const at = await bookLinks(page).evaluateAll((els) =>
    els.map((el) => ({ left: (el as HTMLElement).offsetLeft, top: (el as HTMLElement).offsetTop })),
  );
  expect(at[0]!.left).toBeLessThan(at[1]!.left);
  expect(at[1]!.left).toBeLessThan(at[2]!.left);
  expect(at[1]!.top).toBe(at[0]!.top);
  expect(at[2]!.top).toBe(at[0]!.top);
});

test("PLY-05.S5 more books than one shelf page", async ({ page }) => {
  await shelfSetup(page, { books: range(1, 7) });
  await wide(page);
  await page.goto("/");
  await expect(bookLinks(page)).toHaveCount(6);
  for (const n of range(1, 6)) await expect(bookLink(page, n)).toBeVisible();
  await expect(bookLink(page, 7)).toHaveCount(0);
  await expect(previousBooks(page)).toHaveAttribute("aria-disabled", "true");
  await expect(nextBooks(page)).toBeVisible();
  await expect(nextBooks(page)).not.toHaveAttribute("aria-disabled", "true");
  expect(await noScroll(page)).toBe(true);
});

test("PLY-05.S6 next shows the next shelf page", async ({ page }) => {
  await shelfSetup(page, { books: range(1, 7) });
  await wide(page);
  await page.goto("/");
  await expect(bookLinks(page)).toHaveCount(6);
  // The click and the read are in one evaluate, so the 200 ms cross-fade is
  // still running when `getAnimations()` is read.
  const animations = await page.evaluate(async () => {
    document.querySelector<HTMLElement>('[aria-label="Next books"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return document.getAnimations().flatMap((a) => {
      const effect = a.effect;
      if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof HTMLElement)) return [];
      if (effect.target.dataset.testid !== "shelf-page") return [];
      const props = new Set<string>();
      for (const frame of effect.getKeyframes()) {
        for (const key of Object.keys(frame)) {
          if (!["offset", "computedOffset", "easing", "composite"].includes(key)) props.add(key);
        }
      }
      return [{ leaving: effect.target.hasAttribute("inert"), duration: effect.getTiming().duration, props: [...props] }];
    });
  });
  expect(animations).toHaveLength(2);
  expect(animations.map((a) => a.leaving).sort()).toEqual([false, true]);
  for (const a of animations) {
    expect(a.duration).toBe(200);
    expect(a.props).toEqual(["opacity"]);
  }
  await expect(bookLinks(page)).toHaveCount(1);
  await expect(bookLink(page, 7)).toBeVisible();
  await expect(nextBooks(page)).toHaveAttribute("aria-disabled", "true");
  await expect(previousBooks(page)).not.toHaveAttribute("aria-disabled", "true");
});

test("PLY-05.S7 one shelf page has no arrows", async ({ page }) => {
  await shelfSetup(page, { books: range(1, 6) });
  await wide(page);
  await page.goto("/");
  await expect(bookLinks(page)).toHaveCount(6);
  await expect(previousBooks(page)).toHaveCount(0);
  await expect(nextBooks(page)).toHaveCount(0);
});

test("PLY-05.S8 an empty shelf is quiet", async ({ page }) => {
  await shelfSetup(page, { books: [] });
  await wide(page);
  await page.goto("/");
  await expect(page.getByText("New stories are coming soon.")).toBeVisible();
  await expect(boards(page)).toHaveCount(2);
  await expect(page.getByRole("link")).toHaveCount(0);
  const signFills = await fills(plate(page));
  expect(signFills).toContain(DAY_SKY);
  expect(signFills).not.toContain(NIGHT_SKY);
  await expect(page.getByRole("button")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(FAULT_WORDS);
});

test("PLY-05.S9 a shelf that cannot be loaded is quiet", async ({ page }) => {
  await shelfSetup(page, { books: [1], shelf: () => ({ status: 500 }) });
  await wide(page);
  await page.goto("/");
  await expect(page.getByText("The books are sleeping. Come back soon.")).toBeVisible();
  await expect(boards(page)).toHaveCount(2);
  await expect(page.getByRole("link")).toHaveCount(0);
  const signFills = await fills(plate(page));
  expect(signFills).toContain(NIGHT_SKY);
  expect(signFills).not.toContain(DAY_SKY);
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(lookAgain(page)).toBeVisible();
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(FAULT_WORDS);
});

test("PLY-05.S10 Look again sends the request again", async ({ page }) => {
  const net = await shelfSetup(page, { books: [1], shelf: (attempt) => (attempt === 0 ? { status: 500 } : undefined) });
  await page.goto("/");
  await expect(lookAgain(page)).toBeVisible();
  await lookAgain(page).click();
  await expect(shelfMain(page)).toBeFocused();
  await expect.poll(() => net.shelfRequests.length).toBe(2);
  await expect(bookLink(page, 1)).toBeVisible();
});

test("PLY-05.S11 a cover is the page 1 scene as a still picture", async ({ page }) => {
  await shelfSetup(page, { books: [1] });
  await page.goto("/");
  const win = windowOf(page, 1);
  await expect(win).toHaveAttribute("data-cover", "drawn");
  const viewport = win.locator('.sv-viewport[data-mode="still"]');
  await expect(viewport).toHaveCount(1);
  await expect(viewport.locator("[role], [tabindex]")).toHaveCount(0);
  const cat = viewport.locator('[data-instance-id="01936b2a-0000-7000-8000-000000000031"]:not(.sv-margin)');
  await expect(cat).toHaveCount(1);
  expect(await cat.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  const running = await viewport.evaluate(
    (vp) => document.getAnimations().filter((a) => a.effect instanceof KeyframeEffect && !!a.effect.target && vp.contains(a.effect.target)).length,
  );
  expect(running).toBe(0);
});

test("PLY-05.S12 a book shows before its cover is loaded", async ({ page, context }) => {
  const net = await shelfSetup(page, {
    books: [1],
    file: (id, rel) => (id === idOf(1) && rel === PAGE1 ? "hold" : undefined),
  });
  await page.goto("/");
  await expect(bookLink(page, 1)).toContainText("Book 1");
  await expect.poll(() => net.held).toBeGreaterThan(0);
  const win = windowOf(page, 1);
  await expect(win).toHaveAttribute("data-cover", "waiting");
  expect(await win.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(PAPER);
  await expect(bookLink(page, 1)).toBeEnabled();
  await expect(bookLink(page, 1)).toHaveAttribute("href", `/read/${idOf(1)}`);

  await net.release();
  await expect(win).toHaveAttribute("data-cover", "drawn");
  const cover = win.getByTestId("cover");
  expect(await cover.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0.2s");
  await expect.poll(() => cover.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await bookLink(page, 1).click();
  await expect.poll(() => pathname(page)).toBe(`/read/${idOf(1)}`);

  const reduced = await context.newPage();
  await shelfSetup(reduced, { books: [1] });
  await reduced.emulateMedia({ reducedMotion: "reduce" });
  await reduced.goto("/");
  await expect(windowOf(reduced, 1)).toHaveAttribute("data-cover", "drawn");
  expect(await windowOf(reduced, 1).getByTestId("cover").evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
});

test("PLY-05.S13 a cover that fails to load keeps the paper colour", async ({ page }) => {
  const errors = collectErrors(page);
  await shelfSetup(page, {
    books: [1],
    file: (id, rel) => (id === idOf(1) && rel === PAGE1 ? { status: 500 } : undefined),
  });
  await page.goto("/");
  const win = windowOf(page, 1);
  await expect(win).toHaveAttribute("data-cover", "paper");
  expect(await win.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(PAPER);
  await expect(win.getByTestId("cover")).toHaveCount(0);
  expect(errors).toEqual([]);
  await bookLink(page, 1).click();
  await expect.poll(() => pathname(page)).toBe(`/read/${idOf(1)}`);
});

test("PLY-05.S14 only the covers of the shown shelf page are loaded", async ({ page }) => {
  const net = await shelfSetup(page, { books: range(1, 7) });
  await wide(page);
  await page.goto("/");
  await expect(drawn(page)).toHaveCount(6);
  expect(net.ids()).toEqual(range(1, 6).map(idOf));
  await nextBooks(page).click();
  await expect(windowOf(page, 7)).toHaveAttribute("data-cover", "drawn");
  expect(net.ids()).toEqual(range(1, 7).map(idOf));
});

test("PLY-05.S15 the shelf opens on its first shelf page", async ({ page }) => {
  await shelfSetup(page, { books: range(1, 7) });
  await wide(page);
  await page.goto("/");
  await expect(bookLinks(page)).toHaveCount(6);
  await nextBooks(page).click();
  await expect(bookLinks(page)).toHaveCount(1);
  await bookLink(page, 7).click();
  await expect.poll(() => pathname(page)).toBe(`/read/${idOf(7)}`);
  await startBook(page);
  await homeButton(page).click();
  await expect.poll(() => pathname(page)).toBe("/");
  await expect(bookLinks(page)).toHaveCount(6);
  for (const n of range(1, 6)) await expect(bookLink(page, n)).toBeVisible();
  await expect(bookLink(page, 7)).toHaveCount(0);
});

test("PLY-05.S19 a cover loads only the files of its picture", async ({ page }) => {
  // Page 1 with a second pose `sit` and a `set_pose` action on the pip tap.
  type Page1 = {
    scene: { interactions: { on: { tap: string }; do: Record<string, unknown>[] }[] };
    assets: {
      pip: {
        manifest: {
          poses: { id: string; file: string; foot: unknown; box: unknown }[];
          legal: { pose: string; expression: string }[];
        };
      };
    };
  };
  const page1 = JSON.parse(read(PAGE1).toString()) as Page1;
  const pip = page1.assets.pip.manifest;
  const stand = pip.poses[0]!;
  pip.poses.push({ id: "sit", file: "sit.svg", foot: stand.foot, box: stand.box });
  pip.legal.push({ pose: "sit", expression: "calm" }, { pose: "sit", expression: "happy" });
  const tap = page1.scene.interactions[0]!;
  tap.do.push({ action: "set_pose", target: tap.on.tap, pose: "sit" });
  const body = JSON.stringify(page1);

  const net = await shelfSetup(page, {
    books: [1],
    file: (id, rel) => (id === idOf(1) && rel === PAGE1 ? { status: 200, body, contentType: "application/json" } : undefined),
  });
  await page.goto("/");
  await expect(windowOf(page, 1)).toHaveAttribute("data-cover", "drawn");
  const rels = net.requests.filter((r) => r.id === idOf(1)).map((r) => r.rel);
  expect([...rels].sort()).toEqual(
    ["manifest.json", PAGE1, "assets/meadow/v1/day.svg", "assets/pip/v1/stand.svg", "assets/cat/v1/stand.webp"].sort(),
  );
  const otherPages = manifest.pages.slice(1).map((p) => p.json);
  for (const rel of rels) {
    expect(rel.endsWith("sit.svg"), rel).toBe(false);
    expect(rel.endsWith(".wav"), rel).toBe(false);
    expect(otherPages.includes(rel), rel).toBe(false);
  }
  const fetches = await page.evaluate(() => window.__fetches);
  const first = fetches.find((f) => new URL(f.url, page.url()).pathname.startsWith(rootOf(1)))!;
  expect(new URL(first.url, page.url()).pathname).toBe(`${rootOf(1)}manifest.json`);
  expect(first.cache).toBe("no-cache");
});

test("PLY-05.S20 a cover fills its window and is cut at the sides", async ({ page }) => {
  await shelfSetup(page, { books: [1] });
  await wide(page);
  await page.goto("/");
  const win = windowOf(page, 1);
  await expect(win).toHaveAttribute("data-cover", "drawn");
  const m = await win.evaluate((el) => {
    const w = el as HTMLElement;
    const vp = w.querySelector<HTMLElement>(".sv-viewport")!;
    const frame = w.querySelector<HTMLElement>(".sv-frame")!;
    const scale = /scale\(([^)]+)\)/.exec(frame.style.transform);
    return {
      w: w.offsetWidth,
      h: w.offsetHeight,
      vw: vp.clientWidth,
      vh: vp.clientHeight,
      left: parseFloat(frame.style.left),
      k: scale ? Number(scale[1]) : NaN,
    };
  });
  expect([m.w, m.h]).toEqual([151, 148]);
  expect([m.vw, m.vh]).toEqual([151, 148]);
  expect(Math.round(-m.left / m.k - 400)).toBe(188);
  expect(Math.round((151 - m.left) / m.k - 400)).toBe(1412);
});

test("PLY-05.S21 the Wide shelf fits 900 x 600", async ({ page }) => {
  await shelfSetup(page, { books: range(1, 6) });
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");
  await expect(bookLinks(page)).toHaveCount(6);
  expect(inViewport(await box(page.getByRole("heading", { name: "Lullabyte" })), page)).toBe(true);
  await expect(boards(page)).toHaveCount(2);
  for (const b of await boards(page).all()) expect(inViewport(await box(b), page)).toBe(true);
  expect(await noScroll(page)).toBe(true);
  // Layout sizes relative to the book: the plate is the Paper ancestor of the title.
  const parts = await bookLinks(page).evaluateAll((els, paper) =>
    els.map((el) => {
      const book = el as HTMLElement;
      const offsetIn = (part: HTMLElement) => {
        let top = 0;
        let node: HTMLElement | null = part;
        while (node && node !== book) {
          top += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        return node === book ? top : NaN;
      };
      const title = [...book.querySelectorAll<HTMLElement>("*")].find(
        (e) => e.childElementCount === 0 && /^Book \d+$/.test(e.textContent?.trim() ?? ""),
      );
      let plateEl: HTMLElement | null = title ?? null;
      while (plateEl && plateEl !== book && getComputedStyle(plateEl).backgroundColor !== paper) plateEl = plateEl.parentElement;
      const win = book.querySelector<HTMLElement>('[data-testid="cover-window"]');
      const found = !!plateEl && plateEl !== book && !!win;
      return {
        found,
        plateBottom: found ? offsetIn(plateEl!) + plateEl!.offsetHeight : NaN,
        windowTop: found ? offsetIn(win!) : NaN,
      };
    }),
  PAPER);
  expect(parts).toHaveLength(6);
  for (const p of parts) {
    expect(p.found).toBe(true);
    expect(p.plateBottom).toBeLessThanOrEqual(p.windowTop);
  }
});

test("PLY-06.S4 a book that is opened again shows its Start gate", async ({ page }) => {
  await shelfSetup(page, { books: [1] });
  await page.goto("/");
  await bookLink(page, 1).click();
  await startBook(page);
  for (const i of [1, 2]) {
    await nextPage(page).click();
    await expect(narration(page)).toHaveText(pages[i]!.text);
  }
  await homeButton(page).click();
  await bookLink(page, 1).click();
  await expect.poll(() => pathname(page)).toBe(`/read/${idOf(1)}`);
  await expect(startButton(page)).toBeVisible();
  await expect(narration(page)).toBeHidden();
});

test("PLY-06.S15 Home moves the focus to the shelf", async ({ page }) => {
  const net = await shelfSetup(page, { books: [1, 2], shelf: (attempt) => (attempt === 0 ? "hold" : undefined) });
  await page.goto(`/read/${idOf(1)}`);
  await startBook(page);
  for (const i of [1, 2]) {
    await nextPage(page).click();
    await expect(narration(page)).toHaveText(pages[i]!.text);
  }
  await homeButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(shelfMain(page)).toBeFocused();
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect.poll(() => net.held).toBe(1);
  await net.release();
  await expect(bookLink(page, 1)).toBeVisible();
  await expect(shelfMain(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(bookLink(page, 1)).toBeFocused();
});

test("PLY-07.S4 the shelf at 568 x 320 has 2 books", async ({ page }) => {
  await shelfSetup(page, { books: [1, 2, 3] });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await expect(bookLinks(page)).toHaveCount(2);
  await expect(boards(page)).toHaveCount(1);
  const widths = await bookLinks(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetWidth));
  for (const w of widths) expect(w).toBeGreaterThanOrEqual(128);
  await expect(previousBooks(page)).toBeVisible();
  await expect(nextBooks(page)).toBeVisible();
  expect(await noScroll(page)).toBe(true);
  const name = await box(page.getByRole("heading", { name: "Lullabyte" }));
  expect(inViewport(name, page)).toBe(true);
  for (const b of await boards(page).all()) expect(intersects(name, await box(b))).toBe(false);
  await expect(page.getByTestId("rail-left")).toHaveCount(0);
});

test("SYS-04.S4 the shelf sends no child data", async ({ page }) => {
  const requests: { url: string; method: string; postData: string | null; type: string }[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("data:")) requests.push({ url: r.url(), method: r.method(), postData: r.postData(), type: r.resourceType() });
  });
  await shelfSetup(page, { books: [1, 2] });
  await wide(page);
  await page.goto("/");
  await expect(drawn(page)).toHaveCount(2);

  expect(requests.length).toBeGreaterThan(0);
  const api: URL[] = [];
  for (const r of requests) {
    const url = new URL(r.url);
    expect(r.method, r.url).toBe("GET");
    expect(r.postData, r.url).toBeNull();
    expect(url.origin, r.url).toBe("http://localhost:4317");
    // `vite dev` adds a cache version to its own module and style URLs.
    if (r.type !== "script" && r.type !== "stylesheet") expect(url.search, r.url).toBe("");
    if (url.pathname.startsWith("/api/")) api.push(url);
    if (url.pathname.startsWith("/content/")) {
      expect(url.pathname.startsWith(rootOf(1)) || url.pathname.startsWith(rootOf(2)), r.url).toBe(true);
    }
  }
  expect(api.map((u) => u.pathname + u.search)).toEqual(["/api/shelf"]);
  const stored = await page.evaluate(() => ({
    cookie: document.cookie,
    local: localStorage.length,
    session: sessionStorage.length,
  }));
  expect(stored).toEqual({ cookie: "", local: 0, session: 0 });
});

test("a focused book shows the ring of three lines", async ({ page }) => {
  await shelfSetup(page, { books: [1, 2] });
  await wide(page);
  await page.goto("/");
  await expect(bookLink(page, 1)).toBeVisible();
  await expect(shelfMain(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(bookLink(page, 1)).toBeFocused();
  const ring = await bookLink(page, 1).evaluate((el) => {
    const s = getComputedStyle(el);
    const after = getComputedStyle(el, "::after");
    return {
      outline: [s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset],
      boxShadow: s.boxShadow,
      zIndex: s.zIndex,
      after: {
        content: after.content,
        position: after.position,
        inset: [after.top, after.right, after.bottom, after.left],
        border: [after.borderTopStyle, after.borderTopWidth, after.borderTopColor],
      },
    };
  });
  // Ink outline 3 px at 3 px; Card 3 px inside it; Sun yellow ring at -9 px.
  expect(ring.outline).toEqual(["solid", "3px", "rgb(58, 46, 37)", "3px"]);
  expect(ring.boxShadow.startsWith("rgb(255, 253, 248) 0px 0px 0px 3px"), ring.boxShadow).toBe(true);
  expect(ring.boxShadow, "cloth edge of place 1").toContain("rgb(158, 77, 56) 0px 4px 0px");
  expect(ring.zIndex).toBe("1");
  expect(ring.after.content).not.toBe("none");
  expect(ring.after.position).toBe("absolute");
  expect(ring.after.inset).toEqual(["-9px", "-9px", "-9px", "-9px"]);
  expect(ring.after.border).toEqual(["solid", "3px", "rgb(226, 174, 74)"]);
});

test("a book opened from the shelf puts the focus on Home", async ({ page }) => {
  await shelfSetup(page, { books: [1] });
  await page.goto("/");
  await bookLink(page, 1).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => pathname(page)).toBe(`/read/${idOf(1)}`);
  await expect(homeButton(page)).toBeFocused();
});

test("Look again fits the plate at 320 x 480", async ({ page }) => {
  await shelfSetup(page, { books: [1], shelf: () => ({ status: 500 }) });
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/");
  await expect(lookAgain(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const fit = await plate(page).evaluate((el) => {
    const s = getComputedStyle(el);
    const p = el.getBoundingClientRect();
    const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Look again"));
    const b = button?.getBoundingClientRect();
    return {
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
      content: {
        left: p.left + parseFloat(s.paddingLeft),
        right: p.right - parseFloat(s.paddingRight),
        top: p.top + parseFloat(s.paddingTop),
        bottom: p.bottom - parseFloat(s.paddingBottom),
      },
      button: b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom } : null,
    };
  });
  // P77-5 = 16: the plate keeps 16 px padding at 320 px wide.
  expect(fit.padding).toEqual(["16px", "16px", "16px", "16px"]);
  expect(fit.button).not.toBeNull();
  expect(fit.button!.left).toBeGreaterThanOrEqual(fit.content.left - 0.5);
  expect(fit.button!.right).toBeLessThanOrEqual(fit.content.right + 0.5);
  expect(fit.button!.top).toBeGreaterThanOrEqual(fit.content.top - 0.5);
  expect(fit.button!.bottom).toBeLessThanOrEqual(fit.content.bottom + 0.5);
});

// Screenshots of the shelf for the PR (#77). CI uploads test-results/screenshots/
// as the `player-screenshots` artifact. The Chromium project only.
const SHOTS = path.join(import.meta.dirname, "..", "test-results", "screenshots");
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(SHOTS, `shelf-${name}.png`), animations: "disabled" });

test("Shelf screenshots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "Chromium project only");
  test.setTimeout(180_000);
  const net = await shelfSetup(page, { books: range(1, 7) });
  const answers: Record<string, () => Answer | undefined> = {
    books: () => undefined,
    waiting: () => "hang",
    empty: () => ({ status: 200, contentType: "application/json", body: JSON.stringify({ books: [] }) }),
    failed: () => ({ status: 500 }),
  };
  async function show(state: string, width: number, height: number) {
    net.shelf = answers[state]!;
    await page.setViewportSize({ width, height });
    await page.goto("/");
    if (state === "books") {
      await expect(bookLinks(page).first()).toBeVisible();
      await expect(page.locator('[data-cover="waiting"]')).toHaveCount(0);
    } else if (state === "waiting") {
      await expect(plate(page)).toBeVisible();
    } else if (state === "empty") {
      await expect(page.getByText("New stories are coming soon.")).toBeVisible();
    } else {
      await expect(lookAgain(page)).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
  }
  const books: [number, number][] = [
    [1194, 834],
    [900, 600],
    [390, 844],
    [375, 553],
    [320, 480],
    [667, 375],
    [568, 320],
  ];
  for (const [w, h] of books) {
    await show("books", w, h);
    await shot(page, `books-${w}x${h}`);
  }
  for (const state of ["waiting", "empty", "failed"]) {
    for (const [w, h] of [
      [1194, 834],
      [390, 844],
      [568, 320],
    ] as const) {
      await show(state, w, h);
      await shot(page, `${state}-${w}x${h}`);
    }
  }
  await show("failed", 320, 480);
  await shot(page, "failed-320x480");
  await show("books", 1194, 834);
  await page.keyboard.press("Tab");
  await expect(bookLink(page, 1)).toBeFocused();
  await shot(page, "focus-1194x834");
});
