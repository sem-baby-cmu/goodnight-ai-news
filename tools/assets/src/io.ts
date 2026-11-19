// File and codec helpers around sharp. The pixel algorithms are in image.ts.
import { join } from "node:path";
import sharp from "sharp";
import type { Raw } from "./image";
import { BOARDS_DIR } from "./paths";

export function boardPath(board: string): string {
  return join(BOARDS_DIR, `${board}.png`);
}

// Decodes a board to raw RGB.
export async function readBoard(board: string): Promise<Raw> {
  const { data, info } = await sharp(boardPath(board)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height, channels: 3 };
}

export type RgbaImage = { data: Uint8Array; width: number; height: number };

// Lossy colour, lossless alpha (alphaQuality 100). Deterministic for one sharp version.
export async function encodeWebp(img: RgbaImage): Promise<Buffer> {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
}

export async function decodeRgba(file: string | Buffer): Promise<RgbaImage> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}
