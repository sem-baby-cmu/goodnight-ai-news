import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "./app";

// Alone in its file, so no other test has written a story (PUB-03.S6).
describe("GET /api/shelf with no story", () => {
  it("PUB-03.S6 an empty shelf is an empty list", async () => {
    const count = await env.DB.prepare("SELECT count(*) AS n FROM story").first<{ n: number }>();
    expect(count!.n).toBe(0);

    const res = await app.request("http://localhost/api/shelf", { method: "GET" }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ books: [] });
  });
});
