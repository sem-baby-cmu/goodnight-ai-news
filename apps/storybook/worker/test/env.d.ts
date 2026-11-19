// Test-only binding. vitest.config.ts passes the migrations to the `worker`
// test project; production code never reads it.
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: { name: string; queries: string[] }[];
  }
}
