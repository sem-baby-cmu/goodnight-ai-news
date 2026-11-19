import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests only. This file is separate from vite.config.ts, so the Cloudflare
// Vite plugin does not load in tests.
export default defineConfig({
  test: {
    projects: [
      {
        // Worker tests run inside workerd with the bindings from wrangler.jsonc.
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
        test: {
          name: "worker",
          include: ["worker/**/*.test.ts"],
        },
      },
      {
        // Front-end tests run in jsdom.
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          passWithNoTests: true,
        },
      },
    ],
  },
});
