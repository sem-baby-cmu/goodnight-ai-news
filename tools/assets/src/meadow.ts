// The code-made backdrop `meadow` (#67, ADR 0016 section 1 and Decision A):
// a flat sky and three hills, one SVG per sky palette, 2400 x 1200 frame
// units (the 1600 x 1200 stage and 400 units of bleed on each side). The near
// ground covers the whole ground band, y 740 to 1200 (design "8. Asset
// pipeline", art contract). Flat fills only: checkSvg rejects url().
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type PaletteId, SKY_PALETTES } from "@storybook/dsl";
import { type AssetBuild, AssetBuildSchema } from "./build";
import { checkSvg, sanitizeSvg } from "./svg";

export const MEADOW_VERSION = 1;

// DESIGN.md, Sky palettes.
export const MEADOW_COLOURS: Record<PaletteId, { sky: string; far: string; mid: string; near: string }> = {
  day: { sky: "#CFE6EE", far: "#C9DE9E", mid: "#A3CB6E", near: "#8DBC5C" },
  cloudy: { sky: "#DCE3E6", far: "#C3D3A0", mid: "#9EBC74", near: "#8AAD62" },
  dusk: { sky: "#F2D3B0", far: "#D1C98E", mid: "#AABA6A", near: "#93A85A" },
  night: { sky: "#2F4066", far: "#3D5A5E", mid: "#344E4B", near: "#2D443F" },
};

// The coordinates are an implementation decision (#67 refinement). The near
// ground's top edge is between y 720 and 740 at every x; the far and mid hills
// end above y 740.
export function meadowSvg(sky: PaletteId): string {
  const c = MEADOW_COLOURS[sky];
  return sanitizeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 1200" width="2400" height="1200">` +
      `<rect width="2400" height="1200" fill="${c.sky}"/>` +
      `<path d="M0 620 Q600 500 1200 600 Q1800 700 2400 560 V1200 H0 Z" fill="${c.far}"/>` +
      `<path d="M0 700 Q700 600 1400 690 Q1900 750 2400 660 V1200 H0 Z" fill="${c.mid}"/>` +
      `<path d="M0 740 Q1200 700 2400 740 V1200 H0 Z" fill="${c.near}"/>` +
      `</svg>`,
  );
}

// Writes <outDir>/meadow/v1/<sky>.svg for every palette and asset.json.
export function writeMeadowBuild(outDir: string): AssetBuild {
  const build = AssetBuildSchema.parse({
    key: "meadow",
    kind: "backdrop",
    name: "Meadow",
    version: MEADOW_VERSION,
    renderer: "svg",
    manifest: {
      kind: "backdrop",
      description: "an open meadow with soft hills",
      size: { width: 2400, height: 1200 },
      variants: SKY_PALETTES.map((sky) => ({ sky, file: `${sky}.svg` })),
    },
  });
  const texts = SKY_PALETTES.map((sky) => {
    const file = `${sky}.svg`;
    const text = meadowSvg(sky);
    const [issue] = checkSvg(text, build, file);
    if (issue) throw new Error(`meadow ${sky}: ${issue.code}: ${issue.message}`);
    return [file, text] as const;
  });
  const dir = join(outDir, "meadow", `v${MEADOW_VERSION}`);
  mkdirSync(dir, { recursive: true });
  for (const [file, text] of texts) writeFileSync(join(dir, file), text);
  writeFileSync(join(dir, "asset.json"), `${JSON.stringify(build, null, 2)}\n`);
  return build;
}
