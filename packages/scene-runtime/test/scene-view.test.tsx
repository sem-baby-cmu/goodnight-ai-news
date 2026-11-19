import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeSvg } from "../src/sanitizeSvg";
import { SceneView } from "../src/SceneView";
import { SKY_COLORS } from "../src/sky";
import type { SceneViewProps } from "../src/types";
import { ASSETS, type Animation, type Interaction, SVG_TEXT, id, layer, makeResolver, page } from "./fixtures";
import { type AnimateCall, animateCalls, setReducedMotion } from "./setup";

// Expected values come from #14 "Implementation refinement" (invariants and
// Exact changes) and design "5. Scene runtime".

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  animateCalls.length = 0;
  setReducedMotion(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// jsdom never loads an image. Review item 6 starts `enter` animations only
// after the asset is ready, so the tests fire `load` on each asset image once.
const loadedImages = new WeakSet<HTMLImageElement>();
function loadImages(): void {
  for (const img of document.querySelectorAll<HTMLImageElement>(".sv-asset img")) {
    if (loadedImages.has(img)) continue;
    loadedImages.add(img);
    fireEvent.load(img);
  }
}

// The resolver returns SVG text in a promise. Let it resolve, let React
// commit the inserted nodes, and load the images.
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {});
    loadImages();
  }
}

type Props = Partial<SceneViewProps> & { page: SceneViewProps["page"] };

function show(props: Props) {
  const { resolver, svgText } = makeResolver();
  const view = render(<SceneView assets={resolver} mode="play" {...props} />);
  const again = (next: Props) => view.rerender(<SceneView assets={resolver} mode="play" {...next} />);
  return { ...view, svgText, resolver, again };
}

// Every url(#x) and href="#x" in `svg` names an id inside the same svg.
function localRefsResolve(svg: SVGSVGElement): boolean {
  for (const el of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) {
      const refs = [...attr.value.matchAll(/url\(\s*['"]?#([^'")\s]+)/gi)].map((m) => m[1] as string);
      if (attr.localName === "href" && attr.value.startsWith("#")) refs.push(attr.value.slice(1));
      for (const ref of refs) {
        if (!Array.from(svg.querySelectorAll("[id]")).some((t) => t.id === ref)) return false;
      }
    }
  }
  return true;
}

function layerEl(n: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.sv-layer[data-instance-id="${id(n)}"]`);
  if (!el) throw new Error(`no layer ${n}`);
  return el;
}

const loopOf = (n: number) => layerEl(n).querySelector(".sv-loop") as HTMLElement;
const onceOf = (n: number) => layerEl(n).querySelector(".sv-once") as HTMLElement;
const assetOf = (n: number) => layerEl(n).querySelector(".sv-asset") as HTMLElement;
const svgOf = (n: number) => assetOf(n).querySelector("svg") as SVGSVGElement;
const partOf = (n: number, name: string) => layerEl(n).querySelector(`.${name}`) as SVGElement;

const callsOn = (el: Element) => animateCalls.filter((c) => c.element === el);
const isLoop = (c: AnimateCall) => c.options?.iterations === Infinity;
const running = (c: AnimateCall) => !c.canceled;

function warnedAbout(instanceId: string): boolean {
  return warn.mock.calls.some((args) => args.map(String).join(" ").includes(instanceId));
}

function exprDisplay(n: number, expression: string): string[] {
  return Array.from(layerEl(n).querySelectorAll<SVGElement>(`.expr-${expression}`)).map((el) => el.style.display);
}

const FLOAT: Animation = { target: id(1), primitive: "float", params: { amplitude: 0.01, period: 4 }, trigger: "loop" };
const BLINK = (n: number): Animation => ({ target: id(n), primitive: "blink", params: { interval: 4 }, trigger: "loop" });
const FADE = (n: number): Animation => ({ target: id(n), primitive: "fade-in", params: { delay: 1.5 }, trigger: "enter" });

function tap(n: number, ...actions: Interaction["do"]): Interaction {
  return { on: { tap: id(n) }, do: actions };
}

describe("SceneView", () => {
  it("places a layer at its foot point", () => {
    show({ page: page([layer(1, "bun", { at: { x: 500, y: 600, scale: 0.5, z: 3 } }), layer(2, "bun", { flip: true })]) });
    expect(layerEl(1).style.transform).toBe("translate(500px, 600px)");
    expect(layerEl(1).style.zIndex).toBe("3");
    expect(assetOf(1).style.transform).toBe("scale(0.5) translate(-50px, -100px)");
    expect(assetOf(2).style.transform).toBe("scale(-0.5, 0.5) translate(-50px, -100px)");
    // One DOM shape per layer (invariant 2).
    expect(layerEl(1).querySelector(":scope > .sv-loop > .sv-once > .sv-asset > img")).not.toBeNull();
  });

  it("renders one layer per layer with at; skips and warns for a layer without at", () => {
    show({ page: page([layer(1, "bun"), layer(2, "tree"), layer(3, "bun", { at: undefined })]) });
    expect(document.querySelectorAll(".sv-layer")).toHaveLength(2);
    expect(document.querySelector(`[data-instance-id="${id(3)}"]`)).toBeNull();
    expect(warnedAbout(id(3))).toBe(true);
  });

  it("webp renders an img with the resolver url", () => {
    show({ page: page([layer(1, "bun", { pose: "stand", expression: "happy" })]) });
    const img = assetOf(1).querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn.test/bun/bun-happy.webp");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("draggable")).toBe("false");
    expect(img.style.maxWidth).toBe("none");
    expect(img.style.display).toBe("block");
  });

  it("svg is inlined after sanitising", async () => {
    const { svgText } = show({ page: page([layer(1, "tree")]) });
    await settle();
    expect(svgText).toHaveBeenCalledWith("tree", "tree.svg");
    const svg = svgOf(1);
    expect(svg).not.toBeNull();
    expect(svg.querySelector(".tree")).not.toBeNull();
    expect(svg.querySelector("script")).toBeNull();
    expect(svg.querySelector(".tree")?.hasAttribute("onclick")).toBe(false);
    expect(svg.getAttribute("width")).toBe("120");
    expect(svg.getAttribute("height")).toBe("240");
    // Review item 5: the id suffix is unique per mount, not the bare instanceId.
    expect(svg.querySelector("linearGradient")?.getAttribute("id")).toMatch(/^leaf--./);
    expect(localRefsResolve(svg)).toBe(true);
  });

  it("two instances of one svg asset have distinct ids", async () => {
    show({ page: page([layer(1, "tree"), layer(2, "tree")]) });
    await settle();
    const a = svgOf(1).querySelector("linearGradient")?.getAttribute("id");
    const b = svgOf(2).querySelector("linearGradient")?.getAttribute("id");
    // Review item 5: the suffix is unique per mount, not the bare instanceId.
    expect(a).toMatch(/^leaf--./);
    expect(b).toMatch(/^leaf--./);
    expect(a).not.toBe(b);
    expect(localRefsResolve(svgOf(1))).toBe(true);
    expect(localRefsResolve(svgOf(2))).toBe(true);
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Extra: invariant 6 lists an unknown ref as a skip-and-warn case.
  it("an unknown ref is skipped and warns", () => {
    show({ page: page([layer(1, "bun"), layer(2, "ghost")]) });
    expect(assetOf(1).querySelector("img")).not.toBeNull();
    expect(document.querySelectorAll("img[src*='ghost'], svg")).toHaveLength(0);
    expect(warnedAbout(id(2))).toBe(true);
  });

  // Extra: Exact change 5 and 7 (stage size, viewport ratio, sky colour).
  it("the stage is 1600 by 1200 units with the sky colour of the page", () => {
    expect(SKY_COLORS).toEqual({ day: "#7EBDE6", cloudy: "#E3ECF6", dusk: "#F3ECDD", night: "#1B2440" });
    show({ page: page([layer(1, "bun")], [], [], "night") });
    const viewport = document.querySelector(".sv-viewport") as HTMLElement;
    const stage = viewport.querySelector(":scope > .sv-stage") as HTMLElement;
    expect(viewport.style.aspectRatio).toBe("4 / 3");
    expect(viewport.style.overflow).toBe("hidden");
    expect(stage.style.width).toBe("1600px");
    expect(stage.style.height).toBe("1200px");
    // #1B2440 as jsdom serialises it.
    expect(stage.style.backgroundColor).toBe("rgb(27, 36, 64)");
  });

  it("PLY-01.S3 starts enter and loop animations on mount on the right elements", async () => {
    const animations: Animation[] = [
      FLOAT,
      BLINK(1),
      { target: id(2), primitive: "sway", params: { angle: 5, period: 4 }, trigger: "loop" },
      FADE(2),
      { target: id(2), primitive: "bounce", params: { height: 0.05, count: 2 }, trigger: "enter" },
    ];
    show({ page: page([layer(1, "pip", { pose: "stand", expression: "happy" }), layer(2, "bun")], animations) });
    await settle();
    expect(animateCalls).toHaveLength(5);
    expect(animateCalls.every(running)).toBe(true);

    const [float] = callsOn(loopOf(1));
    expect(float?.keyframes).toEqual({ translate: ["0px 0px", "0px -12px", "0px 0px"] });
    expect(float?.options).toMatchObject({ duration: 4000, iterations: Infinity });

    const [blink] = callsOn(partOf(1, "part-eyes"));
    expect(blink?.options).toMatchObject({ duration: 4000, iterations: Infinity });
    expect(svgOf(1).contains(blink?.element ?? null)).toBe(true);

    const [sway] = callsOn(loopOf(2));
    expect(sway?.keyframes).toEqual({ rotate: ["0deg", "5deg", "0deg", "-5deg", "0deg"] });

    const once2 = callsOn(onceOf(2));
    expect(once2.map((c) => Object.keys(c.keyframes as object)[0])).toEqual(["opacity", "translate"]);
    expect(once2[0]?.options).toMatchObject({ delay: 1500, fill: "backwards", iterations: 1 });
    expect(once2[1]?.options).toMatchObject({ duration: 700, iterations: 2 });
  });

  // R63: an inline svg clips at its viewBox; a wave can reach past it.
  it("svg-rig root svg has overflow visible (R63)", async () => {
    show({ page: page([layer(1, "pip")]) });
    await settle();
    const svg = svgOf(1);
    expect(svg.style.overflow).toBe("visible");
    expect(getComputedStyle(svg).overflow).toBe("visible");
  });

  it("PLY-01.S6 reduced motion (matchMedia) starts no loop animations and still runs enter animations", async () => {
    setReducedMotion(true);
    show({ page: page([layer(1, "pip"), layer(2, "bun")], [FLOAT, BLINK(1), FADE(2)]) });
    await settle();
    expect(animateCalls.filter(isLoop)).toHaveLength(0);
    expect(callsOn(onceOf(2))).toHaveLength(1);
    expect(callsOn(onceOf(2))[0]?.keyframes).toEqual({ opacity: ["0", "1"] });
  });

  it("the reducedMotion prop overrides matchMedia", async () => {
    const p = page([layer(1, "pip"), layer(2, "bun")], [FLOAT, BLINK(1), FADE(2)]);

    setReducedMotion(true);
    const first = show({ page: p, reducedMotion: false });
    await settle();
    expect(animateCalls.filter(isLoop)).toHaveLength(2);
    first.unmount();
    animateCalls.length = 0;

    setReducedMotion(false);
    show({ page: p, reducedMotion: true });
    await settle();
    expect(animateCalls.filter(isLoop)).toHaveLength(0);
    expect(callsOn(onceOf(2))).toHaveLength(1);
  });

  it("switching to reduced motion cancels running loops", async () => {
    show({ page: page([layer(1, "pip"), layer(2, "bun")], [FLOAT, BLINK(1), FADE(2)]) });
    await settle();
    const loops = animateCalls.filter(isLoop);
    expect(loops).toHaveLength(2);
    act(() => setReducedMotion(true));
    await settle();
    expect(loops.every((c) => c.canceled)).toBe(true);
    expect(animateCalls.filter(isLoop).filter(running)).toHaveLength(0);
  });

  it("edit mode starts no animations and has no tappable layers", async () => {
    const onSfx = vi.fn();
    show({
      page: page([layer(1, "pip"), layer(2, "bun")], [FLOAT, BLINK(1), FADE(2)], [tap(2, { action: "play_sfx", sfx: "chime" })]),
      mode: "edit",
      onSfx,
    });
    await settle();
    expect(animateCalls).toHaveLength(0);
    expect(document.querySelectorAll("[role='button']")).toHaveLength(0);
    fireEvent.click(assetOf(2));
    fireEvent.click(assetOf(2).querySelector("img") as HTMLElement);
    expect(onSfx).not.toHaveBeenCalled();
  });

  it("PLY-01.S4 tap runs actions in interaction order and do order", () => {
    const log: string[] = [];
    const interactions: Interaction[] = [
      tap(
        1,
        { action: "play_sfx", sfx: "a" },
        { action: "play_animation", target: id(1), primitive: "bounce" },
        { action: "play_sfx", sfx: "b" },
      ),
      tap(2, { action: "play_sfx", sfx: "z" }),
      tap(1, { action: "play_sfx", sfx: "c" }, { action: "play_animation", target: id(2), primitive: "pop" }),
    ];
    show({ page: page([layer(1, "bun"), layer(2, "bun")], [], interactions), onSfx: (ref) => log.push(`sfx:${ref}`) });
    const original = Element.prototype.animate;
    vi.spyOn(Element.prototype, "animate").mockImplementation(function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const property = Object.keys(keyframes as object).find((k) => k !== "offset");
      const where = this === onceOf(1) ? "1" : this === onceOf(2) ? "2" : "?";
      log.push(`animate:${property}@${where}`);
      return original.call(this, keyframes, options);
    });
    fireEvent.click(assetOf(1));
    expect(log).toEqual(["sfx:a", "animate:translate@1", "sfx:b", "sfx:c", "animate:scale@2"]);
  });

  it("play_sfx calls onSfx before the click handler returns", () => {
    const onSfx = vi.fn();
    show({ page: page([layer(1, "bun")], [], [tap(1, { action: "play_sfx", sfx: "chime" })]), onSfx });
    fireEvent.click(assetOf(1));
    // No await between the click and this line.
    expect(onSfx).toHaveBeenCalledTimes(1);
    expect(onSfx).toHaveBeenCalledWith("chime");
  });

  it("PLY-01.S7 show_bubble shows the text and removes it after 3000 ms", () => {
    vi.useFakeTimers();
    show({ page: page([layer(1, "bun")], [], [tap(1, { action: "show_bubble", target: id(1), text: "Good night, moon" })]) });
    expect(screen.queryByText("Good night, moon")).toBeNull();
    fireEvent.click(assetOf(1));
    const bubble = screen.getByText("Good night, moon");
    // An HTML element over the stage, not part of the stage image.
    expect(bubble).toBeInstanceOf(HTMLElement);
    expect(bubble.closest("svg")).toBeNull();
    expect(bubble.closest(".sv-layer")).toBeNull();
    expect(bubble.closest(".sv-stage")).not.toBeNull();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText("Good night, moon")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Good night, moon")).toBeNull();
  });

  it("a second bubble replaces the first", () => {
    vi.useFakeTimers();
    const interactions = [
      tap(1, { action: "show_bubble", target: id(1), text: "One" }),
      tap(2, { action: "show_bubble", target: id(2), text: "Two" }),
    ];
    show({ page: page([layer(1, "bun"), layer(2, "bun")], [], interactions) });
    fireEvent.click(assetOf(1));
    expect(screen.queryByText("One")).not.toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(assetOf(2));
    expect(screen.queryByText("One")).toBeNull();
    expect(screen.queryByText("Two")).not.toBeNull();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText("Two")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Two")).toBeNull();
  });

  // Bubble position, Exact change 5: centred on at.x, clamped to 0..1600, and
  // the bottom edge 24 stage units above the target box top. jsdom has no
  // layout, so the bubble width is stubbed to 400 stage units.
  it("show_bubble places the bubble above the target box, centred on at.x and clamped to the stage", () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400);
    const at = (x: number) => ({ at: { x, y: 600, scale: 0.5, z: 1 } });
    show({
      page: page(
        [layer(1, "bun", at(500)), layer(2, "bun", at(1590)), layer(3, "bun", at(100))],
        [],
        [1, 2, 3].map((n) => tap(n, { action: "show_bubble", target: id(n), text: `B${n}` })),
      ),
    });
    // Box top = 600 + (0 - 100) * 0.5 = 550; bottom edge 550 - 24 = 526.
    const place = (n: number) => {
      fireEvent.click(assetOf(n));
      const bubble = screen.getByText(`B${n}`);
      const rect = { left: parseFloat(bubble.style.left), bottom: 1200 - parseFloat(bubble.style.bottom) };
      return rect;
    };
    expect(place(1)).toEqual({ left: 300, bottom: 526 });
    expect(place(2)).toEqual({ left: 1200, bottom: 526 });
    expect(place(3)).toEqual({ left: 0, bottom: 526 });
  });

  it("set_expression on svg-rig shows only expr-<expression>", async () => {
    show({
      page: page(
        [layer(1, "pip", { pose: "stand", expression: "happy" })],
        [],
        [tap(1, { action: "set_expression", target: id(1), expression: "sad" })],
      ),
    });
    await settle();
    expect(exprDisplay(1, "happy")).toEqual(["inline"]);
    expect(exprDisplay(1, "sad")).toEqual(["none"]);
    fireEvent.click(assetOf(1));
    await settle();
    expect(exprDisplay(1, "sad")).toEqual(["inline"]);
    expect(exprDisplay(1, "happy")).toEqual(["none"]);
    expect(partOf(1, "part-eyes").style.display).not.toBe("none");
  });

  // R64: a presentation attribute display="none" stays in force when the
  // inline value is cleared, so every expr-* group gets an explicit inline
  // value. jsdom does not apply presentation attributes; assert the inline
  // values instead.
  it("R64 every expr-* group gets an explicit inline display, inline for the chosen and none for the others", async () => {
    const authored = ASSETS.rigattr?.files["stand.svg"] ?? "";
    expect(authored).toContain('<g class="expr-sad" display="none">');
    show({
      page: page(
        [layer(1, "rigattr", { pose: "stand", expression: "sad" })],
        [],
        [tap(1, { action: "set_expression", target: id(1), expression: "happy" })],
      ),
    });
    await settle();
    expect(exprDisplay(1, "sad")).toEqual(["inline"]);
    expect(exprDisplay(1, "happy")).toEqual(["none"]);
    fireEvent.click(assetOf(1));
    await settle();
    expect(exprDisplay(1, "happy")).toEqual(["inline"]);
    expect(exprDisplay(1, "sad")).toEqual(["none"]);
  });

  it("R64 without an expression the expr-* groups stay as authored", async () => {
    show({ page: page([layer(1, "rigattr", { pose: "stand" })]) });
    await settle();
    expect(exprDisplay(1, "happy")).toEqual([""]);
    expect(exprDisplay(1, "sad")).toEqual([""]);
    expect(layerEl(1).querySelector(".expr-sad")?.getAttribute("display")).toBe("none");
  });

  it("set_expression on webp swaps the img src to the selected entry file", () => {
    show({
      page: page(
        [layer(1, "bun", { pose: "stand", expression: "happy" })],
        [],
        [tap(1, { action: "set_expression", target: id(1), expression: "sad" })],
      ),
    });
    expect(assetOf(1).querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/bun/bun-happy.webp");
    fireEvent.click(assetOf(1));
    expect(assetOf(1).querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/bun/bun-sad.webp");
  });

  it("an illegal pair is skipped and warns", async () => {
    // Legal pip pairs: stand/happy, stand/sad, sit/happy.
    show({
      page: page(
        [layer(1, "pip", { pose: "sit", expression: "happy" }), layer(2, "pip", { pose: "stand", expression: "sad" })],
        [],
        [
          tap(1, { action: "set_expression", target: id(1), expression: "sad" }),
          tap(2, { action: "set_pose", target: id(2), pose: "sit" }),
        ],
      ),
    });
    await settle();
    fireEvent.click(assetOf(1));
    await settle();
    expect(exprDisplay(1, "happy")).toEqual(["inline"]);
    expect(exprDisplay(1, "sad")).toEqual(["none"]);
    expect(warnedAbout(id(1))).toBe(true);

    fireEvent.click(assetOf(2));
    await settle();
    expect(layerEl(2).querySelector(".pose-stand")).not.toBeNull();
    expect(layerEl(2).querySelector(".pose-sit")).toBeNull();
    expect(warnedAbout(id(2))).toBe(true);
  });

  it("PLY-01.S5 set_expression swaps the face parts on svg-rig and the image on svg and webp", async () => {
    const happy = { pose: "stand", expression: "happy" };
    show({
      page: page(
        [layer(1, "pip", happy), layer(2, "owl", happy), layer(3, "bun", happy)],
        [],
        [
          tap(
            3,
            { action: "set_expression", target: id(1), expression: "sad" },
            { action: "set_expression", target: id(2), expression: "sad" },
            { action: "set_expression", target: id(3), expression: "sad" },
          ),
        ],
      ),
    });
    await settle();
    fireEvent.click(assetOf(3));
    await settle();

    // svg-rig: only expr-sad shows; the other parts stay.
    expect(exprDisplay(1, "sad")).toEqual(["inline"]);
    expect(exprDisplay(1, "happy")).toEqual(["none"]);
    for (const name of ["part-eyes", "part-arm-right", "part-body"]) {
      expect(partOf(1, name), name).not.toBeNull();
    }

    // svg: the inlined svg is the sanitised text of the selected entry file.
    expect(assetOf(2).querySelectorAll("svg")).toHaveLength(1);
    // Review item 5: read the per-mount id suffix from the inlined node.
    const suffix = (svgOf(2).querySelector("radialGradient")?.id ?? "").replace(/^glow--/, "");
    expect(suffix).not.toBe("");
    const expected = sanitizeSvg(SVG_TEXT("owl", "owl-sad.svg"), suffix) as SVGSVGElement;
    const serialize = (node: Node) => new XMLSerializer().serializeToString(node);
    expect(serialize(svgOf(2))).toBe(serialize(expected));

    // webp: the img src is the resolver URL of the selected entry file.
    expect(assetOf(3).querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/bun/bun-sad.webp");
  });

  it("set_pose swaps the file and keeps the layer translate", async () => {
    show({
      page: page(
        [layer(1, "pip", { pose: "stand", expression: "happy" })],
        [],
        [tap(1, { action: "set_pose", target: id(1), pose: "sit" })],
      ),
    });
    await settle();
    expect(layerEl(1).querySelector(".pose-stand")).not.toBeNull();
    fireEvent.click(assetOf(1));
    await settle();
    expect(assetOf(1).querySelectorAll("svg")).toHaveLength(1);
    expect(layerEl(1).querySelector(".pose-sit")).not.toBeNull();
    expect(layerEl(1).querySelector(".pose-stand")).toBeNull();
    expect(layerEl(1).style.transform).toBe("translate(500px, 600px)");
    // The new entry's foot is (50, 180).
    expect(assetOf(1).style.transform).toBe("scale(0.5) translate(-50px, -180px)");
  });

  // Extra: "current pose" must be read inside one tap, so a later action in
  // the same `do` sees an earlier one. (stand, sad) is legal; (sit, sad) is not.
  it("set_pose then set_expression in one tap uses the new pose", async () => {
    show({
      page: page(
        [layer(1, "pip", { pose: "sit", expression: "happy" })],
        [],
        [
          tap(
            1,
            { action: "set_pose", target: id(1), pose: "stand" },
            { action: "set_expression", target: id(1), expression: "sad" },
          ),
        ],
      ),
    });
    await settle();
    fireEvent.click(assetOf(1));
    await settle();
    expect(layerEl(1).querySelector(".pose-stand")).not.toBeNull();
    expect(exprDisplay(1, "sad")).toEqual(["inline"]);
    expect(exprDisplay(1, "happy")).toEqual(["none"]);
    expect(warnedAbout(id(1))).toBe(false);
  });

  // Extra: Exact change 3, "start again on the new node after a pose swap".
  it("a pose swap starts part animations again on the new svg", async () => {
    show({
      page: page(
        [layer(1, "pip", { pose: "stand", expression: "happy" })],
        [BLINK(1)],
        [tap(1, { action: "set_pose", target: id(1), pose: "sit" })],
      ),
    });
    await settle();
    fireEvent.click(assetOf(1));
    await settle();
    expect(layerEl(1).querySelector(".pose-sit")).not.toBeNull();
    const calls = callsOn(partOf(1, "part-eyes"));
    expect(calls.filter(running).filter(isLoop)).toHaveLength(1);
  });

  // Extra: Exact change 5, preload of the files a tap can show.
  it("preloads the files of set_pose and set_expression targets on mount", async () => {
    const { svgText } = show({
      page: page(
        [layer(1, "pip", { pose: "stand", expression: "happy" }), layer(2, "owl", { pose: "stand", expression: "happy" })],
        [],
        [
          tap(1, { action: "set_pose", target: id(1), pose: "sit" }),
          tap(2, { action: "set_expression", target: id(2), expression: "sad" }),
        ],
      ),
    });
    await settle();
    expect(svgText).toHaveBeenCalledWith("pip", "sit.svg");
    expect(svgText).toHaveBeenCalledWith("owl", "owl-sad.svg");
  });

  it("blink animates .part-eyes inside the layer; a missing part warns and starts nothing", async () => {
    show({ page: page([layer(1, "pip"), layer(2, "pip"), layer(3, "noparts")], [BLINK(2), BLINK(3)]) });
    await settle();
    expect(animateCalls).toHaveLength(1);
    expect(animateCalls[0]?.element).toBe(partOf(2, "part-eyes"));
    expect(layerEl(2).contains(animateCalls[0]?.element ?? null)).toBe(true);
    expect(warnedAbout(id(3))).toBe(true);
  });

  it("part animation sets transform-origin from data-pivot", async () => {
    const seen: { element: Element; box: string; origin: string }[] = [];
    const original = Element.prototype.animate;
    vi.spyOn(Element.prototype, "animate").mockImplementation(function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const style = (this as SVGElement).style;
      seen.push({ element: this, box: style.transformBox, origin: style.transformOrigin });
      return original.call(this, keyframes, options);
    });
    show({ page: page([layer(1, "pip")], [{ target: id(1), primitive: "wave", params: { count: 2 }, trigger: "enter" }]) });
    await settle();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.element).toBe(partOf(1, "part-arm-right"));
    expect(seen[0]?.box).toBe("view-box");
    expect(seen[0]?.origin).toBe("40px 12px");
  });

  it("a repeated tap cancels the earlier animation of the same primitive", () => {
    show({
      page: page(
        [layer(1, "bun")],
        [FADE(1)],
        [
          tap(
            1,
            { action: "play_animation", target: id(1), primitive: "bounce" },
            { action: "play_animation", target: id(1), primitive: "pop" },
          ),
        ],
      ),
    });
    loadImages();
    fireEvent.click(assetOf(1));
    fireEvent.click(assetOf(1));
    const byProperty = (p: string) => callsOn(onceOf(1)).filter((c) => p in (c.keyframes as object));
    const bounces = byProperty("translate");
    const pops = byProperty("scale");
    expect(bounces.map((c) => c.canceled)).toEqual([true, false]);
    expect(pops.map((c) => c.canceled)).toEqual([true, false]);
    expect(byProperty("opacity").map((c) => c.canceled)).toEqual([false]);
  });

  it("non-tappable layers have pointer-events none", () => {
    show({ page: page([layer(1, "bun"), layer(2, "bun")], [], [tap(1, { action: "play_sfx", sfx: "chime" })]) });
    const tappable = assetOf(1);
    expect(tappable.style.pointerEvents).toBe("auto");
    expect(tappable.style.cursor).toBe("pointer");
    expect(tappable.style.touchAction).toBe("manipulation");
    expect(tappable.getAttribute("role")).toBe("button");
    expect(tappable.tabIndex).toBe(0);
    expect(tappable.getAttribute("aria-label")).toBe("bun");
    const other = assetOf(2);
    expect(other.style.pointerEvents).toBe("none");
    expect(other.getAttribute("role")).toBeNull();
  });

  // Extra: Exact change 3, keyboard access to a tappable layer.
  it("a tappable layer runs its tap on Enter and Space", () => {
    const onSfx = vi.fn();
    show({ page: page([layer(1, "bun")], [], [tap(1, { action: "play_sfx", sfx: "chime" })]), onSfx });
    fireEvent.keyDown(assetOf(1), { key: "Enter" });
    expect(onSfx).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(assetOf(1), { key: " " });
    expect(onSfx).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(assetOf(1), { key: "a" });
    expect(onSfx).toHaveBeenCalledTimes(2);
  });

  it("paper texture renders only with textureUrl, as one full-stage img above all layers with mix-blend-mode multiply", () => {
    const p = page([layer(1, "bun", { at: { x: 500, y: 600, scale: 0.5, z: 40 } }), layer(2, "tree")]);
    const first = show({ page: p });
    expect(document.querySelector(".sv-paper")).toBeNull();
    first.unmount();

    show({ page: p, textureUrl: "https://cdn.test/paper.webp" });
    const papers = document.querySelectorAll<HTMLImageElement>(".sv-paper");
    expect(papers).toHaveLength(1);
    const paper = papers[0] as HTMLImageElement;
    expect(paper.tagName).toBe("IMG");
    expect(paper.getAttribute("src")).toBe("https://cdn.test/paper.webp");
    expect(paper.getAttribute("alt")).toBe("");
    expect(paper.parentElement?.classList.contains("sv-stage")).toBe(true);
    expect(paper.style.mixBlendMode).toBe("multiply");
    expect(paper.style.pointerEvents).toBe("none");
    expect(paper.style.width).toBe("1600px");
    expect(paper.style.height).toBe("1200px");
    const z = Number(paper.style.zIndex);
    for (const el of document.querySelectorAll<HTMLElement>(".sv-layer")) {
      expect(z).toBeGreaterThan(Number(el.style.zIndex));
      expect(el.compareDocumentPosition(paper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("unmount cancels every started animation", async () => {
    const { unmount } = show({ page: page([layer(1, "pip"), layer(2, "bun")], [FLOAT, BLINK(1), FADE(2)]) });
    await settle();
    expect(animateCalls).toHaveLength(3);
    unmount();
    expect(animateCalls.every((c) => c.canceled)).toBe(true);
  });

  // ---- Review fix list (PR #54), items 2 to 12.

  it("a throwing action warns once and the next action still runs", () => {
    const onSfx = vi.fn(() => {
      throw new Error("audio failed");
    });
    show({
      page: page(
        [layer(1, "bun")],
        [],
        [tap(1, { action: "play_sfx", sfx: "boom" }, { action: "show_bubble", target: id(1), text: "Still here" })],
      ),
      onSfx,
    });
    fireEvent.click(assetOf(1));
    expect(onSfx).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Still here")).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]?.map(String).join(" ") ?? "";
    expect(message).toContain("play_sfx");
    expect(message).toContain(id(1));
    expect(message).not.toContain("Still here");
  });

  it("set_expression to an expression the rig file lacks warns and keeps the current group", async () => {
    // rigone: legal allows stand/sad, but stand.svg has only expr-happy.
    show({
      page: page(
        [layer(1, "rigone", { pose: "stand", expression: "happy" })],
        [],
        [tap(1, { action: "set_expression", target: id(1), expression: "sad" })],
      ),
    });
    await settle();
    expect(exprDisplay(1, "happy")).toEqual(["inline"]);
    fireEvent.click(assetOf(1));
    await settle();
    expect(exprDisplay(1, "happy")).toEqual(["inline"]);
    expect(exprDisplay(1, "sad")).toEqual([]);
    expect(warnedAbout(id(1))).toBe(true);
  });

  it("set_pose whose file fails to load warns and keeps the current pose shown", async () => {
    // rigone: sit/happy is legal, but sit.svg does not load.
    show({
      page: page(
        [layer(1, "rigone", { pose: "stand", expression: "happy" })],
        [],
        [tap(1, { action: "set_pose", target: id(1), pose: "sit" })],
      ),
    });
    await settle();
    fireEvent.click(assetOf(1));
    await settle();
    expect(assetOf(1).querySelectorAll("svg")).toHaveLength(1);
    expect(layerEl(1).querySelector(".pose-stand")).not.toBeNull();
    expect(exprDisplay(1, "happy")).toEqual(["inline"]);
    expect(assetOf(1).style.transform).toBe("scale(0.5) translate(-50px, -100px)");
    expect(warnedAbout(id(1))).toBe(true);
  });

  it("a layer whose svg has a zero-width viewBox is not rendered and warns once", async () => {
    show({ page: page([layer(1, "flat"), layer(2, "tree")]) });
    await settle();
    expect(svgOf(2)).not.toBeNull();
    expect(document.querySelectorAll(`[data-instance-id="${id(1)}"] svg`)).toHaveLength(0);
    expect(warn.mock.calls.filter((args) => args.map(String).join(" ").includes(id(1)))).toHaveLength(1);
  });

  it("two SceneViews of the same page never share ids, and each local reference stays inside its own svg", async () => {
    const { resolver } = makeResolver();
    const p = page([layer(1, "tree"), layer(2, "pip", { pose: "stand", expression: "happy" })]);
    render(
      <>
        <SceneView page={p} assets={resolver} mode="play" />
        <SceneView page={p} assets={resolver} mode="play" />
      </>,
    );
    await settle();
    // The root svg of each layer (a child selector on svg is not reliable in jsdom).
    const svgs = Array.from(document.querySelectorAll(".sv-asset")).flatMap(
      (el) => Array.from(el.children).filter((c) => c.localName === "svg") as SVGSVGElement[],
    );
    expect(svgs).toHaveLength(4);
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of svgs) expect(localRefsResolve(svg)).toBe(true);
  });

  it("a webp load error warns once, leaves the layer empty, and calls onAssetError", () => {
    const onAssetError = vi.fn();
    show({ page: page([layer(1, "bun", { pose: "stand", expression: "happy" })]), onAssetError });
    fireEvent.error(assetOf(1).querySelector("img") as HTMLImageElement);
    expect(assetOf(1).childElementCount).toBe(0);
    expect(warn.mock.calls.filter((args) => args.map(String).join(" ").includes(id(1)))).toHaveLength(1);
    expect(onAssetError).toHaveBeenCalledTimes(1);
    expect(onAssetError).toHaveBeenCalledWith(id(1), "https://cdn.test/bun/bun-happy.webp");
  });

  it("an svg load failure warns once, leaves the layer empty, and calls onAssetError", async () => {
    const onAssetError = vi.fn();
    // rigone/sit.svg does not load.
    show({ page: page([layer(1, "rigone", { pose: "sit", expression: "happy" })]), onAssetError });
    await settle();
    expect(assetOf(1).childElementCount).toBe(0);
    expect(warn.mock.calls.filter((args) => args.map(String).join(" ").includes(id(1)))).toHaveLength(1);
    expect(onAssetError).toHaveBeenCalledTimes(1);
    expect(onAssetError).toHaveBeenCalledWith(id(1), "https://cdn.test/rigone/sit.svg");
  });

  it("enter animations start only after the layer's asset is ready", async () => {
    const { resolver, svgText } = makeResolver();
    let release: (text: string) => void = () => {};
    svgText.mockImplementationOnce(() => new Promise<string>((resolve) => (release = resolve)));
    render(<SceneView page={page([layer(1, "tree"), layer(2, "bun")], [FADE(1), FADE(2)])} assets={resolver} mode="play" />);
    await act(async () => {});
    // Neither asset is ready: the svg text is pending, the image has not loaded.
    expect(callsOn(onceOf(1))).toHaveLength(0);
    expect(callsOn(onceOf(2))).toHaveLength(0);
    fireEvent.load(assetOf(2).querySelector("img") as HTMLImageElement);
    expect(callsOn(onceOf(2))).toHaveLength(1);
    expect(callsOn(onceOf(1))).toHaveLength(0);
    await act(async () => release(SVG_TEXT("tree", "tree.svg")));
    await settle();
    expect(svgOf(1)).not.toBeNull();
    expect(callsOn(onceOf(1))).toHaveLength(1);
    expect(callsOn(onceOf(2))).toHaveLength(1);
  });

  it("switching a layer's renderer clears the old svg", async () => {
    const view = show({ page: page([layer(1, "tree")]) });
    await settle();
    expect(svgOf(1)).not.toBeNull();
    view.again({ page: page([layer(1, "bun")]) });
    await settle();
    expect(assetOf(1).querySelectorAll("svg")).toHaveLength(0);
    expect(assetOf(1).querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/bun/bun-happy.webp");
  });

  it("a pose swap cancels the old node's animations and drops them from the Animator", async () => {
    const view = show({
      page: page(
        [layer(1, "pip", { pose: "stand", expression: "happy" })],
        [BLINK(1)],
        [tap(1, { action: "set_pose", target: id(1), pose: "sit" })],
      ),
    });
    await settle();
    const oldEyes = partOf(1, "part-eyes");
    const [oldCall] = callsOn(oldEyes);
    expect(oldCall).toBeDefined();
    fireEvent.click(assetOf(1));
    await settle();
    expect(oldEyes.isConnected).toBe(false);
    expect(oldCall?.canceled).toBe(true);
    // Dropped from the Animator: unmount cancels every entry it still holds.
    const cancel = vi.spyOn(oldCall!.animation, "cancel");
    view.unmount();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("a reduced-motion change cancels only loops; tap animations keep running and enter does not replay", async () => {
    show({
      page: page([layer(1, "bun")], [FLOAT, FADE(1)], [tap(1, { action: "play_animation", target: id(1), primitive: "bounce" })]),
    });
    await settle();
    fireEvent.click(assetOf(1));
    const float = callsOn(loopOf(1));
    const fades = () => callsOn(onceOf(1)).filter((c) => "opacity" in (c.keyframes as object));
    const bounces = () => callsOn(onceOf(1)).filter((c) => "translate" in (c.keyframes as object));
    expect(float).toHaveLength(1);
    expect(fades()).toHaveLength(1);
    expect(bounces()).toHaveLength(1);
    act(() => setReducedMotion(true));
    await settle();
    expect(float[0]?.canceled).toBe(true);
    expect(bounces().map((c) => c.canceled)).toEqual([false]);
    expect(fades().map((c) => c.canceled)).toEqual([false]);
  });

  it("className lands on .sv-viewport", () => {
    show({ page: page([layer(1, "bun")]), className: "player-stage rounded" });
    const viewport = document.querySelector(".sv-viewport") as HTMLElement;
    expect(viewport.classList.contains("player-stage")).toBe(true);
    expect(viewport.classList.contains("rounded")).toBe(true);
  });

  it("a new but equal page object does not preload again", async () => {
    const make = () =>
      page(
        [layer(1, "pip", { pose: "stand", expression: "happy" })],
        [],
        [tap(1, { action: "set_pose", target: id(1), pose: "sit" })],
      );
    const view = show({ page: make() });
    await settle();
    const preloads = () => view.svgText.mock.calls.filter(([ref, file]) => ref === "pip" && file === "sit.svg").length;
    expect(preloads()).toBe(1);
    view.again({ page: make() });
    await settle();
    expect(preloads()).toBe(1);
  });

  it("play_sfx calls onSfx synchronously inside a native click dispatched outside act", () => {
    const onSfx = vi.fn();
    show({ page: page([layer(1, "bun")], [], [tap(1, { action: "play_sfx", sfx: "chime" })]), onSfx });
    assetOf(1).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSfx).toHaveBeenCalledTimes(1);
    expect(onSfx).toHaveBeenCalledWith("chime");
  });
});
