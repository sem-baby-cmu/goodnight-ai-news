import { afterEach, expect, it, vi } from "vitest";
import { studioApi } from "./api";
import { pageId, releaseCreatedFixture, routes, RUN_ID, runFixture, STORY_ID, storyListFixture, stubFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("studioApi returns ok with the data on a 2xx answer", async () => {
  const list = storyListFixture([]);
  stubFetch(routes({ "GET /api/studio/stories": { status: 200, body: list } }));
  expect(await studioApi.listStories()).toEqual({ ok: true, data: list });
});

it("studioApi returns the status and the parsed body on another status, and never throws", async () => {
  stubFetch(routes({ [`POST /api/studio/stories/${STORY_ID}/releases`]: { status: 409, body: { error: "publish_conflict" } } }));
  expect(await studioApi.publish(STORY_ID)).toEqual({ ok: false, status: 409, body: { error: "publish_conflict" } });
  // No route: the stub answers 404.
  expect(await studioApi.getStory(STORY_ID)).toEqual({ ok: false, status: 404, body: { error: "not_found" } });
});

it("studioApi returns body null for an answer that is not JSON", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } })),
  );
  expect(await studioApi.getRun(RUN_ID)).toEqual({ ok: false, status: 502, body: null });
});

it("studioApi returns status 0 on a network error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  expect(await studioApi.getRegistry()).toEqual({ ok: false, status: 0, body: null });
});

it("studioApi sends each request to its route, with a JSON body on POST", async () => {
  const { calls } = stubFetch(() => ({ status: 200, body: {} }));
  await studioApi.createStory({ text: "A text." });
  await studioApi.createStory({ url: "https://example.com/news" });
  await studioApi.listStories();
  await studioApi.getStory(STORY_ID);
  await studioApi.getRun(RUN_ID);
  await studioApi.startRun(STORY_ID, { kind: "full" });
  await studioApi.startRun(STORY_ID, { kind: "page", pageId: pageId(3), target: "audio" });
  await studioApi.publish(STORY_ID);
  await studioApi.getRegistry();

  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
    "POST /api/studio/stories",
    "POST /api/studio/stories",
    "GET /api/studio/stories",
    `GET /api/studio/stories/${STORY_ID}`,
    `GET /api/studio/runs/${RUN_ID}`,
    `POST /api/studio/stories/${STORY_ID}/runs`,
    `POST /api/studio/stories/${STORY_ID}/runs`,
    `POST /api/studio/stories/${STORY_ID}/releases`,
    "GET /api/studio/registry",
  ]);
  expect(calls[0].body).toEqual({ text: "A text." });
  expect(calls[1].body).toEqual({ url: "https://example.com/news" });
  expect(calls[5].body).toEqual({ scope: { kind: "full" } });
  expect(calls[6].body).toEqual({ scope: { kind: "page", pageId: pageId(3), target: "audio" } });
  for (const call of [calls[0], calls[1], calls[5], calls[6]]) {
    expect(call.headers.get("content-type")).toContain("application/json");
  }
});

it("studioApi returns the data of a 201 answer", async () => {
  const created = releaseCreatedFixture(1);
  stubFetch(
    routes({
      [`POST /api/studio/stories/${STORY_ID}/releases`]: { status: 201, body: created },
      [`GET /api/studio/runs/${RUN_ID}`]: { status: 200, body: runFixture("queued") },
    }),
  );
  expect(await studioApi.publish(STORY_ID)).toEqual({ ok: true, data: created });
  expect(await studioApi.getRun(RUN_ID)).toEqual({ ok: true, data: runFixture("queued") });
});
