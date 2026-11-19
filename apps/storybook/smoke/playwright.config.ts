import { defineConfig, devices } from "@playwright/test";

// The S1 smoke test (issue #15): the spike build under `vite preview`, in WebKit
// with the iPhone 13 profile. It shows that each page runs the probe to the end.
// It is not the device result, and it is not part of `pnpm -r test`.
export default defineConfig({
  testDir: ".",
  testMatch: "*.smoke.ts",
  // The probe runs 22 s per page; the test allows 30 s for it.
  timeout: 60_000,
  reporter: "list",
  globalTeardown: "./teardown.ts",
  use: { baseURL: "http://localhost:4173", ...devices["iPhone 13"] },
  webServer: {
    // `smoke:spike` builds first. This starts the preview of dist-spike/.
    command: "pnpm run spike:preview",
    url: "http://localhost:4173/spike/1",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
