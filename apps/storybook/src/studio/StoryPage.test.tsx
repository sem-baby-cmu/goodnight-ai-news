import type { SceneViewProps } from "@storybook/scene-runtime";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StoryDetailResponse } from "./api";
import {
  type FetchCall,
  isDisabled,
  pageFixture,
  pageId,
  registryFixture,
  releaseCreatedFixture,
  releaseFixture,
  renderInRouter,
  type Reply,
  revisionFixture,
  routes,
  RUN_ID,
  runFixture,
  SCENE_VERSIONS,
  sceneFixture,
  searchOf,
  squash,
  STORY_ID,
  storyDetailFixture,
  stubFetch,
  uuid,
} from "./fixtures";
import { StoryPage } from "./StoryPage";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);
afterEach(() => {
  vi.unstubAllGlobals();
});

// Every SceneView render, with its props.
const sceneViews = vi.hoisted(() => ({ calls: [] as SceneViewProps[] }));

vi.mock("@storybook/scene-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@storybook/scene-runtime")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    SceneView: (props: SceneViewProps) => {
      sceneViews.calls.push(props);
      return createElement("div", { "data-testid": "scene-view" });
    },
  };
});

beforeEach(() => {
  sceneViews.calls.length = 0;
});

const storyPath = `/api/studio/stories/${STORY_ID}`;
const registryPath = "/api/studio/registry";
const runPath = (id: string) => `/api/studio/runs/${id}`;

type Route = Reply | ((call: FetchCall) => Reply | Promise<Reply>);

// Stubs `GET` story and registry, plus `extra` routes.
function stubStory(detail: StoryDetailResponse | (() => StoryDetailResponse), extra: Record<string, Route> = {}) {
  return stubFetch(
    routes({
      [`GET ${storyPath}`]: () => ({ status: 200, body: typeof detail === "function" ? detail() : detail }),
      [`GET ${registryPath}`]: { status: 200, body: registryFixture() },
      ...extra,
    }),
  );
}

function renderStory(runId?: string) {
  return renderInRouter(
    <StoryPage storyId={STORY_ID} runId={runId} />,
    "/studio/stories/$storyId",
    `/studio/stories/${STORY_ID}${runId ? `?runId=${runId}` : ""}`,
  );
}

function alertWith(text: string): HTMLElement | undefined {
  return screen.queryAllByRole("alert").find((a) => squash(a.textContent).includes(squash(text)));
}

// A notice that is not a refusal: `role="status"` (DESIGN.md 14).
function statusWith(text: string): HTMLElement | undefined {
  return screen.queryAllByRole("status").find((a) => squash(a.textContent).includes(squash(text)));
}

const CUT_NOTICE = "The text had more than 2,000 words. Only the first 2,000 were used.";

it("RUN-01.S15 StoryPage shows the cut notice when source.content.truncated is true", async () => {
  const cut = storyDetailFixture({
    source: revisionFixture("source", { content: { text: "A long text.", url: null, words: 2000, truncated: true } }),
  });
  stubStory(cut);
  renderStory();
  await screen.findByText("The fox and the river");
  await waitFor(() => expect(statusWith(CUT_NOTICE)).toBeDefined());
  expect(alertWith(CUT_NOTICE)).toBeUndefined();
  cleanup();

  // With `truncated: false` the notice is absent.
  stubStory(storyDetailFixture());
  renderStory();
  await screen.findByText("The fox and the river");
  expect(statusWith(CUT_NOTICE)).toBeUndefined();
  expect(squash(document.body.textContent)).not.toContain(squash(CUT_NOTICE));
});

it("StoryPage polls latestRun when it is running and there is no runId", async () => {
  const runningId = uuid(310);
  const { calls } = stubStory(
    storyDetailFixture({ latestRun: { id: runningId, status: "running", scope: { kind: "full" }, error: null } }),
    { [`GET ${runPath(runningId)}`]: { status: 200, body: runFixture("running", [], { id: runningId }) } },
  );
  renderStory();
  await waitFor(() => expect(calls.some((c) => c.method === "GET" && c.path === runPath(runningId))).toBe(true));
  expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
});

it("StoryPage does not poll a latestRun that has ended", async () => {
  const { calls } = stubStory(
    storyDetailFixture({ latestRun: { id: RUN_ID, status: "draft_ready", scope: { kind: "full" }, error: null } }),
  );
  renderStory();
  await screen.findByText("The fox and the river");
  expect((await screen.findAllByText("Ready")).length).toBeGreaterThan(0);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(calls.some((c) => c.path.startsWith("/api/studio/runs/"))).toBe(false);
});

it("RUN-01.S16 Run card shows a failed step as a solid failed cell and the note and the row label name the failed count", async () => {
  const [p1, p2] = [pageId(1), pageId(2)];
  stubStory(storyDetailFixture({ latestRun: { id: RUN_ID, status: "running", scope: { kind: "full" }, error: null } }), {
    [`GET ${runPath(RUN_ID)}`]: {
      status: 200,
      body: runFixture("running", [
        { step: "script", state: "done" },
        { step: `scene:${p1}`, state: "done" },
        { step: `scene:${p2}`, state: "failed" },
        { step: `audio:${p1}`, state: "done" },
        { step: `audio:${p2}`, state: "pending" },
      ]),
    },
  });
  renderStory(RUN_ID);

  const row = await screen.findByLabelText("scene: 1 of 2 done, 1 failed");
  // The failed count is its own span (--bad-chip, 700), so the note is matched by its whole text.
  expect(screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "1 of 2 done, 1 failed")).toBeTruthy();
  expect(screen.getByText(", 1 failed").className).toContain("text-[var(--bad-chip)]");
  // One row per step kind.
  expect(screen.getAllByLabelText(/^(script|scene|audio): \d+ of \d+ done/)).toHaveLength(3);

  const failed = row.querySelectorAll('[class*="bg-[var(--bad-chip)]"]');
  expect(failed).toHaveLength(1);
  // Solid: the failed cell has no border.
  expect(failed[0].className).not.toMatch(/(^|\s)border/);
  // The legend names the cells with words.
  for (const word of ["done", "waiting", "failed"]) expect(screen.getAllByText(word).length).toBeGreaterThan(0);
});

it("StoryPage renders one SceneView per previewable page, each with mode still and no onSelectLayer, onMoveLayer or onSfx", async () => {
  const pages = [
    pageFixture(1),
    pageFixture(2),
    pageFixture(3, { state: "missing", problems: [{ target: "scene", reason: "missing" }], scene: null }),
  ];
  stubStory(storyDetailFixture({ pages }));
  renderStory();

  await waitFor(() => expect(screen.getAllByTestId("scene-view")).toHaveLength(2));
  expect(sceneViews.calls.length).toBeGreaterThan(0);
  for (const props of sceneViews.calls) {
    expect(props.mode).toBe("still");
    expect("onSelectLayer" in props).toBe(false);
    expect("onMoveLayer" in props).toBe(false);
    expect("onSfx" in props).toBe(false);
  }
});

it("StoryPage passes the same page object to SceneView after a refetch that returns the same scene revision", async () => {
  // The second story answer has another title and the same scene revisions.
  const detail = storyDetailFixture({ latestRun: { id: RUN_ID, status: "running", scope: { kind: "full" }, error: null } });
  let answers = 0;
  const { calls } = stubStory(
    () => {
      answers += 1;
      return answers === 1
        ? detail
        : {
            ...detail,
            story: { ...detail.story, title: "The fox comes home" },
            latestRun: { id: RUN_ID, status: "draft_ready", scope: { kind: "full" }, error: null },
          };
    },
    { [`GET ${runPath(RUN_ID)}`]: { status: 200, body: runFixture("draft_ready") } },
  );
  renderStory(RUN_ID);

  // The run is done at the first poll, so the story is fetched again.
  expect(await screen.findByText("The fox comes home")).toBeTruthy();
  await waitFor(() => expect(screen.getAllByTestId("scene-view")).toHaveLength(2));
  expect(calls.filter((c) => c.method === "GET" && c.path === storyPath)).toHaveLength(2);
  expect(calls.filter((c) => c.method === "GET" && c.path === registryPath)).toHaveLength(1);

  // Two pages: two page objects and two resolvers over every render.
  expect(new Set(sceneViews.calls.map((p) => p.page)).size).toBe(2);
  expect(new Set(sceneViews.calls.map((p) => p.assets)).size).toBe(2);
});

it("PageCard shows No preview for a stored scene without backdrop, and the rest of the story view renders", async () => {
  // A scene revision from before #66: no `backdrop`.
  const old = Object.fromEntries(Object.entries(sceneFixture()).filter(([key]) => key !== "backdrop"));
  const first = pageFixture(1);
  first.scene = revisionFixture("scene", { pageId: first.pageId, content: old, assetVersions: { ...SCENE_VERSIONS } });
  stubStory(storyDetailFixture({ pages: [first, pageFixture(2)] }));
  renderStory();

  expect(await screen.findByText("No preview for this scene.")).toBeTruthy();
  expect(screen.getAllByText("No preview for this scene.")).toHaveLength(1);
  await waitFor(() => expect(screen.getAllByTestId("scene-view")).toHaveLength(1));
  expect(screen.getByText("The fox and the river")).toBeTruthy();
  expect(screen.getByText("The fox sees page 1.")).toBeTruthy();
  expect(screen.getByText("The fox sees page 2.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Publish release 1" })).toBeTruthy();
});

it("RUN-05.S13 failed run without an outline head shows the error lines and Start again posts a full run", async () => {
  const nextRun = uuid(320);
  const failed = storyDetailFixture({
    heads: {},
    pages: [],
    latestRun: {
      id: RUN_ID,
      status: "failed",
      scope: { kind: "full" },
      error: {
        errors: [
          {
            runId: RUN_ID,
            storyId: STORY_ID,
            pageId: null,
            step: "script",
            providerStatus: null,
            message: "The outline did not pass the checks.",
          },
        ],
      },
    },
  });
  const { calls } = stubStory(failed, {
    [`POST ${storyPath}/runs`]: { status: 202, body: { runId: nextRun } },
  });
  const { router } = renderStory();

  await waitFor(() => expect(alertWith("The run failed.")).toBeDefined());
  const notice = alertWith("The run failed.") as HTMLElement;
  expect(squash(notice.textContent)).toContain(squash("script: The outline did not pass the checks."));
  expect(squash(notice.textContent)).not.toContain(squash("Open a page to make its scene or audio again."));

  fireEvent.click(screen.getByRole("button", { name: "Start again" }));
  await waitFor(() => expect(searchOf(router).runId).toBe(nextRun));
  const post = calls.filter((c) => c.method === "POST");
  expect(post).toHaveLength(1);
  expect(post[0].path).toBe(`${storyPath}/runs`);
  expect(post[0].body).toEqual({ scope: { kind: "full" } });
});

// A story with no outline head whose latest run failed in the `script` step.
function failedWithoutOutline(): StoryDetailResponse {
  return storyDetailFixture({
    heads: {},
    pages: [],
    latestRun: {
      id: RUN_ID,
      status: "failed",
      scope: { kind: "full" },
      error: {
        errors: [
          { runId: RUN_ID, storyId: STORY_ID, pageId: null, step: "script", providerStatus: null, message: "Bad outline." },
        ],
      },
    },
  });
}

// The same story after a new run started: its latest run is `id`, running.
function restarted(id: string): StoryDetailResponse {
  return { ...failedWithoutOutline(), latestRun: { id, status: "running", scope: { kind: "full" }, error: null } };
}

it("Start again on 202 fetches the story again, so the failed notice and Start again are gone", async () => {
  const nextRun = uuid(321);
  let answers = 0;
  const { calls } = stubStory(
    () => {
      answers += 1;
      return answers === 1 ? failedWithoutOutline() : restarted(nextRun);
    },
    {
      [`POST ${storyPath}/runs`]: { status: 202, body: { runId: nextRun } },
      [`GET ${runPath(nextRun)}`]: { status: 200, body: runFixture("running", [], { id: nextRun }) },
    },
  );
  renderStory();

  fireEvent.click(await screen.findByRole("button", { name: "Start again" }));
  await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.path === storyPath)).toHaveLength(2));
  await waitFor(() => expect(alertWith("The run failed.")).toBeUndefined());
  expect(screen.queryByRole("button", { name: "Start again" })).toBeNull();
  expect(screen.queryByText("Failed")).toBeNull();
  expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
});

it('Start again on 409 full_run_not_allowed shows "A full run is not allowed for this story."', async () => {
  stubStory(failedWithoutOutline(), {
    [`POST ${storyPath}/runs`]: { status: 409, body: { error: "full_run_not_allowed" } },
  });
  const { router } = renderStory();

  fireEvent.click(await screen.findByRole("button", { name: "Start again" }));
  await waitFor(() => expect(alertWith("A full run is not allowed for this story.")).toBeDefined());
  expect(searchOf(router).runId).toBeUndefined();
});

it("Start again on 409 run_active navigates with the runId of the answer and polls that run", async () => {
  const activeRun = uuid(322);
  let answers = 0;
  const { calls } = stubStory(
    () => {
      answers += 1;
      return answers === 1 ? failedWithoutOutline() : restarted(activeRun);
    },
    {
      [`POST ${storyPath}/runs`]: { status: 409, body: { error: "run_active", runId: activeRun } },
      [`GET ${runPath(activeRun)}`]: { status: 200, body: runFixture("running", [], { id: activeRun }) },
    },
  );
  const { router } = renderStory();

  fireEvent.click(await screen.findByRole("button", { name: "Start again" }));
  await waitFor(() => expect(searchOf(router).runId).toBe(activeRun));
  await waitFor(() => expect(calls.some((c) => c.method === "GET" && c.path === runPath(activeRun))).toBe(true));
});

it('Start again on 503 shows "Could not start the run. Nothing was changed. Try again." and fetches the story again', async () => {
  const { calls } = stubStory(failedWithoutOutline(), {
    [`POST ${storyPath}/runs`]: { status: 503, body: { error: "workflow_unavailable", runId: uuid(323) } },
  });
  const { router } = renderStory();

  fireEvent.click(await screen.findByRole("button", { name: "Start again" }));
  await waitFor(() => expect(alertWith("Could not start the run. Nothing was changed. Try again.")).toBeDefined());
  await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.path === storyPath)).toHaveLength(2));
  expect(searchOf(router).runId).toBeUndefined();
});

it("RUN-05.S14 failed run with an outline head shows the error lines, no Start again, and the page-card line", async () => {
  const p2 = pageId(2);
  const failed = storyDetailFixture({
    latestRun: {
      id: RUN_ID,
      status: "failed",
      scope: { kind: "full" },
      error: {
        errors: [
          { runId: RUN_ID, storyId: STORY_ID, pageId: p2, step: `scene:${p2}`, providerStatus: 400, message: "The model refused." },
        ],
      },
    },
  });
  const { calls } = stubStory(failed);
  renderStory();

  await waitFor(() => expect(alertWith("The run failed.")).toBeDefined());
  const notice = alertWith("The run failed.") as HTMLElement;
  expect(squash(notice.textContent)).toContain(squash("scene, page 2: The model refused."));
  expect(squash(notice.textContent)).toContain(squash("Open a page to make its scene or audio again."));
  expect(screen.queryByRole("button", { name: "Start again" })).toBeNull();
  expect(notice.querySelectorAll("button, [role=button]")).toHaveLength(0);
  expect(calls.some((c) => c.method === "POST")).toBe(false);
});

it("EDT-05.S6 the Publish card of a story off the shelf shows Ready with Publish release 3 and no control opens release 1 or 2", async () => {
  const r1 = releaseFixture(1, { withdrawn: true });
  const r2 = releaseFixture(2, { withdrawn: true });
  const base = storyDetailFixture();
  stubStory({
    ...base,
    story: { ...base.story, status: "published", publishedReleaseId: r2.id, onShelf: false },
    releases: [r1, r2],
  });
  const { container } = renderStory();

  const publish = await screen.findByRole("button", { name: "Publish release 3" });
  expect(isDisabled(publish)).toBe(false);
  expect(screen.getByText("All pages are ready.")).toBeTruthy();
  expect(squash(container.textContent)).not.toContain(squash("published."));
  expect(screen.queryAllByText("Open")).toHaveLength(0);
  expect(screen.queryByText(/in the Player$/)).toBeNull();
  for (const el of Array.from(container.querySelectorAll("[href]"))) {
    const href = el.getAttribute("href") ?? "";
    expect(href).not.toContain(r1.id);
    expect(href).not.toContain(r2.id);
  }
});

it("EDT-05.S8 the Publish card of a story off the shelf shows Blocked for a page that blocks, with no ok notice and no Open", async () => {
  const r1 = releaseFixture(1, { withdrawn: true });
  const r2 = releaseFixture(2, { withdrawn: true });
  const base = storyDetailFixture();
  stubStory({
    ...base,
    story: { ...base.story, status: "published", publishedReleaseId: r2.id, onShelf: false },
    pages: [pageFixture(1), pageFixture(2, { state: "stale", problems: [{ target: "scene", reason: "stale" }] })],
    releases: [r1, r2],
  });
  const { container } = renderStory();

  expect(await screen.findByText("page 2: stale scene")).toBeTruthy();
  expect(screen.getAllByText(/^page \d+: /)).toHaveLength(1);
  // DESIGN.md 13.2 does not name the label of the disabled button.
  expect(isDisabled(screen.getByRole("button", { name: /^Publish/ }))).toBe(true);
  expect(screen.queryByText("All pages are ready.")).toBeNull();
  expect(squash(container.textContent)).not.toContain(squash("published."));
  expect(screen.queryAllByText("Open")).toHaveLength(0);
  for (const el of Array.from(container.querySelectorAll("[href]"))) {
    const href = el.getAttribute("href") ?? "";
    expect(href).not.toContain(r1.id);
    expect(href).not.toContain(r2.id);
  }
});

it("StoryPage shows Story not found. for a 404 and the status for another error", async () => {
  stubFetch(routes({ [`GET ${registryPath}`]: { status: 200, body: registryFixture() } }));
  renderStory();
  await waitFor(() => expect(alertWith("Story not found.")).toBeDefined());
  cleanup();

  stubFetch(
    routes({
      [`GET ${storyPath}`]: { status: 500, body: { error: "internal" } },
      [`GET ${registryPath}`]: { status: 200, body: registryFixture() },
    }),
  );
  renderStory();
  await waitFor(() => expect(alertWith("Could not load the story (500).")).toBeDefined());
});

it("StoryPage shows No preview: the registry did not load. on every page when the registry fails", async () => {
  stubFetch(
    routes({
      [`GET ${storyPath}`]: { status: 200, body: storyDetailFixture() },
      [`GET ${registryPath}`]: { status: 500, body: null },
    }),
  );
  renderStory();
  await waitFor(() => expect(screen.getAllByText("No preview: the registry did not load.")).toHaveLength(2));
  expect(screen.queryAllByTestId("scene-view")).toHaveLength(0);
});

it("StoryPage title row has Back to stories, the title, and Source article only for a URL source", async () => {
  const url = "https://example.com/news/fox";
  stubStory(
    storyDetailFixture({
      source: revisionFixture("source", { content: { text: "A text.", url, words: 300, truncated: false } }),
    }),
  );
  renderStory();
  expect(await screen.findByText("The fox and the river")).toBeTruthy();
  expect(screen.getByLabelText("Back to stories").closest("a")?.getAttribute("href")).toBe("/studio");
  const source = screen.getByText("Source article").closest("a");
  expect(source?.getAttribute("href")).toBe(url);
  expect(source?.getAttribute("target")).toBe("_blank");
  expect(source?.getAttribute("rel")).toBe("noopener noreferrer");
  cleanup();

  // A pasted text has no URL.
  stubStory(storyDetailFixture());
  renderStory();
  expect(await screen.findByText("The fox and the river")).toBeTruthy();
  expect(screen.queryByText("Source article")).toBeNull();
});

it("StoryPage shows No pages yet. for a story without pages", async () => {
  stubStory(
    storyDetailFixture({
      heads: {},
      pages: [],
      latestRun: { id: RUN_ID, status: "queued", scope: { kind: "full" }, error: null },
    }),
    { [`GET ${runPath(RUN_ID)}`]: { status: 200, body: runFixture("queued") } },
  );
  renderStory();
  expect(await screen.findByText("No pages yet.")).toBeTruthy();
  expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
});

// ---- Notice roles, Run card sentences, the back button, no answer (ainews-ui review of #23).

const noAnswer = (): Reply => {
  throw new TypeError("Failed to fetch");
};

it("StoryPage gives the cut notice role status and the failed-run notice role alert", async () => {
  stubStory({
    ...failedWithoutOutline(),
    source: revisionFixture("source", { content: { text: "A long text.", url: null, words: 2000, truncated: true } }),
  });
  renderStory();
  await waitFor(() => expect(statusWith(CUT_NOTICE)).toBeDefined());
  expect(alertWith(CUT_NOTICE)).toBeUndefined();
  expect(alertWith("The run failed.")).toBeDefined();
  expect(statusWith("The run failed.")).toBeUndefined();
});

it("Run card says No run is in progress. only when no run is followed", async () => {
  stubStory(storyDetailFixture());
  renderStory();
  expect(await screen.findByText("No run is in progress.")).toBeTruthy();
  expect(screen.queryByText("Loading the run.")).toBeNull();
});

it("Run card says Loading the run. while the first answer of the followed run is awaited", async () => {
  // The run answer never comes.
  stubStory(storyDetailFixture(), { [`GET ${runPath(RUN_ID)}`]: () => new Promise<Reply>(() => {}) });
  renderStory(RUN_ID);
  const loading = await screen.findByText("Loading the run.");
  expect(loading.getAttribute("role")).toBe("status");
  expect(screen.queryByText("No run is in progress.")).toBeNull();
});

it("Run card with lost contact shows only the lost-contact notice, not No run is in progress.", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    stubStory(storyDetailFixture(), { [`GET ${runPath(RUN_ID)}`]: { status: 500, body: { error: "internal" } } });
    renderStory(RUN_ID);
    // 5 failed polls, 2000 ms apart.
    for (let i = 0; i < 14; i++) await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(alertWith("Lost contact with the run.")).toBeDefined();
    expect(screen.queryByText("No run is in progress.")).toBeNull();
    expect(screen.queryByText("Loading the run.")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("StoryPage has the back button while the story loads", async () => {
  stubFetch(
    routes({
      [`GET ${storyPath}`]: () => new Promise<Reply>(() => {}),
      [`GET ${registryPath}`]: { status: 200, body: registryFixture() },
    }),
  );
  renderStory();
  const loading = await screen.findByText("Loading the story.");
  expect(loading.getAttribute("role")).toBe("status");
  expect(screen.getByLabelText("Back to stories").closest("a")?.getAttribute("href")).toBe("/studio");
});

it("StoryPage has the back button with Story not found.", async () => {
  stubFetch(routes({ [`GET ${registryPath}`]: { status: 200, body: registryFixture() } }));
  renderStory();
  await waitFor(() => expect(alertWith("Story not found.")).toBeDefined());
  expect(screen.getByLabelText("Back to stories").closest("a")?.getAttribute("href")).toBe("/studio");
});

it("StoryPage with no answer for the story says so and never prints (0)", async () => {
  stubFetch(
    routes({ [`GET ${storyPath}`]: noAnswer, [`GET ${registryPath}`]: { status: 200, body: registryFixture() } }),
  );
  renderStory();
  await waitFor(() => expect(alertWith("No answer came from the server.")).toBeDefined());
  expect(squash(alertWith("No answer came from the server.")?.textContent)).toContain(squash("Reload to try again."));
  expect(document.body.textContent).not.toContain("(0)");
});

it("StoryPage run chip follows the polled run when it is the latest run", async () => {
  stubStory(storyDetailFixture({ latestRun: { id: RUN_ID, status: "queued", scope: { kind: "full" }, error: null } }), {
    [`GET ${runPath(RUN_ID)}`]: { status: 200, body: runFixture("running") },
  });
  renderStory();
  expect((await screen.findAllByText("Running")).length).toBeGreaterThan(0);
  expect(screen.queryByText("Queued")).toBeNull();
});

it("Start again with no answer says it is not known if the run started, and never prints (0)", async () => {
  stubStory(failedWithoutOutline(), { [`POST ${storyPath}/runs`]: noAnswer });
  renderStory();
  fireEvent.click(await screen.findByRole("button", { name: "Start again" }));
  await waitFor(() => expect(alertWith("It is not known if the run started. Try again.")).toBeDefined());
  expect(squash(alertWith("It is not known if the run started.")?.textContent)).toContain(squash("No answer came from the server."));
  expect(document.body.textContent).not.toContain("(0)");
});

it("Publish with no answer fetches the story again and never prints (0)", async () => {
  const { calls } = stubStory(storyDetailFixture(), { [`POST ${storyPath}/releases`]: noAnswer });
  renderStory();
  fireEvent.click(await screen.findByRole("button", { name: "Publish release 1" }));
  await waitFor(() =>
    expect(
      alertWith("It is not known if the release was published. Check the Releases card before you try again."),
    ).toBeDefined(),
  );
  expect(squash(alertWith("It is not known if the release was published.")?.textContent)).toContain(
    squash("No answer came from the server."),
  );
  await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.path === storyPath)).toHaveLength(2));
  expect(document.body.textContent).not.toContain("(0)");
});

// ---- Take off the shelf (#89; DESIGN.md 13.2). While the dialog is open,
// the content outside it is aria-hidden, so every dialog query is scoped.

type Release = StoryDetailResponse["releases"][number];

const withdrawalPath = `${storyPath}/withdrawal`;
const DIALOG_TITLE = "Take this book off the shelf?";
const dialogText = (n: number) =>
  `Children will no longer see this book on the shelf. Every link to release ${n} and to its earlier releases will show the sleeping book. This has no undo. To put the book back, publish a new release.`;
const OFF_NOTICE = "This book is off the shelf. Publish a new release to put it back.";
const MOVED = "Another release was published after you opened this page. Nothing was changed.";
const NOT_PUBLISHED = "This story has no release on the shelf. Nothing was changed.";
const NO_ANSWER_TAKEOFF = "No answer came from the server. It is not known if this book is still on the shelf. Try again.";

// A published story whose last release in `releases` is on the shelf.
function onShelfStory(
  releases: Release[] = [releaseFixture(1), releaseFixture(2)],
  over: Partial<StoryDetailResponse> = {},
): StoryDetailResponse {
  const base = storyDetailFixture();
  const shelf = releases[releases.length - 1];
  return {
    ...base,
    story: { ...base.story, status: "published", publishedReleaseId: shelf.id, onShelf: true },
    releases,
    ...over,
  };
}

const withdrawn = (releaseId: string, withdrawnThrough: number): Reply => ({
  status: 200,
  body: { storyId: STORY_ID, releaseId, withdrawnThrough },
});

const rowButton = () => screen.getByRole("button", { name: "Take off the shelf" });
const releasesHeading = () => screen.getByRole("heading", { name: "Releases" });
const posts = (calls: FetchCall[]) => calls.filter((c) => c.method === "POST");
const storyGets = (calls: FetchCall[]) => calls.filter((c) => c.method === "GET" && c.path === storyPath);
const settled = () => new Promise((resolve) => setTimeout(resolve, 50));

// Clicks the row button and returns the open dialog.
async function openDialog(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole("button", { name: "Take off the shelf" }));
  return screen.findByRole("dialog", { name: DIALOG_TITLE });
}

// Opens the dialog and clicks its "Take off the shelf" button.
async function confirmTakeOff(): Promise<HTMLElement> {
  const dialog = await openDialog();
  fireEvent.click(within(dialog).getByRole("button", { name: "Take off the shelf" }));
  return dialog;
}

async function dialogClosed() {
  await waitFor(() => expect(screen.queryByRole("dialog", { hidden: true })).toBeNull());
}

// The rows of `onShelfStory()` as loaded: release 2 on the shelf, release 1 with Open.
function expectRowsAsLoaded() {
  expect(screen.getAllByText("On the shelf")).toHaveLength(1);
  expect(screen.getByText("On the shelf").closest("li")).toBe(screen.getByText("Release 2").closest("li"));
  expect(screen.queryByText("Off the shelf")).toBeNull();
  expect(screen.getByLabelText("Open release 1")).toBeTruthy();
  expect(screen.getByLabelText("Open release 2")).toBeTruthy();
}

it("EDT-05.S2 Take off the shelf opens a dialog that names the result, sends no request, and Keep on the shelf and Escape close it with no change", async () => {
  const { calls } = stubStory(onShelfStory());
  renderStory();

  let dialog = await openDialog();
  expect(within(dialog).getByText(dialogText(2))).toBeTruthy();
  const keep = within(dialog).getByRole("button", { name: "Keep on the shelf" });
  await waitFor(() => expect(document.activeElement).toBe(keep));
  expect(posts(calls)).toHaveLength(0);

  fireEvent.click(keep);
  await dialogClosed();
  await waitFor(() => expect(document.activeElement).toBe(rowButton()));
  expect(posts(calls)).toHaveLength(0);
  expectRowsAsLoaded();

  dialog = await openDialog();
  const keepAgain = within(dialog).getByRole("button", { name: "Keep on the shelf" });
  await waitFor(() => expect(document.activeElement).toBe(keepAgain));
  fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
  await dialogClosed();
  await waitFor(() => expect(document.activeElement).toBe(rowButton()));
  expect(posts(calls)).toHaveLength(0);
  expectRowsAsLoaded();
});

it("EDT-05.S3 a confirmed take-off posts the release ID and, after 200, marks releases 1 and 2 Off the shelf with no Open and no take-off button", async () => {
  const r2 = releaseFixture(2);
  const { calls } = stubStory(onShelfStory(), { [`POST ${withdrawalPath}`]: withdrawn(r2.id, 2) });
  renderStory();

  await confirmTakeOff();
  await dialogClosed();
  await waitFor(() => expect(screen.getAllByText("Off the shelf")).toHaveLength(2));
  const post = posts(calls);
  expect(post).toHaveLength(1);
  expect(post[0].path).toBe(withdrawalPath);
  expect(post[0].body).toEqual({ releaseId: r2.id });
  expect(screen.queryByText("On the shelf")).toBeNull();
  expect(screen.queryAllByText("Open")).toHaveLength(0);
  expect(screen.queryByText("Take off the shelf")).toBeNull();
  expect(statusWith(OFF_NOTICE)).toBeDefined();
  await waitFor(() => expect(document.activeElement).toBe(releasesHeading()));
  // No refetch: the rows come from the answer.
  expect(storyGets(calls)).toHaveLength(1);
});

it("EDT-05.S4 a take-off refused with 409 release_moved shows the notice with Load the latest and changes no row", async () => {
  const [r1, r2, r3] = [releaseFixture(1), releaseFixture(2), releaseFixture(3)];
  let latest = onShelfStory([r1, r2]);
  stubStory(() => latest, {
    [`POST ${withdrawalPath}`]: { status: 409, body: { error: "release_moved", current: r3.id } },
  });
  renderStory();

  await confirmTakeOff();
  await dialogClosed();
  await waitFor(() => expect(alertWith(MOVED)).toBeDefined());
  expectRowsAsLoaded();
  const reload = within(alertWith(MOVED) as HTMLElement).getByRole("button", { name: "Load the latest" });
  await waitFor(() => expect(document.activeElement).toBe(reload));

  latest = onShelfStory([r1, r2, r3]);
  fireEvent.click(reload);
  await waitFor(() => expect(alertWith(MOVED)).toBeUndefined());
  await waitFor(() => expect(document.activeElement).toBe(releasesHeading()));
  const row3 = screen.getByText("Release 3").closest("li") as HTMLElement;
  expect(row3).not.toBeNull();
  expect(within(row3).getByText("On the shelf")).toBeTruthy();
});

it("A take-off refused with 409 not_published shows This story has no release on the shelf. with Load the latest", async () => {
  stubStory(onShelfStory(), { [`POST ${withdrawalPath}`]: { status: 409, body: { error: "not_published" } } });
  renderStory();

  await confirmTakeOff();
  await dialogClosed();
  await waitFor(() => expect(alertWith(NOT_PUBLISHED)).toBeDefined());
  const reload = within(alertWith(NOT_PUBLISHED) as HTMLElement).getByRole("button", { name: "Load the latest" });
  await waitFor(() => expect(document.activeElement).toBe(reload));
  expectRowsAsLoaded();
});

it.each([400, 404, 500])(
  "A take-off that fails with 400, 404 or 500 shows The server did not confirm the take-off. with the status, no action, the rows as loaded, and the focus on the row button",
  async (status) => {
    const error = status === 400 ? "bad_request" : status === 404 ? "not_found" : "internal";
    stubStory(onShelfStory(), { [`POST ${withdrawalPath}`]: { status, body: { error } } });
    renderStory();

    await confirmTakeOff();
    await dialogClosed();
    const text = `The server did not confirm the take-off. It answered with an error (${status}). Try again.`;
    await waitFor(() => expect(alertWith(text)).toBeDefined());
    const alerts = screen
      .queryAllByRole("alert")
      .filter((a) => squash(a.textContent).includes(squash("The server did not confirm the take-off.")));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].querySelectorAll("button, [role=button]")).toHaveLength(0);
    expect(screen.queryByText("Load the latest")).toBeNull();
    expectRowsAsLoaded();
    await waitFor(() => expect(document.activeElement).toBe(rowButton()));
  },
);

it("A take-off with no answer shows that it is not known if the book is still on the shelf, never (0)", async () => {
  stubStory(onShelfStory(), { [`POST ${withdrawalPath}`]: noAnswer });
  const { container } = renderStory();

  await confirmTakeOff();
  await dialogClosed();
  await waitFor(() => expect(alertWith(NO_ANSWER_TAKEOFF)).toBeDefined());
  expect(squash(container.textContent)).not.toContain("(0)");
  expect(screen.queryByText("Load the latest")).toBeNull();
  expectRowsAsLoaded();
  await waitFor(() => expect(document.activeElement).toBe(rowButton()));
});

it("The dialog buttons are disabled while the take-off request runs, and Escape does not close it", async () => {
  const r2 = releaseFixture(2);
  let answer: (reply: Reply) => void = () => {};
  const held = new Promise<Reply>((resolve) => {
    answer = resolve;
  });
  stubStory(onShelfStory(), { [`POST ${withdrawalPath}`]: () => held });
  renderStory();

  const dialog = await confirmTakeOff();
  const keep = within(dialog).getByRole("button", { name: "Keep on the shelf" });
  const take = within(dialog).getByRole("button", { name: "Take off the shelf" });
  await waitFor(() => {
    expect(isDisabled(keep)).toBe(true);
    expect(isDisabled(take)).toBe(true);
  });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await settled();
  expect(screen.queryByRole("dialog", { name: DIALOG_TITLE })).not.toBeNull();

  answer(withdrawn(r2.id, 2));
  await dialogClosed();
  await waitFor(() => expect(screen.getAllByText("Off the shelf")).toHaveLength(2));
});

it("Load the latest that does not load keeps the notice and the focus", async () => {
  let gets = 0;
  const { calls } = stubStory(onShelfStory(), {
    [`GET ${storyPath}`]: () => {
      gets += 1;
      return gets === 1 ? { status: 200, body: onShelfStory() } : { status: 500, body: { error: "internal" } };
    },
    [`POST ${withdrawalPath}`]: { status: 409, body: { error: "release_moved", current: releaseFixture(3).id } },
  });
  renderStory();

  await confirmTakeOff();
  await dialogClosed();
  await waitFor(() => expect(alertWith(MOVED)).toBeDefined());
  const reload = within(alertWith(MOVED) as HTMLElement).getByRole("button", { name: "Load the latest" });
  await waitFor(() => expect(document.activeElement).toBe(reload));

  fireEvent.click(reload);
  await waitFor(() => expect(storyGets(calls)).toHaveLength(2));
  await settled();
  expect(alertWith(MOVED)).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Load the latest" }));
  expectRowsAsLoaded();
});

it("A story GET in flight when the take-off answer lands does not bring back the old rows", async () => {
  const r2 = releaseFixture(2);
  const old = onShelfStory(undefined, { latestRun: { id: RUN_ID, status: "running", scope: { kind: "full" }, error: null } });
  let release: (reply: Reply) => void = () => {};
  const held = new Promise<Reply>((resolve) => {
    release = resolve;
  });
  let gets = 0;
  const { calls } = stubStory(old, {
    [`GET ${storyPath}`]: () => {
      gets += 1;
      return gets === 1 ? { status: 200, body: old } : held;
    },
    // The run has ended at the first poll, so `useRunPoll` fetches the story again.
    [`GET ${runPath(RUN_ID)}`]: { status: 200, body: runFixture("draft_ready") },
    [`POST ${withdrawalPath}`]: withdrawn(r2.id, 2),
  });
  renderStory();

  await waitFor(() => expect(storyGets(calls)).toHaveLength(2));
  await confirmTakeOff();
  await dialogClosed();
  await waitFor(() => expect(screen.getAllByText("Off the shelf")).toHaveLength(2));

  release({ status: 200, body: old });
  await settled();
  expect(screen.getAllByText("Off the shelf")).toHaveLength(2);
  expect(screen.queryByText("On the shelf")).toBeNull();
  expect(screen.queryAllByText("Open")).toHaveLength(0);
});

it("After Publish and a take-off in the same view, the Publish card leaves Done and offers the next release", async () => {
  const [r1, r2, r3] = [releaseFixture(1), releaseFixture(2), releaseFixture(3)];
  let gets = 0;
  const { calls } = stubStory(
    () => {
      gets += 1;
      return gets === 1 ? onShelfStory([r1, r2]) : onShelfStory([r1, r2, r3]);
    },
    {
      [`POST ${storyPath}/releases`]: { status: 201, body: releaseCreatedFixture(3) },
      [`POST ${withdrawalPath}`]: withdrawn(r3.id, 3),
    },
  );
  renderStory();

  fireEvent.click(await screen.findByRole("button", { name: "Publish release 3" }));
  expect(await screen.findByText("Release 3 published.")).toBeTruthy();
  // The refetch after the 201 puts release 3 on the shelf.
  await waitFor(() => expect(rowButton().closest("li")).toBe(screen.getByText("Release 3").closest("li")));

  await confirmTakeOff();
  await dialogClosed();
  await waitFor(() => expect(screen.getAllByText("Off the shelf")).toHaveLength(3));
  expect(posts(calls).filter((c) => c.path === withdrawalPath).map((c) => c.body)).toEqual([{ releaseId: r3.id }]);
  expect(screen.queryByText("Release 3 published.")).toBeNull();
  expect(screen.queryByText(/in the Player$/)).toBeNull();
  expect(screen.getByRole("button", { name: "Publish release 4" })).toBeTruthy();
});
