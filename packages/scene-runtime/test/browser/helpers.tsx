// Shared helpers of the browser tests (#68, D68-1). Real layout, real events:
// no act(), no stubs. React renders with flushSync and the tests wait for the
// DOM with vi.waitFor.
import type { PageScene, PoseEntry } from "@storybook/dsl";
import type { CSSProperties, ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { page as pageOf, server, userEvent } from "vitest/browser";
import { afterEach, vi } from "vitest";
import type { AssetResolver, ResolvedAsset } from "../../src/types";

// Real browser scheduling; act() is not used here.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
document.body.style.margin = "0";

export const ENGINE = server.browser;

const NS = `xmlns="http://www.w3.org/2000/svg"`;

// The test backdrop: 2400 x 1200 units, a solid colour in the bleed and
// another one on the stage, so a screenshot shows the crop.
export const BLEED_FILL = "#C2367A";
export const STAGE_FILL = "#9FD3A8";
const BACKDROP = `<svg ${NS} viewBox="0 0 2400 1200"><rect width="2400" height="1200" fill="${BLEED_FILL}"/><rect x="400" width="1600" height="1200" fill="${STAGE_FILL}"/></svg>`;

// A layer asset whose drawn box is its whole file: foot (0, 0), box (0, 0, w, h).
function rect(w: number, h: number, fill: string) {
  return `<svg ${NS} viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`;
}

type TestAsset = ResolvedAsset & { files: Record<string, string> };

function prop(renderer: "svg" | "webp", file: string, w: number, h: number): ResolvedAsset {
  const pose: PoseEntry = { id: "default", file, foot: { x: 0, y: 0 }, box: { x: 0, y: 0, w, h } };
  return {
    renderer,
    manifest: { kind: "prop", poses: [pose], expressions: [], legal: [], flippable: true },
  };
}

const SKIES = ["day", "cloudy", "dusk", "night"] as const;

const ASSETS: Record<string, TestAsset> = {
  testbd: {
    renderer: "svg",
    manifest: {
      kind: "backdrop",
      description: "a test backdrop with a solid bleed",
      size: { width: 2400, height: 1200 },
      variants: SKIES.map((sky) => ({ sky, file: `${sky}.svg` })),
    },
    files: Object.fromEntries(SKIES.map((sky) => [`${sky}.svg`, BACKDROP])),
  },
  // 100 x 100 units at scale 1.
  block: { ...prop("svg", "block.svg", 100, 100), files: { "block.svg": rect(100, 100, "#3A6EA5") } },
  // 60 x 80 units at scale 1.
  tall: { ...prop("svg", "tall.svg", 60, 80), files: { "tall.svg": rect(60, 80, "#E2AE4A") } },
  // WebP layer and backdrop for B7; their URLs come from `urls`.
  pic: { ...prop("webp", "pic.webp", 100, 100), files: {} },
  pond: {
    renderer: "webp",
    manifest: {
      kind: "backdrop",
      description: "a webp test backdrop",
      size: { width: 2400, height: 1200 },
      variants: SKIES.map((sky) => ({ sky, file: `${sky}.webp` })),
    },
    files: {},
  },
};

// `urls` overrides the URL of `ref/file` (B7 blob URLs).
export function testResolver(urls: Record<string, string> = {}): AssetResolver {
  return {
    get(ref) {
      const asset = ASSETS[ref];
      return asset ? { renderer: asset.renderer, manifest: asset.manifest } : undefined;
    },
    url: (ref, file) => urls[`${ref}/${file}`] ?? `https://cdn.test/${ref}/${file}`,
    svgText: async (ref, file) => {
      const text = ASSETS[ref]?.files[file];
      if (text === undefined) throw new Error(`no file ${ref}/${file}`);
      return text;
    },
  };
}

export type Layer = PageScene["layers"][number];
export type Interaction = PageScene["interactions"][number];

export function id(n: number): string {
  return `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;
}

export function layer(n: number, ref: string, at: { x: number; y: number; scale?: number; z?: number }): Layer {
  return {
    instanceId: id(n),
    kind: "prop",
    ref,
    slot: `slot-${n}`,
    at: { x: at.x, y: at.y, scale: at.scale ?? 1, z: at.z ?? n },
  };
}

export function scene(layers: Layer[], interactions: Interaction[] = [], backdrop = "testbd"): PageScene {
  return { templateId: "t-1", backdrop, sky: "night", layers, animations: [], interactions };
}

// A tap on layer `n` that plays the sfx `name` (the spy sees which layer ran).
export const sfxTap = (n: number, name: string): Interaction => ({
  on: { tap: id(n) },
  do: [{ action: "play_sfx", sfx: name }],
});

let mounted: { root: Root; host: HTMLDivElement }[] = [];

afterEach(() => {
  for (const { root, host } of mounted) {
    root.unmount();
    host.remove();
  }
  mounted = [];
});

// Renders `node` into a new host with `style` and returns the host.
export function mount(node: ReactNode, style: CSSProperties = {}): HTMLDivElement {
  const host = document.createElement("div");
  for (const [key, value] of Object.entries({ position: "relative", ...style })) {
    const name = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    host.style.setProperty(name, typeof value === "number" ? `${value}px` : String(value));
  }
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(node));
  mounted.push({ root, host });
  return host;
}

// Renders `node` again into the root of `host` (a new page object, a phase).
export function rerender(host: HTMLDivElement, node: ReactNode): void {
  const entry = mounted.find((m) => m.host === host);
  if (!entry) throw new Error("host is not mounted");
  flushSync(() => entry.root.render(node));
}

export const q = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T => {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`no ${selector}`);
  return el;
};

// Waits until the runtime reported the page (backdrop and layers settled).
export async function settled(host: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    if (q(host, ".sv-viewport").getAttribute("data-settled") !== "true") throw new Error("not settled");
  });
}

// The stage box in CSS px and its scale k.
export function stageBox(host: HTMLElement): DOMRect & { k: number } {
  const r = q(host, ".sv-stage").getBoundingClientRect();
  return Object.assign(r, { k: r.width / 1600 });
}

// A stage point (units) in viewport CSS px.
export function toCss(host: HTMLElement, x: number, y: number): { x: number; y: number } {
  const s = stageBox(host);
  return { x: s.left + x * s.k, y: s.top + y * s.k };
}

// A real pointer click at a viewport point (CSS px) inside `host`.
export async function clickAt(host: HTMLElement, point: { x: number; y: number }): Promise<void> {
  const r = host.getBoundingClientRect();
  await userEvent.click(host, { position: { x: point.x - r.left, y: point.y - r.top } });
}

// Saves a screenshot of `el` to test/browser/__screenshots__ (not tracked).
export async function shot(el: HTMLElement, name: string): Promise<void> {
  await pageOf.screenshot({ element: el, path: `__screenshots__/${ENGINE}-${name}.png` });
}
