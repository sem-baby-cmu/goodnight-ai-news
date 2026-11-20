import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
// The Producer boards. Read only: never change, move, or re-save them.
export const BOARDS_DIR = join(REPO_ROOT, "modules/material/00_storybook_design");
export const CROPS_DIR = join(REPO_ROOT, "tools/assets/crops");
// Build output; not tracked (AGENTS.md section 9).
export const OUT_DIR = join(REPO_ROOT, "tools/assets/out");
export const REVIEW_DIR = join(OUT_DIR, "review");
export const SOURCES_DIR = join(REPO_ROOT, "assets");
// Backdrop approval records (#67). Tracked; a person writes them with `cli approve`.
export const REVIEWS_DIR = join(REPO_ROOT, "tools/assets/reviews");
