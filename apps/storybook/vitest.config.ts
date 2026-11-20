import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tests only. This file is separate from vite.config.ts, so the Cloudflare
// Vite plugin does not load in tests.
export default defineConfig(async () => ({
  test: {
    projects: [
      {
        // Worker tests run inside workerd with the bindings from wrangler.jsonc.
        // TEST_MIGRATIONS is a test-only binding; the setup file applies it.
        // The model bindings replace the values of a local `.dev.vars`, which
        // wrangler loads here too: worker tests use the stub model and cannot
        // reach a provider (#73). A test that needs the real client passes
        // its own env object.
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
                MODEL_MODE: "stub",
                OPENAI_BASE_URL: "http://127.0.0.1:9/no-network-in-tests",
                TTS_BASE_URL: "http://127.0.0.1:9/no-network-in-tests",
                OPENAI_API_KEY: "no-key-in-tests",
                TTS_API_KEY: "no-key-in-tests",
              },
            },
          }),
        ],
        test: {
          name: "worker",
          include: ["worker/**/*.test.ts"],
          setupFiles: ["./worker/test/apply-migrations.ts"],
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
      {
        // Model contract tests of the recorded S2 fixtures (R46). Node only,
        // no network. s2.test.ts runs under vitest.s2.config.ts instead.
        test: {
          name: "model-contract",
          environment: "node",
          include: ["test/model-contract/fixtures.test.ts"],
        },
      },
    ],
  },
}));
