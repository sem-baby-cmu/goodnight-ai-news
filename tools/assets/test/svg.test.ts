import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type AssetBuild, AssetBuildSchema } from "../src/build";
import { main } from "../src/cli";
import { SOURCES_DIR } from "../src/paths";
import { checkSvg, MAX_SVG_BYTES, sanitizeSvg } from "../src/svg";

const PIP_SVG = join(SOURCES_DIR, "pip/v2/pip.svg");
const PIP_JSON = join(SOURCES_DIR, "pip/v2/asset.json");
const pipSource = () => readFileSync(PIP_SVG, "utf8");
const pipBuild = (): AssetBuild => AssetBuildSchema.parse(JSON.parse(readFileSync(PIP_JSON, "utf8")));

const PARTS = ["part-leg-left", "part-leg-right", "part-arm-left", "part-arm-right", "part-body", "part-head", "part-antenna", "part-face", "part-eyes"];
const EXPRESSIONS = ["happy", "sad", "angry", "surprised", "worried"];

// A minimal valid rig. `edit` changes one part of it for a fixture.
function rig(edit: { part?: (cls: string) => string | null; extra?: string; expr?: (e: string) => string } = {}): string {
  const group = (cls: string) => {
    const custom = edit.part?.(cls);
    if (custom !== undefined && custom !== null) return custom;
    const pivot = cls === "part-body" || cls === "part-face" ? "" : ' data-pivot="10 10"';
    return `<g class="${cls}"${pivot}><rect x="0" y="0" width="5" height="5" fill="#02a093"/></g>`;
  };
  const exprs = EXPRESSIONS.map(
    (e) => edit.expr?.(e) ?? `<g class="expr-${e}"${e === "happy" ? "" : ' display="none"'}><path d="M0 0L5 5" stroke="#020100"/></g>`,
  ).join("");
  const body = PARTS.filter((p) => !["part-head", "part-antenna", "part-face", "part-eyes"].includes(p)).map(group).join("");
  const head = group("part-head").replace(/<\/g>$/, `${group("part-antenna")}${group("part-face")}${group("part-eyes")}${exprs}</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}${head}${edit.extra ?? ""}</svg>`;
}
const codes = (text: string) => checkSvg(text, pipBuild()).map((i) => i.code);

describe("sanitizeSvg", () => {
  it("REG-02.S3 sanitizeSvg removes script, style, on* attributes and javascript: hrefs", () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">' +
      "<script>alert(2)</script><style>rect{fill:red}</style>" +
      '<rect x="0" y="0" width="5" height="5" fill="#02a093" onclick="alert(3)"/>' +
      '<a href="javascript:alert(4)"><circle cx="5" cy="5" r="2" fill="#020100"/></a>' +
      '<foreignObject width="5" height="5"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>' +
      "</svg>";
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/<script|<style|onload|onclick|javascript:|alert|<foreignObject|<div/i);
    expect(clean).toContain("<rect");
    expect(clean).toContain("<circle");
    expect(checkSvg(clean, pipBuild()).filter((i) => i.code === "svg_attribute")).toEqual([]);
  });

  it("sanitizeSvg removes external references and keeps # references", () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">' +
      '<rect class="keep-local" x="0" y="0" width="5" height="5" fill="url(#g)"/>' +
      '<rect class="drop-remote" x="0" y="0" width="5" height="5" fill="url(http://x/y.svg#g)"/>' +
      '<use class="keep-use" href="#a"/>' +
      '<use class="drop-use" xlink:href="other.svg#a"/>' +
      '<image class="drop-data" href="data:image/png;base64,AAAA" width="5" height="5"/>' +
      '<image class="drop-http" href="http://x/y.png" width="5" height="5"/>' +
      "</svg>";
    const clean = sanitizeSvg(text);
    expect(clean).toContain('fill="url(#g)"');
    expect(clean).toMatch(/<use[^>]*href="#a"/);
    expect(clean).not.toMatch(/http:|data:|other\.svg|<image/);
    expect(clean).not.toContain("drop-use");
    // The rect with the remote fill stays, without the remote value.
    expect(clean).toMatch(/class="drop-remote"/);
  });

  it("sanitizeSvg keeps class, data-pivot, display=none and viewBox", () => {
    const clean = sanitizeSvg(rig());
    expect(clean).toContain('viewBox="0 0 100 100"');
    expect(clean).toContain('class="part-arm-right"');
    expect(clean).toContain('data-pivot="10 10"');
    expect(clean.match(/display="none"/g)).toHaveLength(4);
  });

  it("sanitizeSvg is a fixed point", () => {
    const once = sanitizeSvg(pipSource());
    expect(sanitizeSvg(once)).toBe(once);
  });

  it("sanitizeSvg keeps the structure of a clean file", () => {
    // Every element, class, data-pivot and display value survives, in order.
    const shape = (text: string) => [...text.matchAll(/<(\w+)([^>]*)>/g)].filter(([, n]) => n !== "title").map(([, n, a]) => [n, /class="([^"]*)"/.exec(a!)?.[1], /data-pivot="([^"]*)"/.exec(a!)?.[1], /display="([^"]*)"/.exec(a!)?.[1]].join("|"));
    expect(shape(sanitizeSvg(pipSource()))).toEqual(shape(pipSource().replace(/<!--[\s\S]*?-->/g, "")));
  });
});

describe("checkSvg", () => {
  it("checkSvg rejects <image> and <a> left by sanitizeSvg", () => {
    const text = rig({ extra: '<image href="x.png" width="1" height="1"/><a><rect x="0" y="0" width="1" height="1"/></a>' });
    const issues = checkSvg(text, pipBuild());
    expect(issues.filter((i) => i.code === "svg_element").map((i) => i.message).join(" ")).toMatch(/image.*\ba\b|\ba\b.*image/);
  });

  it("checkSvg reports id, url(), style element, transform on a part group, missing part, duplicate part, missing pivot, two visible expressions, oversize file", () => {
    expect(codes(rig())).toEqual([]);
    expect(codes(rig({ extra: '<rect id="x" x="0" y="0" width="1" height="1"/>' }))).toContain("svg_id");
    expect(codes(rig({ extra: '<rect x="0" y="0" width="1" height="1" fill="url(#g)"/>' }))).toContain("svg_url");
    expect(codes(rig({ extra: "<style>rect{}</style>" }))).toContain("svg_element");
    expect(codes(rig({ part: (c) => (c === "part-arm-left" ? '<g class="part-arm-left" data-pivot="1 1" transform="rotate(5)"><rect x="0" y="0" width="1" height="1"/></g>' : null) }))).toContain("svg_part_transform");
    expect(codes(rig({ part: (c) => (c === "part-leg-left" ? "" : null) }))).toContain("svg_part_missing");
    expect(codes(rig({ extra: '<g class="part-body"><rect x="0" y="0" width="1" height="1"/></g>' }))).toContain("svg_part_duplicate");
    expect(codes(rig({ part: (c) => (c === "part-eyes" ? '<g class="part-eyes"><rect x="0" y="0" width="1" height="1"/></g>' : null) }))).toContain("svg_pivot");
    expect(codes(rig({ part: (c) => (c === "part-eyes" ? '<g class="part-eyes" data-pivot="a b"><rect x="0" y="0" width="1" height="1"/></g>' : null) }))).toContain("svg_pivot");
    expect(codes(rig({ expr: (e) => `<g class="expr-${e}"><path d="M0 0L1 1"/></g>` }))).toContain("svg_expression_visible");
    expect(codes(rig({ expr: (e) => (e === "worried" ? "" : `<g class="expr-${e}"${e === "happy" ? "" : ' display="none"'}><path d="M0 0L1 1"/></g>`) }))).toContain("svg_expression_missing");
    expect(codes(rig({ extra: `<title>${"x".repeat(MAX_SVG_BYTES)}</title>` }))).toContain("svg_size");
  });

  it("checkSvg returns no issues for assets/pip/v2/pip.svg", () => {
    expect(checkSvg(sanitizeSvg(pipSource()), pipBuild())).toEqual([]);
  });

  it("pip asset.json validates with AssetBuildSchema and legal has 5 front pairs", () => {
    const build = pipBuild();
    expect(build.renderer).toBe("svg-rig");
    if (build.manifest.kind === "sfx") throw new Error("pip is not an sfx");
    expect(build.manifest.legal).toEqual(EXPRESSIONS.map((expression) => ({ pose: "front", expression })));
    expect(build.manifest.parts).toEqual(PARTS);
  });
});

describe("svg sub-command", () => {
  let out = "";
  const lines: string[] = [];
  let code = -1;

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), "assets-svg-"));
    const quiet = { log: () => {} };
    expect(await main(["cut", "character-board-00-robot", "--out", out, "--no-review"], quiet)).toBe(0);
    expect(await main(["measure", "character-board-00-robot", "--out", out], quiet)).toBe(0);
    code = await main(["svg", "pip", "--version", "2", "--out", out], { log: (l) => lines.push(l) });
  }, 120_000);

  it("svg pip --version 2 exits 0 and prints IoU of at least 0.90", () => {
    expect(code).toBe(0);
    const iou = lines.map((l) => /^IoU=([\d.]+)$/.exec(l)?.[1]).find(Boolean);
    expect(Number(iou)).toBeGreaterThanOrEqual(0.9);
  });

  it("the built pip.svg is sanitised text and its asset.json validates", () => {
    const built = readFileSync(join(out, "pip/v2/pip.svg"), "utf8");
    expect(sanitizeSvg(built)).toBe(built);
    expect(Buffer.byteLength(built)).toBeLessThanOrEqual(MAX_SVG_BYTES);
    AssetBuildSchema.parse(JSON.parse(readFileSync(join(out, "pip/v2/asset.json"), "utf8")));
    expect(readFileSync(join(out, "review/pip-v2-compare.png")).subarray(1, 4).toString()).toBe("PNG");
  });

  it("svg exits 1 and names the key when the source is missing", async () => {
    const errors: string[] = [];
    expect(await main(["svg", "nope", "--version", "2", "--out", out], { log: () => {}, error: (l) => errors.push(l) })).toBe(1);
    expect(errors.join(" ")).toMatch(/nope/);
  });
});
