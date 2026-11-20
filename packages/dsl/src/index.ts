export {
  ACTIONS,
  type ActionId,
  PRIMITIVE_IDS,
  PRIMITIVES,
  type PaletteId,
  primitiveAllows,
  type PrimitiveId,
  SKY_PALETTES,
} from "./primitives";
export {
  type AssetKind,
  type AssetManifest,
  AssetManifestSchema,
  type BackdropManifest,
  isLayerManifest,
  type LayerManifest,
  manifestFiles,
  type Point,
  type PoseEntry,
  type Rect,
  type RegistrySnapshot,
  type Renderer,
  selectPoseEntry,
} from "./registry";
export type { LayoutTemplate } from "./template";
export {
  type Animation,
  AnimationSchema,
  type Interaction,
  InteractionSchema,
  type Layer,
  LayerSchema,
  type Outline,
  OutlineSchema,
  type PageScene,
  PageSceneSchema,
  type PageText,
  PageTextSchema,
  type ReleaseManifest,
  ReleaseManifestSchema,
  type ReleasePage,
  ReleasePageSchema,
} from "./schemas";
export { assignSceneIds, type SceneDraft, SceneDraftSchema, type ScriptDraft, ScriptDraftSchema } from "./draft";
export { type Issue, validateScene } from "./validate";
export { buildOutlineJsonSchema, buildSceneJsonSchema } from "./json-schema";
export { SCRIPT_TEXT_LIMITS, scriptTextIssues } from "./script-text";
