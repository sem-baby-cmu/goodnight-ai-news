import { defineConfig, devices } from "@playwright/test";

// The WebKit smoke test of the MP3 spike (issue #69, exact change 7). No web
// server: the test serves each file from out/ with `page.route`. It is not the
// device result, and it is not part of `pnpm -r test`.
export default defineConfig({
  testDir: ".",
  testMatch: "*.smoke.ts",
  timeout: 60_000,
  reporter: "list",
  // Playback runs in real time; one worker keeps the timings stable.
  workers: 1,
  globalSetup: "./setup.ts",
  globalTeardown: "./teardown.ts",
  projects: [
    { name: "iPhone 13", use: { ...devices["iPhone 13"] } },
    { name: "iPad (gen 7)", use: { ...devices["iPad (gen 7)"] } },
  ],
});
