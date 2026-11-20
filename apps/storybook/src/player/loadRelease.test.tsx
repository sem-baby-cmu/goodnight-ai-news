import { cleanup, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { loadCover, loadRelease, ReleaseUnavailableError } from "./loadRelease";
import {
  deferred,
  FIXTURE_FILES,
  FIXTURE_ID,
  FIXTURE_ROOT,
  fixtureFetch,
  installBrowserStubs,
  PAGE_IDS,
  renderBook,
} from "./testStubs";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let restore: () => void;
beforeAll(() => {
  restore = installBrowserStubs();
});
afterAll(() => restore());

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const manifest = () => JSON.parse(FIXTURE_FILES["manifest.json"]!) as Record<string, unknown> & {
  pages: { pageId: string; json: string }[];
};
const page = (i: number) =>
  JSON.parse(FIXTURE_FILES[`pages/${PAGE_IDS[i]}.json`]!) as Record<string, unknown> & {
    assets: Record<string, { base: string; manifest: Record<string, unknown> }>;
  };

it("loads the manifest with cache no-cache, then the pages in manifest order with the default cache mode", async () => {
  // The page responses arrive in reverse order.
  const holds = PAGE_IDS.map(() => deferred<void>());
  const { fetchImpl, calls } = fixtureFetch();
  const slow = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const i = PAGE_IDS.findIndex((id) => url.endsWith(`pages/${id}.json`));
    if (i < 0) return fetchImpl(input, init);
    return holds[i]!.promise.then(() => fetchImpl(input, init));
  }) as typeof fetch;

  const loading = loadRelease(FIXTURE_ID, slow);
  for (let i = PAGE_IDS.length - 1; i >= 0; i--) {
    await Promise.resolve();
    holds[i]!.resolve();
  }
  const release = await loading;

  expect(calls[0]).toEqual({ url: `${FIXTURE_ROOT}manifest.json`, init: { cache: "no-cache" } });
  const pageCalls = calls.slice(1);
  expect(pageCalls.map((c) => c.url).sort()).toEqual(PAGE_IDS.map((id) => `${FIXTURE_ROOT}pages/${id}.json`).sort());
  for (const c of pageCalls) expect(c.init).toBeUndefined();
  expect(calls).toHaveLength(1 + PAGE_IDS.length);
  expect(release.root).toBe(FIXTURE_ROOT);
  expect(release.manifest.releaseId).toBe(FIXTURE_ID);
  expect(release.pages.map((p) => p.pageId)).toEqual([...PAGE_IDS]);
});

it("rejects a mismatched releaseId, a page id mismatch, a non-ok response, a rejected fetch, invalid JSON, a schema failure, and an unsafe relative path", async () => {
  const page2 = `pages/${PAGE_IDS[1]}.json`;
  const cases: Record<string, (path: string) => Response | Promise<Response> | undefined> = {
    "mismatched releaseId": (p) =>
      p === "manifest.json" ? json({ ...manifest(), releaseId: "01936b2a-0000-7000-8000-0000000000ff" }) : undefined,
    "page id mismatch": (p) => (p === page2 ? json({ ...page(1), pageId: PAGE_IDS[0] }) : undefined),
    "non-ok response": (p) => (p === page2 ? new Response("", { status: 500 }) : undefined),
    "rejected fetch": (p) => (p === page2 ? Promise.reject(new TypeError("network")) : undefined),
    "invalid JSON": (p) => (p === page2 ? new Response("{ not json", { status: 200 }) : undefined),
    "schema failure": (p) => (p === "manifest.json" ? json({ ...manifest(), title: undefined }) : undefined),
    "unsafe page path": (p) => {
      if (p !== "manifest.json") return undefined;
      const m = manifest();
      m.pages[1] = { ...m.pages[1]!, json: `../${m.pages[1]!.json}` };
      return json(m);
    },
    "unsafe audio path": (p) => (p === page2 ? json({ ...page(1), audio: "/audio/x.wav" }) : undefined),
    "base without a slash": (p) => {
      if (p !== page2) return undefined;
      const pg = page(1);
      pg.assets.pip!.base = "assets/pip/v1";
      return json(pg);
    },
    "unsafe asset file": (p) => {
      if (p !== page2) return undefined;
      const pg = page(1);
      const pip = pg.assets.pip!.manifest as { poses: { file: string }[] };
      pip.poses[0]!.file = "../../../other/stand.svg";
      return json(pg);
    },
  };
  for (const [name, override] of Object.entries(cases)) {
    const { fetchImpl } = fixtureFetch(override);
    await expect(loadRelease(FIXTURE_ID, fetchImpl), name).rejects.toBeInstanceOf(ReleaseUnavailableError);
  }
});

it("PLY-06.S6 an ID that is not a UUID version 7 shows the Resting state", async () => {
  const { fetchImpl, calls } = fixtureFetch();
  await expect(loadRelease("abc", fetchImpl)).rejects.toBeInstanceOf(ReleaseUnavailableError);
  expect(calls).toHaveLength(0);

  const global = fixtureFetch();
  vi.stubGlobal("fetch", global.fetchImpl);
  renderBook("abc");
  expect(await screen.findByText("This book is sleeping. Come back soon.")).toBeTruthy();
  expect(global.calls).toHaveLength(0);
});

it("loadCover requests the manifest with cache no-cache, then page 1 JSON only", async () => {
  const { fetchImpl, calls } = fixtureFetch();
  const cover = await loadCover(FIXTURE_ID, fetchImpl);
  expect(calls).toEqual([
    { url: `${FIXTURE_ROOT}manifest.json`, init: { cache: "no-cache" } },
    { url: `${FIXTURE_ROOT}pages/${PAGE_IDS[0]}.json`, init: undefined },
  ]);
  expect(cover.root).toBe(FIXTURE_ROOT);
  expect(cover.page.pageId).toBe(PAGE_IDS[0]);
});

it("loadCover rejects an ID that is not a UUID version 7 with zero fetch calls, a mismatched releaseId, a page id mismatch, a non-ok response and a schema failure", async () => {
  const bad = fixtureFetch();
  await expect(loadCover("abc", bad.fetchImpl)).rejects.toBeInstanceOf(ReleaseUnavailableError);
  expect(bad.calls).toHaveLength(0);

  const page1 = `pages/${PAGE_IDS[0]}.json`;
  const cases: Record<string, (path: string) => Response | undefined> = {
    "mismatched releaseId": (p) =>
      p === "manifest.json" ? json({ ...manifest(), releaseId: "01936b2a-0000-7000-8000-0000000000ff" }) : undefined,
    "page id mismatch": (p) => (p === page1 ? json({ ...page(0), pageId: PAGE_IDS[1] }) : undefined),
    "non-ok manifest": (p) => (p === "manifest.json" ? new Response("", { status: 500 }) : undefined),
    "non-ok page 1": (p) => (p === page1 ? new Response("", { status: 500 }) : undefined),
    "manifest schema failure": (p) => (p === "manifest.json" ? json({ ...manifest(), title: undefined }) : undefined),
    "page 1 schema failure": (p) => (p === page1 ? json({ ...page(0), scene: undefined }) : undefined),
  };
  for (const [name, override] of Object.entries(cases)) {
    const { fetchImpl } = fixtureFetch(override);
    await expect(loadCover(FIXTURE_ID, fetchImpl), name).rejects.toBeInstanceOf(ReleaseUnavailableError);
  }
});
