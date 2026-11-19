import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

// The route tree as `@/router` builds it under a given env. `vi.resetModules`
// makes the router and its route files evaluate again, so they read the
// stubbed `import.meta.env`.
async function routeTreeWith(env: { DEV: boolean; VITE_SPIKE?: string }) {
  vi.resetModules();
  vi.stubEnv("DEV", env.DEV);
  vi.stubEnv("VITE_SPIKE", env.VITE_SPIKE);
  const { router } = await import("@/router");
  return router.routeTree;
}

const paths = (tree: Awaited<ReturnType<typeof routeTreeWith>>) =>
  Object.values(tree.children ?? {}).map((route) => (route as { path: string }).path);

const hasSpike = (tree: Awaited<ReturnType<typeof routeTreeWith>>) => paths(tree).some((path) => path.includes("spike"));

it("spike route is absent when VITE_SPIKE is not 1 in a production build", async () => {
  // A production build: DEV is false. Neither an unset value nor "0" turns it on.
  for (const spike of [undefined, "", "0", "true"]) {
    expect(hasSpike(await routeTreeWith({ DEV: false, VITE_SPIKE: spike })), `VITE_SPIKE=${String(spike)}`).toBe(false);
  }
  const tree = await routeTreeWith({ DEV: false });
  const testRouter = createRouter({ routeTree: tree, history: createMemoryHistory({ initialEntries: ["/spike/1"] }) });
  render(<RouterProvider router={testRouter} />);
  expect(screen.queryByTestId("spike-page")).toBeNull();
});

it("spike route is present when VITE_SPIKE is 1, and in dev", async () => {
  expect(hasSpike(await routeTreeWith({ DEV: false, VITE_SPIKE: "1" }))).toBe(true);
  expect(hasSpike(await routeTreeWith({ DEV: true }))).toBe(true);
});
