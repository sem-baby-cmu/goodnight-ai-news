import { defineConfig, devices } from "@playwright/test";

// Browser tests of the Player (#22). `vite dev` serves the app; every test
// answers /content/releases/* itself from e2e/fixtures/release/.
// smoke/playwright.config.ts is the separate spike smoke test.
export default defineConfig({
  testDir: "e2e",
  projects: [
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
    { name: "webkit-ipad", use: { ...devices["iPad Pro 11 landscape"] } },
    { name: "chromium-android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm exec vite --port 4317 --strictPort",
    url: "http://localhost:4317/",
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: "http://localhost:4317" },
});
