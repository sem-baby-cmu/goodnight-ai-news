import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { App } from "./app";
import { router } from "@/router";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);

it("app shell renders", async () => {
  // App renders the app router, which uses the browser history of jsdom.
  await router.navigate({ to: "/studio" });
  render(<App />);
  expect(await screen.findByTestId("studio-placeholder")).toBeTruthy();
});
