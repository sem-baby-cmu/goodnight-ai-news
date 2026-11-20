// Sanitise step and structural check for SVG assets (design "8. Asset pipeline", SVG step).
// #21 imports `sanitizeSvg` and `checkSvg` and refuses a file where
// `sanitizeSvg(text) !== text`, so the sanitised output must be a fixed point.
import { type Issue, isLayerManifest } from "@storybook/dsl";
import { type Config, type CustomPlugin, optimize, type XastChild, type XastElement, type XastParent } from "svgo";
import type { AssetBuild } from "./build";

export const MAX_SVG_BYTES = 20_480;

// A reference is local when it points into the same file: `#id` or `url(#id)`.
const isLocalHref = (value: string) => value.trim().startsWith("#");
const URL_VALUE = /url\(\s*['"]?([^'")]*)/gi;
const hasExternalUrl = (value: string) => [...value.matchAll(URL_VALUE)].some(([, target]) => !isLocalHref(target ?? ""));
// Browsers ignore whitespace and control characters inside a URL scheme, so
// "java&#x09;script:" is still javascript: (the parser has decoded the entity).
// eslint-disable-next-line no-control-regex
const isJavascript = (value: string) => /javascript:/i.test(value.replace(/[\s\u0000-\u001f]/g, ""));
// Elements that run code, load a resource, or change an attribute at run time.
const DROPPED = new Set(["script", "foreignObject", "image", "feImage", "set", "animate", "animateMotion", "animateTransform", "discard"]);
const remove = (node: XastChild, parent: XastParent) => {
  parent.children = parent.children.filter((child) => child !== node);
};
const inTitle = (parent: XastParent) => parent.type === "element" && parent.name === "title";

// Removes active content and every external reference (planner rule for #12,
// on top of AGENTS.md section 3): the DROPPED elements always; <use> unless its
// href is local; any href or xlink:href that is not local; `xml:base`; any
// attribute with a `javascript:` value or a non-local `url(...)`; CDATA, and
// text outside <title> (PR #53 review). Local references (`#…`, `url(#…)`)
// stay; checkSvg rejects them for a rig.
const removeExternalReferences: CustomPlugin = {
  name: "removeExternalReferences",
  fn: () => ({
    element: {
      enter(node: XastElement, parent: XastParent) {
        const href = node.attributes.href ?? node.attributes["xlink:href"];
        const local = href !== undefined && isLocalHref(href);
        if (DROPPED.has(node.name) || /(^|:)script$/i.test(node.name) || (node.name === "use" && !local)) return remove(node, parent);
        for (const [name, value] of Object.entries(node.attributes)) {
          const isHref = name === "href" || name === "xlink:href";
          if ((isHref && !isLocalHref(value)) || name === "xml:base" || isJavascript(value) || hasExternalUrl(value)) delete node.attributes[name];
        }
      },
    },
    cdata: { enter: (node, parent) => remove(node, parent) },
    text: { enter: (node, parent) => (inTitle(parent) ? undefined : remove(node, parent)) },
  }),
};

// The section's plugins (verified on svgo 4.1.0), with the external reference
// plugin added. The removal plugins run before preset-default: otherwise its
// inlineStyles step copies the rules of a <style> element into `style`
// attributes before removeStyleElement runs (implementation decision).
export const SVGO_CONFIG: Config = {
  multipass: true,
  plugins: [
    removeExternalReferences,
    "removeScripts",
    "removeRasterImages",
    "removeStyleElement",
    { name: "removeAttrs", params: { attrs: "(on.*)" } },
    {
      name: "preset-default",
      params: {
        overrides: {
          cleanupIds: false,
          removeHiddenElems: false,
          collapseGroups: false,
          moveGroupAttrsToElems: false,
          moveElemsAttrsToGroup: false,
        },
      },
    },
  ],
};

export function sanitizeSvg(text: string): string {
  return optimize(text, SVGO_CONFIG).data;
}

const ELEMENTS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "polygon", "polyline", "line", "title"]);
const ATTRIBUTES = new Set([
  "xmlns", "viewBox", "width", "height", "class", "data-pivot", "d", "cx", "cy", "r", "rx", "ry", "x", "y",
  "points", "x1", "y1", "x2", "y2", "fill", "fill-rule", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "opacity", "fill-opacity", "transform", "display",
]);
// "<x> <y>": two plain decimal numbers and one space; no comma, no exponent,
// no padding (the form #14 parses).
const NUMBER = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;
const PIVOT = new RegExp(`^${NUMBER} ${NUMBER}$`);
const VIEWBOX = new RegExp(`^0 0 (${NUMBER}) (${NUMBER})$`);
const UNPIVOTED = new Set(["part-body", "part-face"]);

// Structural check of a (sanitised) SVG for `build`. Walks the tree with an
// SVGO visitor; no other XML parser. `file` names the pose file; without it the
// viewBox may match the box of any pose (implementation decision). Never throws.
export function checkSvg(text: string, build: AssetBuild, file?: string): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, code: string, message: string): void => {
    issues.push({ path, code, message });
  };
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_SVG_BYTES) add("svg", "svg_size", `The file has ${bytes} bytes; the limit is ${MAX_SVG_BYTES}.`);

  const partCount = new Map<string, number>();
  const expressions: Array<{ name: string; visible: boolean }> = [];
  let viewBox: string | undefined;
  const counters = new Map<string, number>();
  const pathOf = (node: XastElement) => {
    const n = (counters.get(node.name) ?? 0) + 1;
    counters.set(node.name, n);
    const cls = node.attributes.class;
    return cls ? `${node.name}.${cls.split(/\s+/).join(".")}` : `${node.name}[${n}]`;
  };

  const collect: CustomPlugin = {
    name: "collect",
    fn: () => ({
      element: {
        enter(node: XastElement) {
          const path = pathOf(node);
          if (node.name === "svg" && viewBox === undefined) viewBox = node.attributes.viewBox ?? "";
          if (!ELEMENTS.has(node.name)) add(path, "svg_element", `<${node.name}> is not allowed.`);
          for (const [name, value] of Object.entries(node.attributes)) {
            if (name === "id") add(path, "svg_id", `${path} has an id; select parts by class.`);
            else if (!ATTRIBUTES.has(name)) add(path, "svg_attribute", `Attribute "${name}" is not allowed.`);
            if (/url\(/i.test(value)) add(path, "svg_url", `Attribute "${name}" holds a url() value.`);
          }
          const classes = (node.attributes.class ?? "").split(/\s+/).filter(Boolean);
          for (const cls of classes) {
            if (cls.startsWith("part-") && node.name === "g") {
              partCount.set(cls, (partCount.get(cls) ?? 0) + 1);
              if (node.attributes.transform !== undefined) add(path, "svg_part_transform", `${cls} has a transform attribute; the runtime animates part groups.`);
              if (!UNPIVOTED.has(cls) && !PIVOT.test(node.attributes["data-pivot"] ?? "")) add(path, "svg_pivot", `${cls} needs data-pivot="<x> <y>".`);
            }
            if (cls.startsWith("expr-") && node.name === "g") expressions.push({ name: cls.slice(5), visible: node.attributes.display !== "none" });
          }
        },
      },
      text: { enter: (_node, parent) => (inTitle(parent) ? undefined : add("svg", "svg_text", "Text is allowed only inside <title>.")) },
      cdata: { enter: () => add("svg", "svg_text", "CDATA is not allowed.") },
    }),
  };
  try {
    optimize(text, { plugins: [collect] });
  } catch (e) {
    return [{ path: "svg", code: "svg_parse", message: `The file is not well-formed XML: ${(e as Error).message.split("\n")[0]}` }];
  }
  if (!isLayerManifest(build.manifest)) return issues;
  const manifest = build.manifest;

  const poses = manifest.poses.filter((p) => file === undefined || p.file === file);
  const m = VIEWBOX.exec(viewBox ?? "");
  if (!m || !poses.some((p) => Number(m[1]) === p.box.w && Number(m[2]) === p.box.h)) {
    const boxes = poses.map((p) => `0 0 ${p.box.w} ${p.box.h}`).join(" or ");
    add("svg", "svg_viewbox", `viewBox is "${viewBox ?? ""}"; it must be "${boxes}".`);
  }
  const poseIds = new Set(manifest.poses.map((p) => p.id));
  manifest.legal.forEach((pair, i) => {
    if (!poseIds.has(pair.pose)) add(`legal[${i}]`, "svg_legal", `Legal pair names pose "${pair.pose}", which is not declared.`);
    if (!manifest.expressions.includes(pair.expression)) add(`legal[${i}]`, "svg_legal", `Legal pair names expression "${pair.expression}", which is not declared.`);
  });

  // Parts and expression groups belong to a rig; a plain `svg` asset has neither
  // (implementation decision).
  const visible = expressions.filter((e) => e.visible).map((e) => `expr-${e.name}`);
  if (build.renderer === "svg-rig") {
    for (const part of manifest.parts ?? []) {
      const n = partCount.get(part) ?? 0;
      if (n === 0) add(part, "svg_part_missing", `Part ${part} is missing.`);
      if (n > 1) add(part, "svg_part_duplicate", `Part ${part} appears ${n} times.`);
    }
    const count = new Map<string, number>();
    for (const e of expressions) count.set(e.name, (count.get(e.name) ?? 0) + 1);
    for (const e of manifest.expressions) {
      if (!count.has(e)) add(`expr-${e}`, "svg_expression_missing", `Expression group expr-${e} is missing.`);
    }
    for (const [e, n] of count) {
      if (!manifest.expressions.includes(e)) add(`expr-${e}`, "svg_expression_undeclared", `Group expr-${e} is not a declared expression.`);
      if (n > 1) add(`expr-${e}`, "svg_expression_duplicate", `Group expr-${e} appears ${n} times.`);
    }
    if (visible.length !== 1) add("svg", "svg_expression_visible", `${visible.length} expression groups are visible by default (${visible.join(", ")}); exactly one must be.`);
  } else if (visible.length > 1) {
    add("svg", "svg_expression_visible", `${visible.join(", ")} are visible by default; only one may be.`);
  }
  return issues;
}
