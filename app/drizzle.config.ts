import { defineConfig } from "drizzle-kit";

// Writes SQL migrations into the D1 `migrations_dir` from wrangler.jsonc.
// Wrangler applies them: `npx wrangler d1 migrations apply DB --local|--remote`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./migrations",
});
