import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

// Engine facts that the runtime relies on (#68). Each runs in Chromium and
// WebKit. The expected values come from the issue section, not the engines.

// Tell React that act() is in use here (no test/setup.ts in browser mode).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(node: ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("engine probe", () => {
  it("an image whose blob cannot be decoded fires error, not load", async () => {
    const blob = new Blob(["not an image"], { type: "image/webp" });
    const url = URL.createObjectURL(blob);
    const img = document.createElement("img");
    const first = new Promise<string>((resolve) => {
      img.addEventListener("load", () => resolve("load"), { once: true });
      img.addEventListener("error", () => resolve("error"), { once: true });
      setTimeout(() => resolve("timeout: neither load nor error in 5 s"), 5000);
    });
    document.body.append(img);
    img.src = url;
    try {
      expect(await first).toBe("error");
    } finally {
      img.remove();
      URL.revokeObjectURL(url);
    }
  });

  const box = {
    width: "100%",
    height: "100%",
    aspectRatio: "4 / 3",
  } as const;

  it("a 4:3 box fills a parent with a definite height", () => {
    const el = mount(
      <div style={{ width: 600, height: 300 }}>
        <div data-testid="box" style={box} />
      </div>,
    );
    const r = el.querySelector("[data-testid=box]")!.getBoundingClientRect();
    expect([r.width, r.height]).toEqual([600, 300]);
  });

  it("a 4:3 box takes its height from the ratio in an auto-height parent", () => {
    const el = mount(
      <div style={{ width: 600 }}>
        <div data-testid="box" style={box} />
      </div>,
    );
    const r = el.querySelector("[data-testid=box]")!.getBoundingClientRect();
    expect([r.width, r.height]).toEqual([600, 450]);
  });
});
