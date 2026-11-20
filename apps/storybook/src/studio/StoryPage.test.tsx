import type { SceneViewProps } from "@storybook/scene-runtime";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StoryDetailResponse } from "./api";
import {
  type FetchCall,
  isDisabled,
  pageFixture,
  pageId,
  registryFixture,
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

const CUT_NOTICE = "The text had more than 2,000 words. Only the first 2,000 were used.";

it("RUN-01.S15 StoryPage shows the cut notice when source.content.truncated is true", async () => {
  const cut = storyDetailFixture({
    source: revisionFixture("source", { content: { text: "A long text.", url: null, words: 2000, truncated: true } }),
  });
  stubStory(cut);
  renderStory();
  await screen.findByText("The fox and the river");
  await waitFor(() => expect(alertWith(CUT_NOTICE)).toBeDefined());
  cleanup();

  // With `truncated: false` the notice is absent.
  stubStory(storyDetailFixture());
  renderStory();
  await screen.findByText("The fox and the river");
  expect(alertWith(CUT_NOTICE)).toBeUndefined();
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
  expect(screen.getByText("1 of 2 done, 1 failed")).toBeTruthy();
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
