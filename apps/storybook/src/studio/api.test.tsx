import { afterEach, expect, it, vi } from "vitest";
import { studioApi } from "./api";
import { pageId, releaseCreatedFixture, routes, RUN_ID, runFixture, STORY_ID, storyListFixture, stubFetch, uuid } from "./fixtures";

// design.md "Error Handling": no full answer in 20 s ends the request.
const LIMIT_MS = 20_000;
const NO_ANSWER_RESULT = { ok: false, status: 0, body: null };

// A fetch that never answers and does not look at the signal.
const hang = () => vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}));

// The result of a call once it settles. The test never awaits a call that can hang.
function watch<T>(p: Promise<T>): { value?: T } {
  const box: { value?: T } = {};
  void p.then((v) => {
    box.value = v;
  });
  return box;
}

const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

it("studioApi.withdraw posts { releaseId } to /api/studio/stories/:id/withdrawal", async () => {
  const releaseId = uuid(502);
  const answer = { storyId: STORY_ID, releaseId, withdrawnThrough: 2 };
  const { calls } = stubFetch(
    routes({ [`POST /api/studio/stories/${STORY_ID}/withdrawal`]: { status: 200, body: answer } }),
  );
  expect(await studioApi.withdraw(STORY_ID, releaseId)).toEqual({ ok: true, data: answer });
  expect(calls).toHaveLength(1);
  expect(`${calls[0].method} ${calls[0].path}`).toBe(`POST /api/studio/stories/${STORY_ID}/withdrawal`);
  expect(calls[0].body).toEqual({ releaseId });
  expect(calls[0].headers.get("content-type")).toContain("application/json");
});

it("studioApi.getRun ends with status 0 when no answer comes in 20 000 ms", async () => {
  fakeTimers();
  vi.stubGlobal("fetch", hang());
  const r = watch(studioApi.getRun(RUN_ID));
  await vi.advanceTimersByTimeAsync(LIMIT_MS - 1);
  expect(r.value).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(r.value).toEqual(NO_ANSWER_RESULT);
});

it.each<[string, () => Promise<unknown>]>([
  ["createStory", () => studioApi.createStory({ text: "A text." })],
  ["startRun", () => studioApi.startRun(STORY_ID, { kind: "full" })],
  ["publish", () => studioApi.publish(STORY_ID)],
  ["withdraw", () => studioApi.withdraw(STORY_ID, uuid(502))],
])("studioApi.%s ends with status 0 when no answer comes in 20 000 ms", async (_name, start) => {
  fakeTimers();
  vi.stubGlobal("fetch", hang());
  const r = watch(start());
  await vi.advanceTimersByTimeAsync(LIMIT_MS - 1);
  expect(r.value).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(r.value).toEqual(NO_ANSWER_RESULT);
});

it("studioApi ends with status 0, not ok, when the body of a 2xx answer does not come in 20 000 ms", async () => {
  fakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 201, json: () => new Promise(() => {}) }) as unknown as Response),
  );
  const r = watch(studioApi.publish(STORY_ID));
  await vi.advanceTimersByTimeAsync(LIMIT_MS);
  expect(r.value).toEqual(NO_ANSWER_RESULT);
});

it("studioApi aborts a GET at 20 000 ms and sends a POST with no signal", async () => {
  fakeTimers();
  const fn = hang();
  vi.stubGlobal("fetch", fn);
  watch(studioApi.getStory(STORY_ID));
  watch(studioApi.publish(STORY_ID));
  await vi.advanceTimersByTimeAsync(LIMIT_MS - 1);
  expect(fn.mock.calls[0]![1]?.signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(fn.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  expect(fn.mock.calls[1]![1]?.signal).toBeUndefined();
});

it("studioApi leaves no timer after an answer", async () => {
  fakeTimers();
  stubFetch(routes({ "GET /api/studio/stories": { status: 200, body: storyListFixture([]) } }));
  await studioApi.listStories();
  expect(vi.getTimerCount()).toBe(0);
});
