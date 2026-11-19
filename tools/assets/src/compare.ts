// Fidelity check of a rigged SVG against the board cut-out (WebP) it replaces.
import { readFileSync } from "node:fs";
import sharp from "sharp";

const OPAQUE = 128;

async function alphaMask(input: Buffer, density: number | undefined, width: number, height: number): Promise<Uint8Array> {
  const img = density === undefined ? sharp(input) : sharp(input, { density });
  const { data } = await img.resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3]! >= OPAQUE ? 1 : 0;
  return mask;
}

// Intersection over union of the opaque pixels (alpha >= 128). The SVG is
// rendered at 72 dpi, so 1 user unit = 1 pixel = 1 board pixel.
export async function silhouetteIoU(svgPath: string, webpPath: string): Promise<number> {
  const meta = await sharp(webpPath).metadata();
  const width = meta.width!;
  const height = meta.height!;
  const ref = await alphaMask(readFileSync(webpPath), undefined, width, height);
  const svg = await alphaMask(readFileSync(svgPath), 72, width, height);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < ref.length; i++) {
    if (ref[i]! & svg[i]!) inter++;
    if (ref[i]! | svg[i]!) union++;
  }
  return union === 0 ? 0 : inter / union;
}

// The board cut-out and the rendered SVG side by side on #f7f1e3, at `scale`.
export async function writeCompareSheet(opts: { svgPath: string; webpPath: string; out: string; scale?: number }): Promise<void> {
  const k = opts.scale ?? 2;
  const meta = await sharp(opts.webpPath).metadata();
  const w = meta.width! * k;
  const h = meta.height! * k;
  const gap = 16 * k;
  const left = await sharp(opts.webpPath).resize(w, h).png().toBuffer();
  const right = await sharp(readFileSync(opts.svgPath), { density: 72 * k }).resize(w, h, { fit: "fill" }).png().toBuffer();
  await sharp({ create: { width: w * 2 + gap * 3, height: h + gap * 2, channels: 3, background: "#f7f1e3" } })
    .composite([
      { input: left, left: gap, top: gap },
      { input: right, left: w + gap * 2, top: gap },
    ])
    .png()
    .toFile(opts.out);
}
