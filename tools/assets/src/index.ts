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
export { writeReviewSheets } from "./review";
export { checkSvg, MAX_SVG_BYTES, sanitizeSvg, SVGO_CONFIG } from "./svg";
