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

it("spike probe flag survives the router's search round trip", async () => {
  // The router validates `?probe=1`, writes the result back to the URL as
  // `?probe=true`, and validates again on the next read. The flag must stay on.
  vi.resetModules();
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_SPIKE", "1");
  const { defaultParseSearch, defaultStringifySearch } = await import("@tanstack/react-router");
  await import("@/router"); // load the router first: it imports this route file
  const { spikeRoutes } = await import("./routes");
  const validate = spikeRoutes[0]?.options.validateSearch as (search: Record<string, unknown>) => { probe: boolean };
  for (const query of ["?probe=1", "?probe=true"]) {
    const first = validate(defaultParseSearch(query));
    const again = validate(defaultParseSearch(defaultStringifySearch(first)));
    expect([first.probe, again.probe], query).toEqual([true, true]);
  }
  expect(validate(defaultParseSearch("")).probe).toBe(false);
  expect(validate(defaultParseSearch("?probe=0")).probe).toBe(false);
});
