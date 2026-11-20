import type { PageScene } from "@storybook/dsl";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { vi } from "vitest";
import type {
  RegistryResponse,
  ReleaseCreated,
  RunResponse,
  StoryDetailResponse,
  StoryListResponse,
} from "./api";

// Test data and helpers for the Studio tests (#23). Test only: no app file
// imports this file.

// A lower-case UUID v7 that is fixed by `n`.
export function uuid(n: number): string {
  return `01890a5d-ac96-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

export const CREATED_AT = "2026-11-19T10:00:00.000Z";

export const FOX_LAYER_ID = uuid(900);

// The one scene of every test. It passes `PageSceneSchema`, and its layer has `at`.
export function sceneFixture(): PageScene {
  return {
    templateId: "meadow-two",
    backdrop: "meadow",
    sky: "day",
    layers: [
      {
        instanceId: FOX_LAYER_ID,
        kind: "character",
        ref: "fox",
        slot: "left",
        at: { x: 0.3, y: 0.8, scale: 1, z: 1 },
      },
    ],
    animations: [{ target: FOX_LAYER_ID, primitive: "float", params: { amplitude: 0.01, period: 4 }, trigger: "loop" }],
    interactions: [
      { on: { tap: FOX_LAYER_ID }, do: [{ action: "play_animation", target: FOX_LAYER_ID, primitive: "bounce" }] },
    ],
  };
}

// The asset versions that the scene of `sceneFixture()` records.
export const SCENE_VERSIONS = { fox: 1, meadow: 1 };

type Revision = StoryDetailResponse["source"];
type Page = StoryDetailResponse["pages"][number];
type Release = StoryDetailResponse["releases"][number];
type RunStep = RunResponse["steps"][number];

let nextRevision = 1000;

export function revisionFixture(kind: Revision["kind"], over: Partial<Revision> = {}): Revision {
  nextRevision += 1;
  return {
    id: uuid(nextRevision),
    kind,
    pageId: "",
    status: "ok",
    origin: "ai",
    content: null,
    error: null,
    basis: {},
    assetVersions: null,
    createdAt: CREATED_AT,
    fileUrl: null,
    ...over,
  };
}

export function pageId(number: number): string {
  return uuid(100 + number);
}

// A page with current text, scene, and audio, in the state `ok`.
export function pageFixture(number: number, over: Partial<Page> = {}): Page {
  const id = pageId(number);
  return {
    pageId: id,
    number,
    beat: `Beat ${number}`,
    state: "ok",
    problems: [],
    text: revisionFixture("page_text", { pageId: id, content: { text: `The fox sees page ${number}.` } }),
    scene: revisionFixture("scene", { pageId: id, content: sceneFixture(), assetVersions: { ...SCENE_VERSIONS } }),
    audio: revisionFixture("audio", { pageId: id, content: { durationMs: 1000 }, fileUrl: `/api/studio/files/calls/${id}.mp3` }),
    ...over,
  };
}

export const STORY_ID = uuid(1);

export function releaseFixture(number: number, over: Partial<Release> = {}): Release {
  return { id: uuid(500 + number), number, createdAt: CREATED_AT, withdrawn: false, ...over };
}

// A draft with an outline head, two `ok` pages, no release, and no run.
export function storyDetailFixture(over: Partial<StoryDetailResponse> = {}): StoryDetailResponse {
  return {
    story: {
      id: STORY_ID,
      title: "The fox and the river",
      status: "draft",
      headsVersion: 3,
      publishedReleaseId: null,
      onShelf: false,
      createdAt: CREATED_AT,
    },
    heads: { outline: uuid(200) },
    source: revisionFixture("source", {
      content: { text: "A pasted news text.", url: null, words: 250, truncated: false },
    }),
    pages: [pageFixture(1), pageFixture(2)],
    releases: [],
    latestRun: null,
    ...over,
  };
}

export function storyListItem(n: number, over: Partial<StoryListResponse["stories"][number]> = {}) {
  const item: StoryListResponse["stories"][number] = {
    id: uuid(10 + n),
    title: `Story ${n}`,
    status: "draft",
    createdAt: CREATED_AT,
    publishedReleaseId: null,
    onShelf: false,
    publishedReleaseNumber: null,
    ...over,
  };
  return item;
}

export function storyListFixture(stories: StoryListResponse["stories"]): StoryListResponse {
  return { stories };
}

export const RUN_ID = uuid(300);

export function runFixture(status: RunResponse["run"]["status"], steps: RunStep[] = [], over: Partial<RunResponse["run"]> = {}): RunResponse {
  return {
    run: {
      id: RUN_ID,
      storyId: STORY_ID,
      scope: { kind: "full" },
      status,
      error: null,
      createdAt: CREATED_AT,
      finishedAt: null,
      workflowStatus: null,
      ...over,
    },
    steps,
  };
}

// The active registry: `fox` v1 and the backdrop `meadow` v1.
export function registryFixture(versions: { fox?: number; meadow?: number } = {}): RegistryResponse {
  return {
    assets: [
      {
        key: "fox",
        kind: "character",
        name: "Fox",
        version: versions.fox ?? 1,
        renderer: "svg-rig",
        manifest: {
          kind: "character",
          poses: [{ id: "stand", file: "stand.svg", foot: { x: 50, y: 100 }, box: { x: 0, y: 0, w: 100, h: 100 } }],
          expressions: ["happy"],
          legal: [{ pose: "stand", expression: "happy" }],
          flippable: true,
        },
        base: `/api/studio/files/assets/fox/${versions.fox ?? 1}/`,
      },
      {
        key: "meadow",
        kind: "backdrop",
        name: "Meadow",
        version: versions.meadow ?? 1,
        renderer: "webp",
        manifest: {
          kind: "backdrop",
          description: "A meadow.",
          size: { width: 2400, height: 1200 },
          variants: [{ sky: "day", file: "day.webp" }],
        },
        base: `/api/studio/files/assets/meadow/${versions.meadow ?? 1}/`,
      },
    ],
    templates: [],
  };
}

export function releaseCreatedFixture(number: number): ReleaseCreated {
  const releaseId = uuid(500 + number);
  return {
    releaseId,
    number,
    manifestUrl: `/content/releases/${releaseId}/manifest.json`,
    playerUrl: `/read/${releaseId}`,
  };
}

// ---- fetch stub

export type Reply = { status: number; body?: unknown };

export type FetchCall = { method: string; path: string; search: string; body: unknown; headers: Headers };

// Stubs the global `fetch`. `handler` gets each request and returns the reply
// (or a promise of it). `calls` lists the requests in order.
export function stubFetch(handler: (call: FetchCall) => Reply | Promise<Reply>) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    // No `new Request(url, init)`: an `AbortSignal` of jsdom in `init` is not
    // one of Node, and Node's `Request` refuses it.
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request ? request.url : String(input), "http://localhost");
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const text = typeof init?.body === "string" ? init.body : request && method !== "GET" ? await request.clone().text() : "";
    const call: FetchCall = {
      method,
      path: url.pathname,
      search: url.search,
      body: text === "" ? undefined : JSON.parse(text),
      headers: new Headers(init?.headers ?? request?.headers),
    };
    calls.push(call);
    const reply = await handler(call);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

// A handler from a table of "METHOD /path" keys. A request with no key gets 404.
export function routes(table: Record<string, Reply | ((call: FetchCall) => Reply | Promise<Reply>)>) {
  return (call: FetchCall): Reply | Promise<Reply> => {
    const entry = table[`${call.method} ${call.path}`];
    if (entry === undefined) return { status: 404, body: { error: "not_found" } };
    return typeof entry === "function" ? entry(call) : entry;
  };
}

// ---- router

export type MountPath = "/studio" | "/studio/stories/$storyId" | "/read/$releaseId";

// Renders `ui` at the route `at` of a router with the real Studio and Player
// paths, and an in-memory history at `path`. The other routes render nothing.
export function renderInRouter(ui: ReactElement, at: MountPath, path: string) {
  const root = createRootRoute({ component: Outlet });
  const route = (p: MountPath) =>
    createRoute({ getParentRoute: () => root, path: p, component: () => (p === at ? ui : null) });
  const testRouter = createRouter({
    routeTree: root.addChildren([route("/studio"), route("/studio/stories/$storyId"), route("/read/$releaseId")]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const result = render(createElement(RouterProvider, { router: testRouter }));
  return { router: testRouter, ...result };
}

// The search params of the current location, as plain strings.
export function searchOf(r: { state: { location: { search: unknown } } }): Record<string, unknown> {
  return r.state.location.search as Record<string, unknown>;
}

// ---- assertions

// Text with all white space removed, so a notice can be matched across lines.
export function squash(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, "");
}

// True when a button is disabled, natively or with `aria-disabled`.
export function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
}

// `count` words of filler text.
export function words(count: number): string {
  return Array.from({ length: count }, (_, i) => `word${i}`).join(" ");
}
