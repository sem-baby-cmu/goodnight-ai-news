import { describe, expect, it, vi } from "vitest";
import { SceneView } from "../../src";
import type { AssetsSettledReport } from "../../src/types";
import { clickAt, id, layer, mount, q, scene, settled, sfxTap, shot, stageBox, testResolver, toCss } from "./helpers";

// Frame, fit, paint order, sizing and image loading in real browsers (#68
// B1-B5, B7, and the screenshots of "UI constraints"). Values from the
// Acceptance rows and DESIGN.md 12.3.

const bubbleTap = (n: number, text: string) => ({
  on: { tap: id(n) },
  do: [{ action: "show_bubble" as const, target: id(n), text }],
});

// The pointer does not reach the frame's children (invariant 6). These
// checks make the backdrop and its child hit-testable to see what is drawn.
function hitTestBackdrop(host: HTMLElement): void {
  const backdrop = q(host, ".sv-backdrop");
  backdrop.style.pointerEvents = "auto";
  for (const child of Array.from(backdrop.children) as HTMLElement[]) child.style.pointerEvents = "auto";
}

describe("frame", () => {
  it("B1 clip: a layer box past x = 1600 is not drawn in the bleed", async () => {
    // block at scale 3: box (1500, 400)-(1800, 700), tappable.
    const host = mount(
      <SceneView page={scene([layer(1, "block", { x: 1500, y: 400, scale: 3 })], [sfxTap(1, "L1")])} assets={testResolver()} mode="play" />,
      { width: 1002, height: 578 },
    );
    await settled(host);
    const inStage = toCss(host, 1550, 550);
    const inBleed = toCss(host, 1700, 550);
    expect(inBleed.x).toBeLessThan(host.getBoundingClientRect().right);
    // Control: inside the stage, the layer is hit.
    expect(document.elementFromPoint(inStage.x, inStage.y)?.closest(".sv-layer")).not.toBeNull();
    expect(document.elementFromPoint(inBleed.x, inBleed.y)?.closest(".sv-layer") ?? null).toBeNull();
  });

  it("B2 fit: contain in the three picture areas, cover in a shelf box", async () => {
    const cases = [
      { w: 1002, h: 578, stage: [770.7, 578] },
      { w: 832, h: 394, stage: [525.3, 394] },
      { w: 390, h: 377, stage: [390, 292.5] },
    ] as const;
    for (const c of cases) {
      const host = mount(<SceneView page={scene([])} assets={testResolver()} mode="play" />, { width: c.w, height: c.h });
      await settled(host);
      const s = stageBox(host);
      const h = host.getBoundingClientRect();
      expect(Math.abs(s.width - c.stage[0]), `${c.w} x ${c.h}`).toBeLessThanOrEqual(1);
      expect(Math.abs(s.height - c.stage[1]), `${c.w} x ${c.h}`).toBeLessThanOrEqual(1);
      expect(Math.abs(s.left + s.width / 2 - (h.left + h.width / 2))).toBeLessThanOrEqual(1);
      expect(Math.abs(s.top + s.height / 2 - (h.top + h.height / 2))).toBeLessThanOrEqual(1);
      if (c.w === 832) {
        hitTestBackdrop(host);
        // The frame is 788 px wide: 22 px of paper on each side.
        expect(document.elementFromPoint(h.left + 5, h.top + h.height / 2)).toBe(q(host, ".sv-viewport"));
      }
      host.remove();
    }

    const host = mount(<SceneView page={scene([])} assets={testResolver()} mode="still" fit="cover" />, {
      width: 151,
      height: 148,
    });
    await settled(host);
    const s = stageBox(host);
    const h = host.getBoundingClientRect();
    expect(Math.abs(s.width - 197.3)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.height - 148)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.left + s.width / 2 - (h.left + h.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(s.top + s.height / 2 - (h.top + h.height / 2))).toBeLessThanOrEqual(1);
    hitTestBackdrop(host);
    const viewport = q(host, ".sv-viewport");
    for (const [x, y] of [
      [h.left + 1, h.top + 1],
      [h.right - 1, h.top + 1],
      [h.left + 1, h.bottom - 1],
      [h.right - 1, h.bottom - 1],
    ] as const) {
      expect(document.elementFromPoint(x, y), `corner ${x}, ${y}`).not.toBe(viewport);
    }
    await shot(host, "still-cover-151x148");
  });

  it("B3 paint order: bubble, overlay, paper, layer, backdrop, whatever the layer z", async () => {
    for (const z of [1, 10000, -5]) {
      // Layer 2 covers stage (300, 300)-(1000, 1000); a tap on layer 1 shows a
      // bubble above layer 1, inside layer 2's box.
      const p = scene(
        [layer(1, "tall", { x: 800, y: 1000, z: 2 }), layer(2, "block", { x: 300, y: 300, scale: 7, z })],
        [bubbleTap(1, "Hi"), sfxTap(2, "L2")],
      );
      const host = mount(
        <SceneView page={p} assets={testResolver()} mode="play" textureUrl="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />,
        { width: 800, height: 600 },
      );
      await settled(host);
      await clickAt(host, toCss(host, 830, 1040));
      await vi.waitFor(() => q(host, ".sv-bubble"));
      const bubble = q(host, ".sv-bubble");
      const overlay = q(host, ".sv-overlay");
      const paper = q(host, ".sv-paper");
      const layer2 = q(host, `.sv-layer[data-instance-id="${id(2)}"]`);
      for (const el of [bubble, overlay, paper]) el.style.pointerEvents = "auto";
      hitTestBackdrop(host);
      const backdropChild = q(host, ".sv-backdrop").firstElementChild;
      const b = bubble.getBoundingClientRect();
      const stack = document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const order = [
        stack.indexOf(bubble),
        stack.indexOf(overlay),
        stack.indexOf(paper),
        stack.findIndex((el) => el !== layer2 && layer2.contains(el)),
        stack.indexOf(backdropChild as Element),
      ];
      expect(order.every((i) => i >= 0), `z ${z}: ${order.join(", ")}`).toBe(true);
      expect([...order].sort((a, c) => a - c), `z ${z}`).toEqual(order);
      host.remove();
    }
  });

  it("B4 sizing: a definite parent, an auto-height parent, and edit mode", async () => {
    const view = (mode: "play" | "edit") => <SceneView page={scene([])} assets={testResolver()} mode={mode} />;
    const size = (host: HTMLElement) => {
      const r = q(host, ".sv-viewport").getBoundingClientRect();
      return [r.width, r.height];
    };
    expect(size(mount(view("play"), { width: 600, height: 300 }))).toEqual([600, 300]);
    expect(size(mount(view("play"), { width: 600 }))).toEqual([600, 450]);
    expect(size(mount(view("edit"), { width: 600, height: 300 }))).toEqual([600, 450]);
  });

  it("B5 an ancestor transform does not change the frame transform", async () => {
    const p = scene([layer(1, "block", { x: 700, y: 500 })]);
    const plain = mount(<SceneView page={p} assets={testResolver()} mode="play" />, { width: 800, height: 600 });
    const turned = mount(<SceneView page={p} assets={testResolver()} mode="play" />, {
      width: 800,
      height: 600,
      transform: "rotateY(-60deg)",
    });
    await settled(plain);
    await settled(turned);
    const transform = (host: HTMLElement) => q(host, ".sv-frame").style.transform;
    expect(transform(plain)).toMatch(/^scale\(/);
    expect(transform(turned)).toBe(transform(plain));
  });

  it("B7 a 200 response that cannot be decoded is a reported failure", async () => {
    const bytes = () => URL.createObjectURL(new Blob(["not an image"], { type: "image/webp" }));
    const urls = { "pic/pic.webp": bytes(), "pond/night.webp": bytes() };
    let report: AssetsSettledReport | null = null;
    mount(
      <SceneView
        page={scene([layer(1, "pic", { x: 700, y: 500 })], [], "pond")}
        assets={testResolver(urls)}
        mode="play"
        onAssetsSettled={(r) => (report = r)}
      />,
      { width: 800, height: 600 },
    );
    await vi.waitFor(() => expect(report).not.toBeNull(), { timeout: 5000 });
    const failed = (report as AssetsSettledReport | null)?.failed ?? [];
    expect([...failed].sort((a, b) => (a.key < b.key ? -1 : 1))).toEqual(
      [
        { key: id(1), ref: "pic", url: urls["pic/pic.webp"], reason: "could not be loaded" },
        { key: "backdrop", ref: "pond", url: urls["pond/night.webp"], reason: "could not be loaded" },
      ].sort((a, b) => (a.key < b.key ? -1 : 1)),
    );
    for (const url of Object.values(urls)) URL.revokeObjectURL(url);
  });
});

describe("screenshots (UI constraints)", () => {
  it("a test backdrop and a bubble at the three picture areas, and edit mode at 800 px", async () => {
    const p = scene([layer(1, "block", { x: 700, y: 700, scale: 2 })], [bubbleTap(1, "Good night, moon")]);
    for (const [w, h] of [
      [1002, 578],
      [832, 394],
      [390, 377],
    ] as const) {
      const host = mount(<SceneView page={p} assets={testResolver()} mode="play" />, { width: w, height: h });
      await settled(host);
      await clickAt(host, toCss(host, 800, 800));
      await vi.waitFor(() => q(host, ".sv-bubble"));
      await shot(host, `picture-${w}x${h}`);
      host.remove();
    }
    const edit = mount(<SceneView page={p} assets={testResolver()} mode="edit" />, { width: 800 });
    await settled(edit);
    await shot(edit, "edit-800");
  });
});
