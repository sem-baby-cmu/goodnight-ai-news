import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// The test texture for the S1 spike (issue #15, implementation decision R28):
// 1600 x 1200 grey noise, values 200 to 255, seeded, WebP quality 80. The cost
// of a multiply blend does not depend on the image, so this measures the same
// frame time as a real paper texture. The real texture belongs to #31.
const WIDTH = 1600;
const HEIGHT = 1200;
const SEED = 15;

// mulberry32: a small seeded generator, so the file is the same on every run.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const outDir = fileURLToPath(new URL("../../../tools/assets/out/spike/", import.meta.url));
const random = mulberry32(SEED);
const pixels = Buffer.alloc(WIDTH * HEIGHT);
for (let i = 0; i < pixels.length; i++) pixels[i] = 200 + Math.floor(random() * 56);
mkdirSync(outDir, { recursive: true });
await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } })
  .webp({ quality: 80 })
  .toFile(`${outDir}paper-test.webp`);
console.info(`wrote ${outDir}paper-test.webp`);
