// Sanitise step and structural check for SVG assets (design "8. Asset pipeline", SVG step).
// #21 imports `sanitizeSvg` and `checkSvg` and refuses a file where
// `sanitizeSvg(text) !== text`, so the sanitised output must be a fixed point.
import type { Issue } from "@storybook/dsl";
import { type Config, type CustomPlugin, optimize, type XastElement, type XastParent } from "svgo";
import type { AssetBuild } from "./build";

export const MAX_SVG_BYTES = 20_480;

// A reference is local when it points into the same file: `#id` or `url(#id)`.
const isLocalHref = (value: string) => value.trim().startsWith("#");
const URL_VALUE = /url\(\s*['"]?([^'")]*)/gi;
const hasExternalUrl = (value: string) => [...value.matchAll(URL_VALUE)].some(([, target]) => !isLocalHref(target ?? ""));

// Removes active content and every external reference (planner rule for #12,
// on top of AGENTS.md section 3): <script>, <foreignObject> and <image> always;
// <use> unless its href is local; any href or xlink:href that is not local; any
// attribute with a `javascript:` value or a non-local `url(...)`.
// Local references (`#…`, `url(#…)`) stay; checkSvg rejects them for a rig.
const removeExternalReferences: CustomPlugin = {
  name: "removeExternalReferences",
  fn: () => ({
    element: {
      enter(node: XastElement, parent: XastParent) {
        const href = node.attributes.href ?? node.attributes["xlink:href"];
        const drop =
          node.name === "script" ||
          node.name === "foreignObject" ||
          node.name === "image" ||
          (node.name === "use" && (href === undefined || !isLocalHref(href)));
        if (drop) {
          parent.children = parent.children.filter((child) => child !== node);
          return;
        }
        for (const [name, value] of Object.entries(node.attributes)) {
          const isHref = name === "href" || name === "xlink:href";
          if ((isHref && !isLocalHref(value)) || /javascript:/i.test(value) || hasExternalUrl(value)) delete node.attributes[name];
        }
      },
    },
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
const NUMBER = String.raw`-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?`;
const PIVOT = new RegExp(`^\\s*${NUMBER}[\\s,]+${NUMBER}\\s*$`, "i");
const UNPIVOTED = new Set(["part-body", "part-face"]);

// Structural check of a (sanitised) SVG for `build`. Walks the tree with an
// SVGO visitor; no other XML parser.
export function checkSvg(text: string, build: AssetBuild): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, code: string, message: string) => issues.push({ path, code, message });
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_SVG_BYTES) add("svg", "svg_size", `The file has ${bytes} bytes; the limit is ${MAX_SVG_BYTES}.`);

  const partCount = new Map<string, number>();
  const expressions = new Map<string, { visible: boolean }>();
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
            if (cls.startsWith("expr-") && node.name === "g") expressions.set(cls.slice(5), { visible: node.attributes.display !== "none" });
          }
        },
      },
    }),
  };
  optimize(text, { plugins: [collect] });

  // Parts and expression groups belong to a rig; a plain `svg` asset has neither
  // (implementation decision).
  if (build.renderer === "svg-rig" && build.manifest.kind !== "sfx") {
    for (const part of build.manifest.parts ?? []) {
      const n = partCount.get(part) ?? 0;
      if (n === 0) add(part, "svg_part_missing", `Part ${part} is missing.`);
      if (n > 1) add(part, "svg_part_duplicate", `Part ${part} appears ${n} times.`);
    }
    for (const e of build.manifest.expressions) {
      if (!expressions.has(e)) add(`expr-${e}`, "svg_expression_missing", `Expression group expr-${e} is missing.`);
    }
  }
  const visible = [...expressions].filter(([, v]) => v.visible).map(([e]) => `expr-${e}`);
  if (visible.length > 1) add("svg", "svg_expression_visible", `${visible.join(", ")} are visible by default; only one may be.`);
  return issues;
}
