import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { missingFixtureFiles } from "../../scripts/s2/fixtures";

// Runs only under `test:s2` (vitest.s2.config.ts). Before the S2 run it fails,
// because no fixture folder exists yet.
const ROOT = path.join(import.meta.dirname, "s2");
const slugs = (JSON.parse(readFileSync(path.join(ROOT, "inputs.json"), "utf8")) as Array<{ slug: string }>).map((i) => i.slug);

it("every slug in inputs.json has its fixture folder", () => {
  expect(slugs).toHaveLength(3);
  for (const slug of slugs) expect([slug, missingFixtureFiles(path.join(ROOT, slug))]).toEqual([slug, []]);
});
