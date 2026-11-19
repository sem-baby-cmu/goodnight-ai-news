import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Vitest setup file for the `worker` project: create the tables in the
// local test database. Already applied migrations are skipped.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
