import { defineConfig } from "vitest/config";

// The S2 fixture folder check only (R30). It is not part of `pnpm -r test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/model-contract/s2.test.ts"],
  },
});
