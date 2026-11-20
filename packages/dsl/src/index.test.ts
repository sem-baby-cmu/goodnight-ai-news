import { expect, it } from "vitest";
import * as dsl from "./index";

it("index re-exports the public API", () => {
  for (const name of [
    "PRIMITIVES",
    "ACTIONS",
    "SKY_PALETTES",
    "AssetManifestSchema",
    "selectPoseEntry",
    "isLayerManifest",
    "manifestFiles",
    "OutlineSchema",
    "PageTextSchema",
    "LayerSchema",
    "AnimationSchema",
    "InteractionSchema",
    "PageSceneSchema",
    "ReleaseManifestSchema",
    "ReleasePageSchema",
    "ScriptDraftSchema",
    "SceneDraftSchema",
    "assignSceneIds",
    "validateScene",
    "buildOutlineJsonSchema",
    "buildSceneJsonSchema",
  ]) {
    expect(dsl, name).toHaveProperty(name);
  }
});
