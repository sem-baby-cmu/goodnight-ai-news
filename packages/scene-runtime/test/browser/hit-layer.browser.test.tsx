import { userEvent } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { SceneView } from "../../src";
import { clickAt, id, layer, mount, q, scene, settled, sfxTap, shot, stageBox, testResolver, toCss } from "./helpers";

// Hit layer and focus ring in real browsers (#68 Part B, ADR 0017 decisions
// 10 and 16, DESIGN.md 12.3 and 14). Values from the Acceptance rows. A host
// of 800 x 600 CSS px gives k = 0.5 with the stage filling the host.

type Placed = { n: number; ref: string; x: number; y: number; scale?: number; z: number };

async function stage(placed: Placed[], size = { width: 800, height: 600 }) {
  const onSfx = vi.fn();
  const p = scene(
    placed.map((l) => layer(l.n, l.ref, l)),
    placed.map((l) => sfxTap(l.n, `L${l.n}`)),
  );
  const host = mount(<SceneView page={p} assets={testResolver()} mode="play" onSfx={onSfx} />, size);
  await settled(host);
  return { host, onSfx, ran: () => onSfx.mock.calls.map(([name]) => name as string) };
}

describe("hit layer", () => {
  it("PLY-01.S8 a small tappable layer has a hit area of 64 x 64 CSS px", async () => {
    // tall: 60 x 80 units = 30 x 40 CSS px at k 0.5; box (700, 500)-(760, 580).
    const { host, ran } = await stage([{ n: 1, ref: "tall", x: 700, y: 500, z: 1 }]);
    const left = toCss(host, 700, 540);
    await clickAt(host, { x: left.x - 10, y: left.y });
    await vi.waitFor(() => expect(ran()).toEqual(["L1"]));
    await clickAt(host, { x: left.x - 40, y: left.y });
    await new Promise((r) => setTimeout(r, 50));
    expect(ran()).toEqual(["L1"]);

    const margin = q(host, `.sv-margin[data-instance-id="${id(1)}"]`).getBoundingClientRect();
    const centre = toCss(host, 730, 540);
    expect(Math.abs(margin.width - 64)).toBeLessThanOrEqual(1);
    expect(Math.abs(margin.height - 64)).toBeLessThanOrEqual(1);
    expect(Math.abs(margin.left + margin.width / 2 - centre.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(margin.top + margin.height / 2 - centre.y)).toBeLessThanOrEqual(1);
  });

  // B: block at scale 2, box (400, 400)-(600, 600). A: tall, box (610, 500)-(670, 580);
  // its margin reaches 17 CSS px = 34 units left of its box, into B's box.
  async function drawnBoxWins(zA: number, zB: number) {
    const { host, ran } = await stage([
      { n: 1, ref: "block", x: 400, y: 400, scale: 2, z: zB },
      { n: 2, ref: "tall", x: 610, y: 500, z: zA },
    ]);
    // A point in B's drawn box and in A's margin: stage (588, 540).
    await clickAt(host, toCss(host, 588, 540));
    await vi.waitFor(() => expect(ran()).toEqual(["L1"]));
    // A point in A's margin outside B's box: stage (680, 540).
    await clickAt(host, toCss(host, 680, 540));
    await vi.waitFor(() => expect(ran()).toEqual(["L1", "L2"]));
  }

  it("PLY-01.S10 a drawn box wins over the margin of another layer", async () => {
    await drawnBoxWins(5, 1);
  });

  it("B6 hit layer under negative and large z: the drawn box of B still wins", async () => {
    await drawnBoxWins(10000, -5);
  });

  it("PLY-01.S11 the higher layer wins between two margins", async () => {
    // Boxes (600..660) and (720..780) across; their margins overlap at 686..694.
    for (const [z1, z2, winner] of [
      [3, 7, "L2"],
      [7, 3, "L1"],
    ] as const) {
      const { host, ran } = await stage([
        { n: 1, ref: "tall", x: 600, y: 500, z: z1 },
        { n: 2, ref: "tall", x: 720, y: 500, z: z2 },
      ]);
      await clickAt(host, toCss(host, 690, 540));
      await vi.waitFor(() => expect(ran(), `z ${z1} / ${z2}`).toEqual([winner]));
      host.remove();
    }
  });
});

describe("focus ring", () => {
  // Stage 390 CSS px: host 390 x 292.5, k = 0.24375. block box (0, 500)-(100, 600)
  // touches the left stage edge.
  const ringPage = () => scene([layer(1, "block", { x: 0, y: 500, z: 1 })], [sfxTap(1, "L1")]);
  const size = { width: 390, height: 292.5 };

  it("PLY-01.S14 the focus ring of a layer is drawn in the stage overlay", async () => {
    const host = mount(<SceneView page={ringPage()} assets={testResolver()} mode="play" />, size);
    await settled(host);
    await userEvent.tab();
    await vi.waitFor(() => expect(host.querySelectorAll(".sv-focus-ring")).toHaveLength(1));
    const ring = q(host, ".sv-focus-ring");
    expect(ring.closest(".sv-overlay")).not.toBeNull();
    expect(ring.closest(".sv-stage")).toBeNull();

    const s = stageBox(host);
    const r = ring.getBoundingClientRect();
    expect(Math.abs(r.left - s.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(r.right - (s.left + 100 * s.k + 9))).toBeLessThanOrEqual(1);
    // The ring takes no pointer; let elementsFromPoint see it for this check.
    ring.style.pointerEvents = "auto";
    expect(document.elementsFromPoint(r.left + 1, r.top + r.height / 2)).toContain(ring);
    ring.style.pointerEvents = "";
    expect(Math.abs(parseFloat(getComputedStyle(ring).borderTopWidth) * s.k - 3)).toBeLessThanOrEqual(0.25);
    await shot(host, "focus-ring-390");
  });

  it("PLY-01.S14 a pointer click on the layer shows no focus ring", async () => {
    const onSfx = vi.fn();
    const host = mount(<SceneView page={ringPage()} assets={testResolver()} mode="play" onSfx={onSfx} />, size);
    await settled(host);
    await clickAt(host, toCss(host, 50, 550));
    await vi.waitFor(() => expect(onSfx).toHaveBeenCalledTimes(1));
    expect(host.querySelectorAll(".sv-focus-ring")).toHaveLength(0);
  });
});
