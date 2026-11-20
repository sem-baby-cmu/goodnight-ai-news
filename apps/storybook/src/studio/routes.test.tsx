import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { router } from "@/router";
import {
  registryFixture,
  routes,
  RUN_ID,
  runFixture,
  STORY_ID,
  storyDetailFixture,
  storyListFixture,
  stubFetch,
} from "./fixtures";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);
afterEach(() => {
  vi.unstubAllGlobals();
});

// `router` comes from "@/router", never from "./routes": router.tsx must load first.
function routerAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const testRouter = createRouter({ routeTree: router.routeTree, history });
  return { history, testRouter };
}

it("SYS-03.S3 an unknown Studio path shows the stories list at /studio with no new history entry", async () => {
  stubFetch(routes({ "GET /api/studio/stories": { status: 200, body: storyListFixture([]) } }));
  const { history, testRouter } = routerAt("/studio/abc/def");
  const entries = history.length;
  render(<RouterProvider router={testRouter} />);

  expect(await screen.findByRole("button", { name: "Paste text" })).toBeTruthy();
  await waitFor(() => expect(testRouter.state.location.pathname).toBe("/studio"));
  expect(testRouter.history.length).toBe(entries);
  expect(screen.queryByTestId("player-placeholder")).toBeNull();
});

it("/studio/stories/$storyId passes the runId search param to the story view", async () => {
  const { calls } = stubFetch(
    routes({
      [`GET /api/studio/stories/${STORY_ID}`]: {
        status: 200,
        body: storyDetailFixture({ latestRun: { id: RUN_ID, status: "running", scope: { kind: "full" }, error: null } }),
      },
      "GET /api/studio/registry": { status: 200, body: registryFixture() },
      [`GET /api/studio/runs/${RUN_ID}`]: { status: 200, body: runFixture("running") },
    }),
  );
  const { testRouter } = routerAt(`/studio/stories/${STORY_ID}?runId=${RUN_ID}`);
  render(<RouterProvider router={testRouter} />);

  await waitFor(() => expect(calls.some((c) => c.path === `/api/studio/runs/${RUN_ID}`)).toBe(true));
  expect(calls.some((c) => c.path === `/api/studio/stories/${STORY_ID}`)).toBe(true);
  expect(await screen.findByText("The fox and the river")).toBeTruthy();
});
