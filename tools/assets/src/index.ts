export { type AssetBuild, AssetBuildSchema } from "./build";
export { main } from "./cli";
export { silhouetteIoU, writeCompareSheet } from "./compare";
export {
  ALL_BOARDS,
  CHARACTER_BOARDS,
  CHARACTER_KEYS,
  type CropMap,
  CropMapSchema,
  MERGE_GAP,
  PROP_BOARDS,
  PROP_KEYS,
  proposeCropMap,
} from "./crops";
export { boardBackground, cutFigure, detectFigures, findHoleCandidates, measureImage } from "./image";
export { BOARDS_DIR, CROPS_DIR, OUT_DIR, REPO_ROOT, REVIEW_DIR, SOURCES_DIR } from "./paths";
export { buildSql, type ExistingRow, loadLocalBuilds, manifestFiles, type Plan, planPublish, PublishInputError, runPublish } from "./publish";
export { writeReviewSheets } from "./review";
export { SFX, type SfxRecipe } from "./sfx/recipes";
export { encodeWav, mulberry32, renderSfx, writeSfxBuilds } from "./sfx/synth";
export { checkSvg, MAX_SVG_BYTES, sanitizeSvg, SVGO_CONFIG } from "./svg";
