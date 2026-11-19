// Synthetic RGB boards for the pixel tests. Every function returns a fresh buffer.
import type { Raw, RGB } from "../src/image";

export const PAPER: RGB = [250, 246, 240];

export function blank(width: number, height: number, bg: RGB = PAPER): Raw {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) data.set(bg, i * 3);
  return { data, width, height, channels: 3 };
}

export function disk(raw: Raw, cx: number, cy: number, r: number, colour: RGB): Raw {
  for (let y = 0; y < raw.height; y++) {
    for (let x = 0; x < raw.width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) raw.data.set(colour, (y * raw.width + x) * 3);
    }
  }
  return raw;
}

export function rect(raw: Raw, x0: number, y0: number, w: number, h: number, colour: RGB): Raw {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) raw.data.set(colour, (y * raw.width + x) * 3);
  }
  return raw;
}

// Alpha of an RGBA image at (x, y).
export function alphaAt(img: { data: Uint8Array; width: number }, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3]!;
}
