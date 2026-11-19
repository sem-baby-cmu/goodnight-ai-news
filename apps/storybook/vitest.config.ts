import { fileURLToPath, URL } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
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
        // Front-end tests run in jsdom, with the same `@/` alias as vite.config.ts.
        plugins: [react()],
        resolve: {
          alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
        },
        test: {
          name: "ui",
          environment: "jsdom",
          // Vitest replaces CSS with an empty string by default, also for
          // `?raw`. tokens.test.tsx reads styles.css as text.
          css: { include: [/styles\.css/] },
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
  },
});
