import { defineConfig } from "vitest/config";

// The runtime renders into a DOM. test/setup.ts stubs the browser APIs that
// jsdom does not have (Web Animations, matchMedia, ResizeObserver).
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
  },
});
