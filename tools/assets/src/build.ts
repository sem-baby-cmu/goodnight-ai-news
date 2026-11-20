// The shape of every `asset.json` in `tools/assets/out/<key>/v<n>/` (used by #12 and #21).
import { AssetManifestSchema } from "@storybook/dsl";
import { z } from "zod";
import { ASSET_KEY } from "./crops";

export const AssetBuildSchema = z.strictObject({
  key: z.string().regex(ASSET_KEY),
  kind: z.enum(["character", "prop", "scenery", "backdrop", "sfx"]),
  name: z.string().min(1),
  version: z.number().int().min(1),
  renderer: z.enum(["webp", "svg", "svg-rig", "audio"]),
  manifest: AssetManifestSchema,
});

export type AssetBuild = z.infer<typeof AssetBuildSchema>;
