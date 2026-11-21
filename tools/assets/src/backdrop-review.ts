// The backdrop review sheet (#67, ADR 0016 section 1, design "8. Asset
// pipeline"): one sheet per variant with the slot envelopes of all templates
// drawn over it. A slot envelope is the union of the boxes of every active
// asset of the slot's kind, placed in that slot by the layout rule at f = 100
// (`slotAt`: the box fits the slot height and width, centred on footX), with
// and without flip.
// Build output in <out>/review/; never tracked. The board review sheet of the
// cut step is `review.ts`.
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { isLayerManifest, type LayoutTemplate } from "@storybook/dsl";
import { layerBoxes, slotAt, type StageRect, TEMPLATES } from "@storybook/layout";
import sharp from "sharp";
import { templatesDigest } from "./approval";
import type { AssetBuild } from "./build";
import { label, loadLocalBuilds } from "./publish";

// Frame x of stage x 0: (2400 - 1600) / 2.
export const STAGE_OFFSET_X = 400;
const FRAME = { width: 2400, height: 1200 };

type LayerKind = "character" | "prop" | "scenery";
// Boxes in frame units: stage x + STAGE_OFFSET_X, y unchanged.
export type SlotEnvelope = { template: string; slot: string; accepts: LayerKind; boxes: StageRect[] };

const COLOURS: Record<LayerKind, string> = { character: "#ff00ff", prop: "#00a0ff", scenery: "#ff8a00" };
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The envelope of every slot of `templates`, in order. Active builds are the
// highest local version per key. A pose is in a slot's envelope only if the
// slot can hold it (R35): the slot's `poses` if it lists any, otherwise every
// pose that no slot lists. Throws on a slot with no box (no silent gap).
export function slotEnvelopes(builds: AssetBuild[], templates: LayoutTemplate[]): SlotEnvelope[] {
  const active = new Map<string, AssetBuild>();
  for (const b of builds) {
    if (!isLayerManifest(b.manifest)) continue;
    const current = active.get(b.key);
    if (!current || b.version > current.version) active.set(b.key, b);
  }
  const reserved = new Set(templates.flatMap((t) => t.slots.flatMap((s) => s.poses ?? [])));
  const envelopes: SlotEnvelope[] = [];
  for (const template of templates) {
    for (const slot of template.slots) {
      const boxes = new Map<string, StageRect>();
      for (const b of active.values()) {
        if (b.kind !== slot.accepts || !isLayerManifest(b.manifest)) continue;
        for (const e of b.manifest.poses) {
          if (slot.poses ? !slot.poses.includes(e.id) : reserved.has(e.id)) continue;
          for (const flip of [false, true]) {
            const box = layerBoxes(e, slotAt(slot, e, flip), flip).box;
            const frame = { ...box, x: box.x + STAGE_OFFSET_X };
            boxes.set(`${frame.x} ${frame.y} ${frame.w} ${frame.h}`, frame);
          }
        }
      }
      const sorted = [...boxes.values()].sort((p, q) => p.x - q.x || p.y - q.y || p.w - q.w || p.h - q.h);
      envelopes.push({ template: template.id, slot: slot.id, accepts: slot.accepts, boxes: sorted });
    }
  }
  const kinds = new Set([...active.values()].map((b) => b.kind));
  for (const kind of new Set(envelopes.map((e) => e.accepts))) {
    if (!kinds.has(kind)) throw new Error(`no local ${kind} build; run cut and measure first`);
  }
  const empty = envelopes.find((e) => e.boxes.length === 0);
  if (empty) throw new Error(`no active ${empty.accepts} has a pose for ${empty.template}/${empty.slot}`);
  return envelopes;
}

function overlaySvg(envelopes: SlotEnvelope[], legend: string): string {
  const kinds: LayerKind[] = ["character", "prop", "scenery"];
  const paths = kinds
    .map((kind) => {
      const d = envelopes
        .filter((e) => e.accepts === kind)
        .flatMap((e) => e.boxes)
        .map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}z`)
        .join("");
      return d ? `<path d="${d}" fill="${COLOURS[kind]}" fill-opacity="0.3"/>` : "";
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME.width}" height="${FRAME.height}" viewBox="0 0 ${FRAME.width} ${FRAME.height}">` +
    paths +
    `<rect x="400" y="0" width="1600" height="1200" fill="none" stroke="#000" stroke-width="4"/>` +
    `<path d="M0 740H2400" stroke="#ff0000" stroke-width="4" stroke-dasharray="24 12"/>` +
    `<text x="420" y="40" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#000" stroke="#fff" stroke-width="4" paint-order="stroke">${esc(legend)}</text>` +
    `</svg>`
  );
}

// Writes <outDir>/review/<key>-v<n>-<sky>.png per variant, the envelopes JSON,
// and the HTML page. Returns the written paths.
export async function writeBackdropReview(opts: { key: string; version: number; outDir: string }): Promise<string[]> {
  const { key, version, outDir } = opts;
  const name = label({ key, version });
  const builds = loadLocalBuilds({ outDir });
  const target = builds.find((b) => b.key === key && b.version === version);
  if (!target || target.kind !== "backdrop" || target.manifest.kind !== "backdrop") throw new Error(`${name} is not a backdrop build`);
  const envelopes = slotEnvelopes(builds, TEMPLATES);
  const dir = join(outDir, "review");
  mkdirSync(dir, { recursive: true });
  const base = `${key}-v${version}`;
  const written: string[] = [];
  for (const { sky, file } of target.manifest.variants) {
    const src = join(outDir, key, `v${version}`, file);
    const image = extname(file) === ".svg" ? sharp(src, { density: 72 }) : sharp(src);
    const { width, height } = await image.metadata();
    if (width !== FRAME.width || height !== FRAME.height) throw new Error(`${name} ${sky}: the variant is ${width} x ${height}; expected ${FRAME.width} x ${FRAME.height}`);
    const legend = `${key} v${version} ${sky}: envelopes of ${TEMPLATES.length} templates (magenta character, blue prop, orange scenery); red line y 740 = ground band`;
    const out = join(dir, `${base}-${sky}.png`);
    await image.composite([{ input: Buffer.from(overlaySvg(envelopes, legend)), top: 0, left: 0 }]).png().toFile(out);
    written.push(out);
  }
  const templates = templatesDigest();
  const json = join(dir, `${base}-envelopes.json`);
  writeFileSync(json, `${JSON.stringify({ key, version, templates, files: target.files, envelopes }, null, 2)}\n`);
  written.push(json);
  const figures = target.manifest.variants
    .map(({ sky }) => `<figure><img src="${esc(`${base}-${sky}.png`)}" width="1200" alt="${esc(`${key} v${version} ${sky}`)}"><figcaption>${esc(sky)}</figcaption></figure>`)
    .join("\n");
  const digests = Object.entries(target.files)
    .map(([file, digest]) => `<li><code>${esc(file)}</code> ${esc(digest)}</li>`)
    .join("\n");
  const html = [
    `<!doctype html>`,
    `<html lang="en"><head><meta charset="utf-8"><title>${esc(`${key} v${version} backdrop review`)}</title></head><body>`,
    `<h1>${esc(`${key} v${version} backdrop review`)}</h1>`,
    figures,
    `<p>Template digest: <code>${esc(templates)}</code></p>`,
    `<ul>\n${digests}\n</ul>`,
    `<p>After you looked at every sheet, approve with:</p>`,
    `<pre>${esc(`pnpm --filter @storybook/assets-tools run cli approve ${key} --version ${version}`)}</pre>`,
    `</body></html>`,
    ``,
  ].join("\n");
  const page = join(dir, `${base}.html`);
  writeFileSync(page, html);
  written.push(page);
  return written;
}
