import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { router } from "@/router";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);

// A router with the app's route tree and an in-memory history at `path`.
function renderAt(path: string) {
  const testRouter = createRouter({
    routeTree: router.routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={testRouter} />);
}

it("/studio renders the Studio placeholder", async () => {
  renderAt("/studio");
  expect(await screen.findByTestId("studio-placeholder")).toBeTruthy();
});

it("/read/$releaseId passes the id", async () => {
  const releaseId = "01890a5d-ac96-774b-bcce-b302099a8057";
  renderAt(`/read/${releaseId}`);
  const placeholder = await screen.findByTestId("player-placeholder");
  expect(placeholder.getAttribute("data-release-id")).toBe(releaseId);
});
