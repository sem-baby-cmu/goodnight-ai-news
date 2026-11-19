// Second defence for SVG text from storage. The asset pipeline sanitises the
// file before upload (#12, #21); the runtime cleans it again before it
// inserts the node. Nothing here evaluates the text.

const REMOVED = new Set(
  [
    "script",
    "foreignObject",
    "iframe",
    "object",
    "embed",
    "audio",
    "video",
    "animate",
    "set",
    "animateMotion",
    "animateTransform",
  ].map((name) => name.toLowerCase()),
);

const XLINK = "http://www.w3.org/1999/xlink";
// url(...) that does not point at a local fragment.
const EXTERNAL_URL = /url\(\s*(?!['"]?\s*#)/i;
const LOCAL_URL = /url\(\s*(['"]?)\s*#([^'")\s]+)\s*\1\s*\)/g;

export function sanitizeSvg(text: string, idSuffix: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length > 0 || root.localName !== "svg") return null;

  const box = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n)) || box[0] !== 0 || box[1] !== 0) return null;

  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (REMOVED.has(el.localName.toLowerCase())) el.remove();
  }

  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  const ids = new Map<string, string>();
  for (const el of elements) {
    const id = el.getAttribute("id");
    if (id !== null) ids.set(id, `${id}--${idSuffix}`);
  }
  const scope = (id: string) => ids.get(id) ?? id;

  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on")) {
        el.removeAttributeNode(attr);
      } else if (attr.localName === "href" && (attr.namespaceURI === null || attr.namespaceURI === XLINK)) {
        const v = value.trim();
        if (v.startsWith("#")) attr.value = `#${scope(v.slice(1))}`;
        else el.removeAttributeNode(attr);
      } else if (name === "id") {
        attr.value = scope(value);
      } else if (name === "style" && EXTERNAL_URL.test(value)) {
        el.removeAttributeNode(attr);
      } else if (value.includes("url(")) {
        attr.value = value.replace(LOCAL_URL, (_m, _q, id: string) => `url(#${scope(id)})`);
      }
    }
  }

  root.setAttribute("width", String(box[2]));
  root.setAttribute("height", String(box[3]));
  return root as unknown as SVGSVGElement;
}
