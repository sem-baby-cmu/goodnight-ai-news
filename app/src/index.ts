// Entry point for the Lullabyte Worker.
// Today it only answers a health check. Stage modules, the StoryWorkflow,
// and the reader API come later (see integration/architecture.md).

// `Env` comes from worker-configuration.d.ts. Run `npm run types` after a
// binding changes in wrangler.jsonc.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json(await health(env));
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

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
