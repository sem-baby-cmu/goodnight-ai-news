import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getDb } from "./client";
import { newId } from "./ids";
import { asset, assetVersion } from "./schema";

describe("schema", () => {
  it("schema: migrations create the seven tables", async () => {
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const table of ["asset", "asset_version", "story", "run", "call_log", "revision", "release"]) {
      expect(names).toContain(table);
    }
  });

  it("asset_version: a second active version for one asset fails", async () => {
    const db = getDb(env.DB);
    const createdAt = new Date().toISOString();
    const assetId = newId();
    const key = `asset-${assetId}`;
    await db.insert(asset).values({ id: assetId, key, kind: "sfx", name: key, createdAt });
    const manifest = { kind: "sfx" as const, file: "a.mp3", durationMs: 1 };
    const row = (version: number, active: boolean) => ({
      id: newId(),
      assetId,
      version,
      renderer: "audio" as const,
      manifest,
      r2Prefix: `assets/${key}/v${version}/`,
      active,
      createdAt,
    });
    await db.insert(assetVersion).values(row(1, true));
    await db.insert(assetVersion).values(row(2, false));
    await expect(db.insert(assetVersion).values(row(3, true))).rejects.toThrow();
  });
});
