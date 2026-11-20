// The frame sizes of the book screens (DESIGN.md 12.2 and 12.3). Pure
// functions of the viewport in CSS px; no DOM.

export type LayoutName = "wide" | "narrow" | "short";
export type NarrationSize = { px: number; lh: number };

// Test in this order (DESIGN.md 12.3, "Layouts").
export function layoutFor(w: number, h: number): LayoutName {
  if (w >= 900 && h >= 600) return "wide";
  if ((w >= 640 && h < 600) || h < 365) return "short";
  return "narrow";
}

// Narration size of each layout, weight 600. Narrow steps down to
// NARROW_STEP when the picture gets small.
export const NARRATION: Record<LayoutName, NarrationSize> = {
  wide: { px: 28, lh: 1.45 },
  narrow: { px: 22, lh: 1.45 },
  short: { px: 18, lh: 1.4 },
};
export const NARROW_STEP: NarrationSize = { px: 18, lh: 1.4 };

// Narrow uses NARROW_STEP when the picture area is lower than this.
export const SMALL_PICTURE = 200;

// The side parts: the Wide gutters and the Short rails.
export const GUTTER = 96;
export const RAIL = 88;
// The Narrow top bar and control row (P22-9).
export const BAR = 84;

export function textWidth(layout: LayoutName, w: number): number {
  if (layout === "wide") return Math.min(w - 2 * GUTTER - 64, 760);
  if (layout === "narrow") return w - 32;
  return w - 2 * RAIL - 24;
}

export function lowestPanel(layout: LayoutName, w: number): number {
  if (layout === "wide") return 232;
  if (layout === "narrow") return 197;
  return w < 640 ? 186 : 112;
}

// The 12 px torn edge, the padding, and the lines; at least the lowest panel.
export function panelHeight(layout: LayoutName, w: number, lines: number, size: NarrationSize): number {
  const text = lines * size.px * size.lh;
  const padding = layout === "wide" ? 20 : layout === "narrow" ? 16 : 12;
  return Math.max(12 + padding + text + padding, lowestPanel(layout, w));
}

export function frameHeights(layout: LayoutName): { top: number; bottom: number } {
  return layout === "narrow" ? { top: BAR, bottom: BAR } : { top: 0, bottom: 0 };
}

// The space that is left for the picture. It can be under 64 px (or
// negative) on a viewport that the Small screen state will take (#91).
export function pictureArea(layout: LayoutName, w: number, h: number, panel: number): { w: number; h: number } {
  if (layout === "wide") return { w: w - 2 * GUTTER, h: h - panel };
  if (layout === "narrow") return { w, h: h - BAR - BAR - panel };
  return { w: w - 2 * RAIL, h: h - panel };
}
