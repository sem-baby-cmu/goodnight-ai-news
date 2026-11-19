import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { newId } from "../db/ids";
import { handleContent, releasePath } from "./content";
import { serveR2Object } from "./serve";
import { publishStory } from "./publish";
import { seedPublishableStory } from "./test/fixtures";

const app = new Hono<{ Bindings: Env }>();
app.get("/content/releases/:releaseId/*", handleContent);

function get(path: string, headers?: HeadersInit) {
  return app.request(`http://localhost${path}`, { headers }, env);
}

async function published() {
  const seeded = await seedPublishableStory(env);
  const result = await publishStory(env, seeded.storyId);
  if (!result.ok) throw new Error(`publish failed: ${JSON.stringify(result)}`);
  return { seeded, result };
}

describe("content route", () => {
  it("PUB-01.S8 content route serves the manifest with the immutable header", async () => {
    const { result } = await published();
    const res = await get(`/content/releases/${result.releaseId}/manifest.json`);
    expect(res.status).toBe(200);
    const stored = await env.BUCKET.get(result.manifestKey);
    expect(await res.text()).toBe(await stored!.text());
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("etag")).toBeTruthy();
  });

  it("content route answers a range request with 206", async () => {
    const { seeded, result } = await published();
    const key = `releases/${result.releaseId}/audio/${seeded.pageIds[0]}.wav`;
    const size = (await env.BUCKET.head(key))!.size;
    const res = await get(`/content/releases/${result.releaseId}/audio/${seeded.pageIds[0]}.wav`, { Range: "bytes=0-9" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-9/${size}`);
    expect((await res.arrayBuffer()).byteLength).toBe(10);
  });

  it("content route returns 404 for a prefix without a release row", async () => {
    const orphan = newId();
    await env.BUCKET.put(`releases/${orphan}/manifest.json`, "{}");
    const res = await get(`/content/releases/${orphan}/manifest.json`);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("content route returns 404 for a bad id or a dot-dot path", async () => {
    const { result } = await published();
    const cases = [
      "/content/releases/not-a-uuid/manifest.json",
      `/content/releases/${result.releaseId.toUpperCase()}/manifest.json`,
      `/content/releases/${result.releaseId}/%2e%2e/%2e%2e/assets/test-bear/v1/stand-happy.webp`,
      `/content/releases/${result.releaseId}/pages/%2E/x.json`,
      `/content/releases/${result.releaseId}/pages%5Cx.json`,
      `/content/releases/${result.releaseId}/`,
      `/content/releases/${result.releaseId}/missing.json`,
    ];
    for (const path of cases) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      // A dot-dot path does not reach the handler: the URL parser removes the
      // segments, and the app's own 404 answers. No 404 is cached as immutable.
      expect(res.headers.get("cache-control") ?? "", path).not.toContain("immutable");
    }
  });

  it("releasePath rejects dot, dot-dot, backslash, and an empty rest", () => {
    const id = newId();
    const base = `/content/releases/${id}/`;
    expect(releasePath(`${base}pages/a.json`, id)).toBe("pages/a.json");
    for (const rest of [".", "..", "pages/../x.json", "./x.json", "pages/.", "a\\b", "%2e%2e/x", "%5Cx", ""]) {
      expect(releasePath(base + rest, id), rest).toBeNull();
    }
    expect(releasePath(`/content/releases/${newId()}/x.json`, id)).toBeNull();
  });

  it("serveR2Object answers 416 for a range outside the object", async () => {
    const key = `test/range/${newId()}.bin`;
    await env.BUCKET.put(key, new Uint8Array(100));
    const res = await serveR2Object(env.BUCKET, key, new Request("http://x/", { headers: { Range: "bytes=500-600" } }), "public, max-age=31536000, immutable");
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */100");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serveR2Object answers 416 for a range on an empty object", async () => {
    const key = `test/range/${newId()}.bin`;
    await env.BUCKET.put(key, new Uint8Array(0));
    const res = await serveR2Object(env.BUCKET, key, new Request("http://x/", { headers: { Range: "bytes=0-9" } }), "public, max-age=31536000, immutable");
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */0");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serveR2Object rethrows an error that is not a range error", async () => {
    const failing = { get: async () => { throw new Error("internal error"); }, head: async () => null } as unknown as R2Bucket;
    const request = new Request("http://x/", { headers: { Range: "bytes=0-9" } });
    await expect(serveR2Object(failing, "k", request, "public, max-age=31536000, immutable")).rejects.toThrow("internal error");
  });
});

