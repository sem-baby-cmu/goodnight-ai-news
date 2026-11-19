// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { SOURCES_DIR } from "../src/paths";
import { sanitizeSvg } from "../src/svg";

it("pip svg is inlined twice without id collisions", () => {
  const svg = sanitizeSvg(readFileSync(join(SOURCES_DIR, "pip/v2/pip.svg"), "utf8"));
  document.body.innerHTML = `<div class="layer">${svg}</div><div class="layer">${svg}</div>`;
  expect(document.querySelectorAll(".part-eyes").length).toBe(2);
  expect(document.querySelectorAll("[id]").length).toBe(0);
  // Each copy finds its own parts inside its own subtree.
  for (const layer of document.querySelectorAll(".layer")) expect(layer.querySelectorAll(".part-arm-right").length).toBe(1);
});
