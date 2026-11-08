// Entry point for the Lullabyte Worker.
// One Worker serves the front end (Static Assets, built by Vite) and the API.
// Requests for /api/* and /health reach this code first (see
// `assets.run_worker_first` in wrangler.jsonc). Every other path is a file in
// the front end, or the single-page app's index.html.
// Stage modules, the StoryWorkflow, and the reader API come later
// (see integration/architecture.md).

// `Env` comes from worker-configuration.d.ts. Run `npm run types` after a
// binding changes in wrangler.jsonc.

import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", async (c) => c.json(await health(c.env)));

// Unknown API paths answer in JSON, not with the front end's HTML.
app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app satisfies ExportedHandler<Env>;

// Check that each binding answers. Report the result; do not throw.
async function health(env: Env) {
  const checks: Record<string, string> = {};
  try {
    await env.DB.prepare("SELECT 1").first();
    checks.d1 = "ok";
  } catch (e) {
    checks.d1 = `error: ${(e as Error).message}`;
  }
  try {
    await env.MEDIA.head("health-check");
    checks.r2 = "ok";
  } catch (e) {
    checks.r2 = `error: ${(e as Error).message}`;
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return { ok, checks };
}
