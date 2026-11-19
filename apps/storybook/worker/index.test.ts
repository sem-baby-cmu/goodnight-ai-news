import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("worker", () => {
  it("GET /health returns 200 ok", async () => {
    const res = await exports.default.fetch("http://x/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("bindings DB and BUCKET exist", () => {
    expect(env.DB).toBeDefined();
    expect(env.BUCKET).toBeDefined();
  });
});
