// Test helpers of the Player unit tests (jsdom). Not imported by app code.
// Each test file that mounts `BookRoute` installs the stubs in `beforeAll`
// and restores them in `afterAll`; the `ui` project has no setup file.
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { BookRoute } from "./BookRoute";
import manifestText from "../../e2e/fixtures/release/manifest.json?raw";
import page1Text from "../../e2e/fixtures/release/pages/01936b2a-0000-7000-8000-000000000011.json?raw";
import page2Text from "../../e2e/fixtures/release/pages/01936b2a-0000-7000-8000-000000000012.json?raw";
import page3Text from "../../e2e/fixtures/release/pages/01936b2a-0000-7000-8000-000000000013.json?raw";
import page4Text from "../../e2e/fixtures/release/pages/01936b2a-0000-7000-8000-000000000014.json?raw";

export const FIXTURE_ID = "01936b2a-0000-7000-8000-000000000001";
export const FIXTURE_ROOT = `/content/releases/${FIXTURE_ID}/`;
export const PAGE_IDS = [
  "01936b2a-0000-7000-8000-000000000011",
  "01936b2a-0000-7000-8000-000000000012",
  "01936b2a-0000-7000-8000-000000000013",
  "01936b2a-0000-7000-8000-000000000014",
] as const;

// Release path (under FIXTURE_ROOT) -> file text.
export const FIXTURE_FILES: Record<string, string> = {
  "manifest.json": manifestText,
  [`pages/${PAGE_IDS[0]}.json`]: page1Text,
  [`pages/${PAGE_IDS[1]}.json`]: page2Text,
  [`pages/${PAGE_IDS[2]}.json`]: page3Text,
  [`pages/${PAGE_IDS[3]}.json`]: page4Text,
};

export const FIXTURE_PAGES = [page1Text, page2Text, page3Text, page4Text].map(
  (text) => JSON.parse(text) as { pageId: string; text: string; audio: string },
);

export type FetchCall = { url: string; init: RequestInit | undefined };

// A fetch stub over FIXTURE_FILES. `override(path)` can return a Response,
// a Promise (for example one that never settles), or undefined for the file.
export function fixtureFetch(override?: (path: string) => Response | Promise<Response> | undefined) {
  const calls: FetchCall[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const path = url.startsWith(FIXTURE_ROOT) ? url.slice(FIXTURE_ROOT.length) : null;
    const custom = path === null ? undefined : override?.(path);
    if (custom !== undefined) return Promise.resolve(custom);
    const text = path === null ? undefined : FIXTURE_FILES[path];
    return Promise.resolve(text === undefined ? new Response("", { status: 404 }) : new Response(text, { status: 200 }));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export type PlayRecord = { el: HTMLMediaElement; id: string | undefined; src: string };

// The play() calls since installBrowserStubs, in order.
export const plays: PlayRecord[] = [];
export const pauses: PlayRecord[] = [];

// A Web Animation of the `Element.prototype.animate` fake. Nothing runs on
// its own: a test calls `finish()` to end it.
export type FakeAnimation = {
  target: Element;
  keyframes: Keyframe[] | PropertyIndexedKeyframes | null;
  options: number | KeyframeAnimationOptions | undefined;
  playState: AnimationPlayState;
  currentTime: number;
  finished: Promise<Animation>;
  finish(): void;
  cancel(): void;
  pause(): void;
};

// The animate() calls since installBrowserStubs, in order.
export const animations: FakeAnimation[] = [];

// Stubs for the browser APIs that jsdom lacks or does not implement.
export function installBrowserStubs(): () => void {
  const media = HTMLMediaElement.prototype;
  const image = HTMLImageElement.prototype;
  const element = Element.prototype;
  const saved = {
    play: Object.getOwnPropertyDescriptor(media, "play"),
    pause: Object.getOwnPropertyDescriptor(media, "pause"),
    decode: Object.getOwnPropertyDescriptor(image, "decode"),
    fonts: Object.getOwnPropertyDescriptor(document, "fonts"),
    resizeObserver: Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"),
    matchMedia: Object.getOwnPropertyDescriptor(window, "matchMedia"),
    animate: Object.getOwnPropertyDescriptor(element, "animate"),
  };
  const define = (target: object, key: string, value: unknown) =>
    Object.defineProperty(target, key, { value, configurable: true, writable: true });

  define(media, "play", function (this: HTMLMediaElement) {
    plays.push({ el: this, id: this.dataset.testid, src: this.src });
    return Promise.resolve();
  });
  define(media, "pause", function (this: HTMLMediaElement) {
    pauses.push({ el: this, id: this.dataset.testid, src: this.src });
  });
  define(image, "decode", () => Promise.resolve());
  define(document, "fonts", { load: () => Promise.resolve([]) });
  define(
    globalThis,
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  define(window, "matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
  define(
    element,
    "animate",
    function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
      let resolve!: (value: Animation) => void;
      let reject!: (reason: unknown) => void;
      const finished = new Promise<Animation>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      // A cancelled animation rejects `finished`; no test waits for that.
      finished.catch(() => {});
      const animation: FakeAnimation = {
        target: this,
        keyframes,
        options,
        playState: "running",
        currentTime: 0,
        finished,
        finish() {
          if (animation.playState !== "running" && animation.playState !== "paused") return;
          animation.playState = "finished";
          resolve(animation as unknown as Animation);
        },
        cancel() {
          animation.playState = "idle";
          reject(new DOMException("", "AbortError"));
        },
        pause() {
          animation.playState = "paused";
        },
      };
      animations.push(animation);
      return animation as unknown as Animation;
    },
  );

  return () => {
    const restore = (target: object, key: string, d: PropertyDescriptor | undefined) => {
      if (d) Object.defineProperty(target, key, d);
      else delete (target as Record<string, unknown>)[key];
    };
    restore(media, "play", saved.play);
    restore(media, "pause", saved.pause);
    restore(image, "decode", saved.decode);
    restore(document, "fonts", saved.fonts);
    restore(globalThis, "ResizeObserver", saved.resizeObserver);
    restore(window, "matchMedia", saved.matchMedia);
    restore(element, "animate", saved.animate);
  };
}

// Renders `BookRoute` at /read/<releaseId> in a memory router that also has
// a `/` route, so Home can navigate.
export function renderBook(releaseId: string, props: { textureUrl?: string | null } = {}) {
  const root = createRootRoute({ component: Outlet });
  const shelf = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <main data-testid="shelf-placeholder" />,
  });
  const read = createRoute({
    getParentRoute: () => root,
    path: "/read/$releaseId",
    component: function Read() {
      const params = read.useParams();
      return <BookRoute releaseId={params.releaseId} textureUrl={props.textureUrl ?? null} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([shelf, read]),
    history: createMemoryHistory({ initialEntries: [`/read/${releaseId}`] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
