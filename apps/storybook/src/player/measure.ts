import { layoutFor, type LayoutName, NARRATION, NARROW_STEP, type NarrationSize, panelHeight, pictureArea, SMALL_PICTURE, textWidth } from "./layout";

// The 40-word page of DESIGN.md 12.3 ("The reference text").
export const REFERENCE_TEXT =
  "The little rabbit carried a basket of berries across the meadow before breakfast. Her friend the hedgehog waited beside the river with a blanket and two yellow cups. Together they watched the morning clouds sail slowly over the green hills.";

// The number of lines that `text` needs at `size` in `width` px, measured in
// a box that is not shown.
export function measureLines(text: string, size: NarrationSize, width: number): number {
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.position = "absolute";
  box.style.visibility = "hidden";
  box.style.left = "-10000px";
  box.style.top = "0";
  box.style.width = `${width}px`;
  box.style.font = `600 ${size.px}px/${size.lh} 'Baloo 2', ui-rounded, system-ui, sans-serif`;
  box.style.setProperty("text-wrap", "pretty");
  box.textContent = text;
  document.body.append(box);
  const lines = Math.round(box.offsetHeight / (size.px * size.lh));
  box.remove();
  return lines;
}

// Waits until the narration font is loaded or has failed. A failure is not
// a Resting trigger: the measurement uses the font that the browser draws.
export function waitForNarrationFont(px: number): Promise<void> {
  return document.fonts.load(`600 ${px}px "Baloo 2"`).then(
    () => undefined,
    () => undefined,
  );
}

export type PanelMetrics = {
  layout: LayoutName;
  w: number;
  h: number;
  size: NarrationSize;
  textWidth: number;
  panel: number;
  picture: { w: number; h: number };
};

// The panel of one viewport: the most lines over `texts` (the reference
// text and, once known, every page text). Narrow measures at 22 px first and
// steps to 18 px when the picture area is under 200 px.
export function measurePanel(w: number, h: number, texts: readonly string[]): PanelMetrics {
  const layout = layoutFor(w, h);
  const at = (size: NarrationSize): PanelMetrics => {
    const width = Math.max(0, textWidth(layout, w));
    const lines = Math.max(...texts.map((t) => measureLines(t, size, width)));
    const panel = panelHeight(layout, w, lines, size);
    const picture = pictureArea(layout, w, h, panel);
    return { layout, w, h, size, textWidth: width, panel, picture: { w: Math.max(0, picture.w), h: Math.max(0, picture.h) } };
  };
  const first = at(NARRATION[layout]);
  if (layout === "narrow" && first.picture.h < SMALL_PICTURE) return at(NARROW_STEP);
  return first;
}
