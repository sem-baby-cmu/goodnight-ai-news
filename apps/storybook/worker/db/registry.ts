import type { RegistrySnapshot } from "@storybook/dsl";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { asset, assetVersion } from "./schema";

// The active version of every asset.
export async function loadActiveRegistry(db: Db): Promise<RegistrySnapshot> {
  const rows = await db
    .select({
      key: asset.key,
      kind: asset.kind,
      renderer: assetVersion.renderer,
      version: assetVersion.version,
      manifest: assetVersion.manifest,
    })
    .from(assetVersion)
    .innerJoin(asset, eq(asset.id, assetVersion.assetId))
    .where(eq(assetVersion.active, true));
  const assets: RegistrySnapshot["assets"] = {};
  for (const r of rows) assets[r.key] = { kind: r.kind, renderer: r.renderer, version: r.version, manifest: r.manifest };
  return { assets };
}
