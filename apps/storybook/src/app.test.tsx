import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./app";
import { router } from "@/router";
import { routes, storyListFixture, stubFetch } from "@/studio/fixtures";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);
afterEach(() => {
  vi.unstubAllGlobals();
});

it("app shell renders", async () => {
  stubFetch(routes({ "GET /api/studio/stories": { status: 200, body: storyListFixture([]) } }));
  // App renders the app router, which uses the browser history of jsdom.
  await router.navigate({ to: "/studio" });
  render(<App />);
  expect(await screen.findByRole("button", { name: "Paste text" })).toBeTruthy();
});
