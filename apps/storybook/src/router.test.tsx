import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createAppRouter } from "@/router";
import { installBrowserStubs } from "@/player/testStubs";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The book route needs the browser APIs that jsdom lacks.
let restore: () => void;
beforeAll(() => {
  restore = installBrowserStubs();
});
afterAll(() => restore());

// A router with the app's route tree and an in-memory history at `path`.
function renderAt(path: string) {
  const testRouter = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(<RouterProvider router={testRouter} />);
  return testRouter;
}

it("/studio renders the Studio placeholder", async () => {
  renderAt("/studio");
  expect(await screen.findByTestId("studio-placeholder")).toBeTruthy();
});

it("/read/$releaseId passes the id", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response("", { status: 404 }));
  });
  const releaseId = "01890a5d-ac96-774b-bcce-b302099a8057";
  renderAt(`/read/${releaseId}`);
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  expect(calls[0]!.url).toBe(`/content/releases/${releaseId}/manifest.json`);
  expect(calls[0]!.init?.cache).toBe("no-cache");
});

it("/studio/abc puts /studio in the address", async () => {
  const testRouter = renderAt("/studio/abc");
  expect(await screen.findByTestId("studio-placeholder")).toBeTruthy();
  await waitFor(() => expect(testRouter.state.location.pathname).toBe("/studio"));
});
