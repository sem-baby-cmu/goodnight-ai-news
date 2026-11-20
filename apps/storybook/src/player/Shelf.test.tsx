import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createAppRouter } from "@/router";
import { Shelf } from "./Shelf";
import { installBrowserStubs } from "./testStubs";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The shelf reads the viewport with a ResizeObserver, which jsdom lacks.
let restore: () => void;
beforeAll(() => {
  restore = installBrowserStubs();
});
afterAll(() => restore());

const BOOK = {
  releaseId: "01936b2a-0000-7000-8000-000000000101",
  title: "Book 1",
  publishedAt: "2026-11-19T08:30:00.000Z",
};

type ShelfCall = { url: string; args: number };

// A global fetch stub: `/api/shelf` gets `answer()`, every other URL 404.
// It records the URL and the number of arguments of each call.
function stubShelf(answer: () => Response) {
  const calls: ShelfCall[] = [];
  vi.stubGlobal("fetch", (...args: unknown[]) => {
    const url = String(args[0]);
    calls.push({ url, args: args.length });
    return Promise.resolve(url === "/api/shelf" ? answer() : new Response("", { status: 404 }));
  });
  return calls;
}

// `Shelf` at `/` in a memory router that also has the book route.
function renderShelf() {
  const root = createRootRoute({ component: Outlet });
  const shelf = createRoute({ getParentRoute: () => root, path: "/", component: Shelf });
  const read = createRoute({ getParentRoute: () => root, path: "/read/$releaseId", component: () => <main /> });
  const router = createRouter({
    routeTree: root.addChildren([shelf, read]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

const failedLine = "The books are sleeping. Come back soon.";

it("a body that fails the shelf schema shows the Failed state", async () => {
  stubShelf(
    () =>
      new Response(JSON.stringify({ books: [{ ...BOOK, title: 1 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  renderShelf();
  expect(await screen.findByRole("button", { name: "Look again" })).toBeTruthy();
  expect(screen.getByText(failedLine)).toBeTruthy();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});

it("a status that is not 200 shows the Failed state", async () => {
  stubShelf(
    () =>
      new Response(JSON.stringify({ books: [BOOK] }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
  );
  renderShelf();
  expect(await screen.findByRole("button", { name: "Look again" })).toBeTruthy();
  expect(screen.getByText(failedLine)).toBeTruthy();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});

it("the shelf request is sent one time under StrictMode", async () => {
  const calls = stubShelf(
    () =>
      new Response(JSON.stringify({ books: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  expect(await screen.findByText("New stories are coming soon.")).toBeTruthy();
  expect(calls.filter((c) => c.url === "/api/shelf")).toEqual([{ url: "/api/shelf", args: 1 }]);
});
