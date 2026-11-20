import { configDefaults, defineConfig } from "vitest/config";

// The runtime renders into a DOM. test/setup.ts stubs the browser APIs that
// jsdom does not have (Web Animations, matchMedia, ResizeObserver).
// test/browser/ runs in real browsers (vitest.browser.config.ts), never here.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    exclude: [...configDefaults.exclude, "test/browser/**"],
  },
});
