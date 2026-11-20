import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Real-browser checks (#68, D68-1): layout, hit-testing and image loading
// facts that jsdom cannot show. Chromium and WebKit, headless.
// This config does not load test/setup.ts: the browsers have the real APIs.
// Screenshots go to test/browser/__screenshots__ (not tracked).
export default defineConfig({
  // Pre-bundle these up front: a cold run that finds them late reloads the
  // test page and fails the first tests (seen on 2026-11-19).
  optimizeDeps: { include: ["react", "react/jsx-dev-runtime", "react-dom", "react-dom/client", "@storybook/dsl > zod"] },
  test: {
    include: ["test/browser/**/*.browser.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      // Large enough for the widest host of the tests (1002 x 578 CSS px).
      viewport: { width: 1280, height: 900 },
      instances: [{ browser: "chromium" }, { browser: "webkit" }],
    },
  },
});
