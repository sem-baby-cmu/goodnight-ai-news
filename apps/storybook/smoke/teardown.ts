import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Playwright stops the preview server with a kill that skips its clean-up, so
// the deploy redirect that `scripts/spike-preview.ts` wrote can stay behind.
// Remove it when it leads to the spike build, so a deploy fails instead of
// shipping the spike.
export default function teardown() {
  const file = fileURLToPath(new URL("../.wrangler/deploy/config.json", import.meta.url));
  try {
    if (readFileSync(file, "utf8").includes("dist-spike")) rmSync(file);
  } catch {
    // No file: nothing to remove.
  }
}
