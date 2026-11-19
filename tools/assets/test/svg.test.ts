import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type AssetBuild, AssetBuildSchema } from "../src/build";
import { main } from "../src/cli";
import { REPO_ROOT, SOURCES_DIR } from "../src/paths";
import { checkSvg, MAX_SVG_BYTES, sanitizeSvg } from "../src/svg";

const PIP_SVG = join(SOURCES_DIR, "pip/v2/pip.svg");
const PIP_JSON = join(SOURCES_DIR, "pip/v2/asset.json");
const pipSource = () => readFileSync(PIP_SVG, "utf8");
const pipBuild = (): AssetBuild => AssetBuildSchema.parse(JSON.parse(readFileSync(PIP_JSON, "utf8")));

const PARTS = ["part-leg-left", "part-leg-right", "part-arm-left", "part-arm-right", "part-body", "part-head", "part-antenna", "part-face", "part-eyes"];
const EXPRESSIONS = ["happy", "sad", "angry", "surprised", "worried"];

// A minimal valid rig. `edit` changes one part of it for a fixture.
function rig(
  edit: { part?: (cls: string) => string | null; extra?: string; expr?: (e: string) => string; root?: string; viewBox?: string; pre?: string } = {},
): string {
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
  const root = `xmlns="http://www.w3.org/2000/svg" viewBox="${edit.viewBox ?? "0 0 232 416"}"${edit.root ?? ""}`;
  return `${edit.pre ?? ""}<svg ${root}>${body}${head}${edit.extra ?? ""}</svg>`;
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
    // preset-default may turn shapes into paths; the drawing itself stays.
    expect(clean).toMatch(/<(rect|path)[^>]*fill="#02a093"/);
    expect(clean).toContain("<circle");
    expect(clean).not.toContain("style=");
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
    expect(clean).not.toMatch(/http:\/\/x|data:|other\.svg|<image/);
    expect(clean).not.toContain("drop-use");
    // The rect with the remote fill stays, without the remote value.
    expect(clean).toMatch(/class="drop-remote"/);
  });

  it("sanitizeSvg keeps class, data-pivot, display=none and viewBox", () => {
    const clean = sanitizeSvg(rig());
    expect(clean).toContain('viewBox="0 0 232 416"');
    expect(clean).toContain('class="part-arm-right"');
    expect(clean).toContain('data-pivot="10 10"');
    expect(clean.match(/display="none"/g)).toHaveLength(4);
  });

  it("sanitizeSvg is a fixed point", () => {
    const once = sanitizeSvg(pipSource());
    expect(sanitizeSvg(once)).toBe(once);
  });

  it("sanitizeSvg keeps the structure of a clean file", () => {
    // preset-default may turn shapes into paths and merge paths inside a group.
    // Every group survives in order, with its class, data-pivot and display, and
    // still draws something; the viewBox and the colours stay.
    const groups = (text: string) =>
      [...text.matchAll(/<g\b([^>]*)>(?=(\s*<(?!\/g)\w+)?)/g)].map(([, a, child]) =>
        [/class="([^"]*)"/.exec(a!)?.[1], /data-pivot="([^"]*)"/.exec(a!)?.[1], /display="([^"]*)"/.exec(a!)?.[1], child ? "draws" : "empty"].join("|"),
      );
    const colours = (text: string) => [...new Set(text.match(/#[0-9a-f]{6}/gi))].sort();
    const source = pipSource();
    const clean = sanitizeSvg(source);
    expect(groups(clean)).toEqual(groups(source));
    expect(groups(clean)).toHaveLength(14);
    expect(colours(clean)).toEqual(colours(source));
    expect(clean).toContain('viewBox="0 0 232 416"');
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

// Review fix list for PR #53, item 1: each vector is inserted into a valid rig,
// so an issue can only come from the vector itself.
const R = '<rect x="0" y="0" width="5" height="5" fill="#02a093"/>';
const XLINK = ' xmlns:xlink="http://www.w3.org/1999/xlink"';
const VECTORS: Array<[name: string, input: string, danger: RegExp]> = [
  ["onload on svg", rig({ root: ' onload="alert(1)"' }), /onload/i],
  ["ONLOAD on svg", rig({ root: ' ONLOAD="alert(1)"' }), /onload/i],
  ["OnLoad on g", rig({ extra: `<g OnLoad="alert(1)">${R}</g>` }), /onload/i],
  ["a xlink:href javascript:", rig({ root: XLINK, extra: `<a xlink:href="javascript:alert(1)">${R}</a>` }), /javascript/i],
  ["a href java&#x09;script:", rig({ extra: `<a href=" java&#x09;script:alert(1)">${R}</a>` }), /java\s*script|&#x09;|alert/i],
  ["set to javascript:", rig({ extra: `<a><set attributeName="href" to="javascript:alert(1)"/>${R}</a>` }), /javascript|<set/i],
  ["animate values javascript:", rig({ extra: `<a><animate attributeName="xlink:href" values="javascript:alert(1)"/>${R}</a>` }), /javascript|<animate/i],
  ["style @import", rig({ extra: "<style>@import url(http://x/a.css)</style>" }), /@import|http:\/\/x/i],
  ["style attribute url(http:)", rig({ extra: '<rect x="0" y="0" width="5" height="5" style="fill:url(http://x/#a)"/>' }), /http:\/\/x/i],
  ["use href http:", rig({ extra: '<use href="http://x/a.svg#b"/>' }), /http:\/\/x|<use/i],
  ["use xlink:href data:", rig({ root: XLINK, extra: '<use xlink:href="data:image/svg+xml,%3Csvg/%3E"/>' }), /data:|<use/i],
  ["foreignObject", rig({ extra: '<foreignObject width="5" height="5"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>' }), /foreignObject|<div/i],
  ["image href", rig({ extra: '<image href="http://x/a.png" width="5" height="5"/>' }), /<image|http:\/\/x/i],
  ["feImage href", rig({ extra: '<filter><feImage href="http://x/a.png"/></filter>' }), /feImage|http:\/\/x/i],
  ["xml:base", rig({ root: ' xml:base="http://x/"' }), /xml:base|http:\/\/x/i],
  ["CDATA script in a g", rig({ extra: `<g><![CDATA[<script>alert(1)</script>]]>${R}</g>` }), /script|alert|CDATA/i],
  ["DOCTYPE entity", rig({ pre: '<!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]>', extra: "<g>&x;</g>" }), /script|alert/i],
  ["html:script", rig({ extra: '<html:script xmlns:html="http://www.w3.org/1999/xhtml">alert(1)</html:script>' }), /script|alert/i],
];

describe("security vectors (PR #53 review)", () => {
  it("a clean rig has no issues, so an issue below comes from the vector", () => {
    expect(codes(sanitizeSvg(rig()))).toEqual([]);
  });

  for (const [name, input, danger] of VECTORS) {
    it(`sanitizeSvg then checkSvg never passes ${name}`, () => {
      const out = sanitizeSvg(input);
      const issues = checkSvg(out, pipBuild());
      expect(danger.test(out) && issues.length === 0, `${name}: ${out}`).toBe(false);
      expect(sanitizeSvg(out)).toBe(out);
    });
  }

  it("sanitizeSvg removes CDATA, animation elements and xml:base", () => {
    const out = sanitizeSvg(rig({ root: ' xml:base="http://x/"', extra: `<g><![CDATA[x]]><set attributeName="fill" to="red"/><animate attributeName="x" values="1;2"/>${R}</g>` }));
    expect(out).not.toMatch(/CDATA|<set|<animate|xml:base/);
  });
});

describe("checkSvg (PR #53 review)", () => {
  it("checkSvg returns svg_parse for malformed XML instead of throwing", () => {
    expect(codes("<svg><g></svg")).toEqual(["svg_parse"]);
  });

  it("checkSvg reports a text node outside <title>", () => {
    expect(codes(rig({ extra: "<g>hello</g>" }))).toContain("svg_text");
  });

  it("checkSvg requires viewBox 0 0 W H equal to the pose box", () => {
    expect(codes(rig({ viewBox: "0 0 100 100" }))).toContain("svg_viewbox");
    expect(codes(rig({ viewBox: "1 0 232 416" }))).toContain("svg_viewbox");
    expect(codes(rig({ viewBox: "0 0 232" }))).toContain("svg_viewbox");
  });

  it("checkSvg reports undeclared, duplicate and zero visible expression groups", () => {
    expect(codes(rig({ extra: '<g class="expr-sleepy" display="none"/>' }))).toContain("svg_expression_undeclared");
    expect(codes(rig({ extra: '<g class="expr-sad" display="none"/>' }))).toContain("svg_expression_duplicate");
    expect(codes(rig({ expr: (e) => `<g class="expr-${e}" display="none"><path d="M0 0L1 1"/></g>` }))).toContain("svg_expression_visible");
  });

  it("checkSvg reports a legal pair with an undeclared pose or expression", () => {
    const build = pipBuild();
    if (build.manifest.kind === "sfx") throw new Error("pip is not an sfx");
    build.manifest.legal.push({ pose: "walk", expression: "happy" }, { pose: "front", expression: "sleepy" });
    const issues = checkSvg(sanitizeSvg(rig()), build).filter((i) => i.code === "svg_legal");
    expect(issues).toHaveLength(2);
  });

  it("checkSvg accepts data-pivot only as two space-separated plain numbers", () => {
    const pivot = (v: string) => codes(rig({ part: (c) => (c === "part-eyes" ? `<g class="part-eyes" data-pivot="${v}"><rect x="0" y="0" width="1" height="1"/></g>` : null) }));
    for (const ok of ["10 10", "-3.5 0.25", "119.5 141"]) expect(pivot(ok), ok).not.toContain("svg_pivot");
    for (const bad of ["10,10", "10, 10", "1e2 3", "10  10", " 10 10", "10 10 ", "10", "NaN 1", "Infinity 1"]) expect(pivot(bad), bad).toContain("svg_pivot");
  });

  it("svgo is pinned to an exact version in the catalog", () => {
    expect(readFileSync(join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8")).toMatch(/^ {2}svgo: \d+\.\d+\.\d+$/m);
  });
});

describe("svg sub-command failures (PR #53 review)", () => {
  const quiet = { log: () => {} };
  const copy = (edit: (svg: string, json: Record<string, unknown>) => void) => {
    const src = mkdtempSync(join(tmpdir(), "assets-src-"));
    cpSync(join(SOURCES_DIR, "pip"), join(src, "pip"), { recursive: true });
    const svgFile = join(src, "pip/v2/pip.svg");
    const jsonFile = join(src, "pip/v2/asset.json");
    const json = JSON.parse(readFileSync(jsonFile, "utf8"));
    edit(readFileSync(svgFile, "utf8"), json);
    writeFileSync(jsonFile, JSON.stringify(json));
    return { src, svgFile };
  };

  it("svg exits 1 when IoU is below 0.90", async () => {
    const out = mkdtempSync(join(tmpdir(), "assets-out-"));
    expect(await main(["cut", "character-board-00-robot", "--out", out, "--no-review"], quiet)).toBe(0);
    const { src, svgFile } = copy(() => {});
    // Shrink the body and the head shell: the silhouette loses a large area.
    const svg = readFileSync(svgFile, "utf8")
      .replace(/<path d="M80 205H155[^"]*"/, '<path d="M110 240h10v10h-10Z"')
      .replace('<rect x="32" y="68" width="172" height="144" rx="48" fill="#02a093"/>', '<rect x="100" y="100" width="10" height="10" fill="#02a093"/>');
    writeFileSync(svgFile, svg);
    const lines: string[] = [];
    const errors: string[] = [];
    expect(await main(["svg", "pip", "--version", "2", "--src", src, "--out", out], { log: (l) => lines.push(l), error: (l) => errors.push(l) })).toBe(1);
    expect(lines.some((l) => /^IoU=0\.[0-8]/.test(l))).toBe(true);
    expect(errors.join(" ")).toMatch(/IoU .* below 0\.90/);
  }, 120_000);

  it("svg exits 1 for an svg-rig that is not a character", async () => {
    const { src } = copy((_svg, json) => {
      json.kind = "prop";
      (json.manifest as Record<string, unknown>).kind = "prop";
    });
    const errors: string[] = [];
    const out = mkdtempSync(join(tmpdir(), "assets-out-"));
    expect(await main(["svg", "pip", "--version", "2", "--src", src, "--out", out], { log: () => {}, error: (l) => errors.push(l) })).toBe(1);
    expect(errors.join(" ")).toMatch(/svg-rig.*character/);
  });
});
