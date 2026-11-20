import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeSvg } from "../src/sanitizeSvg";
import { SceneView } from "../src/SceneView";
import { SKY_COLORS } from "../src/sky";
import type { SceneViewProps } from "../src/types";
import { ASSETS, type Animation, type Interaction, SVG_TEXT, id, layer, makeResolver, page } from "./fixtures";
import { type AnimateCall, animateCalls, setReducedMotion } from "./setup";

// Expected values come from #14 "Implementation refinement" (invariants and
// Exact changes) and design "5. Scene runtime". The tests after the marker
// "#68" come from #68 "Implementation refinement" (Acceptance, Exact changes)
// and DESIGN.md 2, 8 and 12.3.

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
// after the asset is ready, so the tests fire `load` on each asset image once
// (and on a WebP backdrop image, #68).
const loadedImages = new WeakSet<HTMLImageElement>();
function loadImages(): void {
  for (const img of document.querySelectorAll<HTMLImageElement>(".sv-asset img, .sv-backdrop img")) {
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

type SvgText = ReturnType<typeof makeResolver>["svgText"];

// `prepare` runs before the first render, for example to hold a file.
function show(props: Props, prepare?: (svgText: SvgText) => void) {
  const { resolver, svgText } = makeResolver();
  prepare?.(svgText);
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

// Holds the svgText promise of one (ref, file) until the returned function is
// called; every other file resolves as before (#68: hold by file, not by call
// order, because the backdrop is also loaded through svgText).
function hold(svgText: SvgText, ref: string, file: string): (text?: string) => Promise<void> {
  let release: (text: string) => void = () => {};
  const pending = new Promise<string>((resolve) => (release = resolve));
  svgText.mockImplementation((r: string, f: string) =>
    r === ref && f === file ? pending : Promise.resolve().then(() => SVG_TEXT(r, f)),
  );
  return async (text?: string) => {
    await act(async () => release(text ?? SVG_TEXT(ref, file)));
  };
}

// Replaces the text of one (ref, file); every other file resolves as before.
function replaceText(svgText: SvgText, ref: string, file: string, result: () => Promise<string>): void {
  svgText.mockImplementation(async (r: string, f: string) => (r === ref && f === file ? result() : SVG_TEXT(r, f)));
}

// jsdom has no layout: clientWidth and clientHeight are 0 unless stubbed.
function stubClientSize(width: number, height: number): void {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
}

const viewportEl = () => document.querySelector(".sv-viewport") as HTMLElement;
const frameEl = () => document.querySelector(".sv-frame") as HTMLElement;
const backdropEl = () => document.querySelector(".sv-backdrop") as HTMLElement;
// The number in `scale(<k>)` of a style transform.
function scaleOf(el: HTMLElement | null): number {
  const match = /scale\(([^)]+)\)/.exec(el?.style.transform ?? "");
  return match ? Number(match[1]) : Number.NaN;
}
// The root svg elements that are direct children of `el` (a child selector on
// svg is not reliable in jsdom).
const childSvgs = (el: Element | null) =>
  Array.from(el?.children ?? []).filter((c) => c.localName === "svg") as SVGSVGElement[];

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
    expect(document.querySelectorAll(".sv-stage img[src*='ghost'], .sv-stage svg")).toHaveLength(0);
    expect(warnedAbout(id(2))).toBe(true);
  });

  // #68 replaces "the stage is 1600 by 1200 units with the sky colour of the
  // page" (Tests that break): no sky colour; the paper colour shows instead.
  it("frame, stage, and paper colour", () => {
    expect(SKY_COLORS).toEqual({ day: "#7EBDE6", cloudy: "#E3ECF6", dusk: "#F3ECDD", night: "#1B2440" });
    // The four SKY_COLORS values as hex and as jsdom serialises them.
    const skyValues = [
      "#7ebde6",
      "#e3ecf6",
      "#f3ecdd",
      "#1b2440",
      "rgb(126, 189, 230)",
      "rgb(227, 236, 246)",
      "rgb(243, 236, 221)",
      "rgb(27, 36, 64)",
    ];
    for (const mode of ["play", "still", "edit"] as const) {
      for (const sky of ["day", "cloudy", "dusk", "night"] as const) {
        const view = show({ page: page([layer(1, "bun")], [], [], sky), mode });
        const viewport = viewportEl();
        expect(viewport.style.backgroundColor, mode).toBe("var(--paper, #FFF8EC)");
        expect(viewport.style.width, mode).toBe("100%");
        expect(viewport.style.height, mode).toBe(mode === "edit" ? "auto" : "100%");
        expect(viewport.style.aspectRatio, mode).toBe("4 / 3");
        expect(viewport.style.overflow, mode).toBe("hidden");
        expect(document.querySelector<HTMLElement>(".sv-overlay")?.style.overflow, mode).toBe("");
        for (const el of document.querySelectorAll<HTMLElement>("*")) {
          const background = `${el.style?.backgroundColor ?? ""} ${el.style?.background ?? ""}`.toLowerCase();
          for (const value of skyValues) expect(background, `${mode} ${sky} ${el.className}`).not.toContain(value);
        }
        view.unmount();
      }
    }
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
    expect(bubble.closest(".sv-overlay")).not.toBeNull();
    expect(bubble.closest(".sv-stage")).toBeNull();
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

  it("paper texture: one tiled element over the frame, above the layers and below the overlay", () => {
    const p = page([layer(1, "bun", { at: { x: 500, y: 600, scale: 0.5, z: 40 } }), layer(2, "tree")]);
    const first = show({ page: p });
    expect(document.querySelector(".sv-paper")).toBeNull();
    first.unmount();

    show({ page: p, textureUrl: "https://cdn.test/paper.webp" });
    const papers = document.querySelectorAll<HTMLElement>(".sv-paper");
    expect(papers).toHaveLength(1);
    const paper = papers[0] as HTMLElement;
    expect(paper.tagName).toBe("DIV");
    expect(paper.parentElement?.classList.contains("sv-frame")).toBe(true);
    expect(paper.getAttribute("aria-hidden")).toBe("true");
    expect(paper.style.backgroundImage).toBe('url("https://cdn.test/paper.webp")');
    expect(paper.style.backgroundSize).toBe("480px 480px");
    expect(paper.style.backgroundRepeat).toBe("repeat");
    expect(paper.style.opacity).toBe("0.32");
    expect(paper.style.mixBlendMode).toBe("multiply");
    expect(paper.style.pointerEvents).toBe("none");
    expect(paper.style.width).toBe("2400px");
    expect(paper.style.height).toBe("1200px");
    expect(paper.style.zIndex).toBe("");
    // Above the layers by DOM order (invariant 5), below the overlay.
    for (const el of document.querySelectorAll<HTMLElement>(".sv-layer")) {
      expect(el.compareDocumentPosition(paper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const overlay = document.querySelector(".sv-overlay");
    expect(overlay).not.toBeNull();
    expect(paper.compareDocumentPosition(overlay as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  // ---- Follow-up round (item 3: warn, keep the current visible group, change nothing).

  it("a SceneView re-render does not re-insert the svg or replay part animations", async () => {
    show({
      page: page(
        [layer(1, "pip", { pose: "stand", expression: "happy" }), layer(2, "bun")],
        [BLINK(1), { target: id(1), primitive: "wave", params: { count: 2 }, trigger: "enter" }],
        [tap(2, { action: "show_bubble", target: id(2), text: "Hi" })],
      ),
    });
    await settle();
    const svg = svgOf(1);
    expect(animateCalls).toHaveLength(2);
    fireEvent.click(assetOf(2));
    await settle();
    expect(screen.queryByText("Hi")).not.toBeNull();
    expect(animateCalls).toHaveLength(2);
    expect(animateCalls.some((c) => c.canceled)).toBe(false);
    expect(svg.isConnected).toBe(true);
    expect(svgOf(1)).toBe(svg);
  });

  it("an initial expression without its group in the rig file warns once and leaves the groups as authored", async () => {
    // rigone: stand/sad is legal, but stand.svg has only expr-happy.
    show({ page: page([layer(1, "rigone", { pose: "stand", expression: "sad" })]) });
    await settle();
    expect(exprDisplay(1, "happy")).toEqual([""]);
    expect(warn.mock.calls.filter((args) => args.map(String).join(" ").includes(id(1)))).toHaveLength(1);
  });

  it("set_expression to a missing group before the rig svg is inserted warns and never hides every group", async () => {
    const { resolver, svgText } = makeResolver();
    let release: (text: string) => void = () => {};
    const pending = new Promise<string>((resolve) => (release = resolve));
    svgText.mockImplementation((ref, file) => (ref === "rigone" ? pending : Promise.resolve(SVG_TEXT(ref, file))));
    render(
      <SceneView
        page={page(
          [layer(1, "rigone", { pose: "stand", expression: "happy" })],
          [],
          [tap(1, { action: "set_expression", target: id(1), expression: "sad" })],
        )}
        assets={resolver}
        mode="play"
      />,
    );
    await act(async () => {});
    fireEvent.click(assetOf(1));
    await act(async () => release(SVG_TEXT("rigone", "stand.svg")));
    await settle();
    expect(svgOf(1)).not.toBeNull();
    // As authored ("") or the last legal expression ("inline"); never hidden.
    expect(["", "inline"]).toContain(exprDisplay(1, "happy")[0]);
    expect(warnedAbout(id(1))).toBe(true);
  });

  it("a failed plain-svg expression swap restores the pose and expression on screen", async () => {
    // owlx: stand/sad is legal but its file does not load; sit is legal only with happy.
    show({
      page: page(
        [layer(1, "owlx", { pose: "stand", expression: "happy" }), layer(2, "bun")],
        [],
        [
          tap(1, { action: "set_expression", target: id(1), expression: "sad" }),
          tap(2, { action: "set_pose", target: id(1), pose: "sit" }),
        ],
      ),
    });
    await settle();
    fireEvent.click(assetOf(1));
    await settle();
    expect(layerEl(1).querySelector(".owl-happy")).not.toBeNull();
    expect(warnedAbout(id(1))).toBe(true);
    warn.mockClear();
    // (sit, happy) is legal; (sit, sad) is not. The swap works only if the
    // expression went back to happy.
    fireEvent.click(assetOf(2));
    await settle();
    expect(layerEl(1).querySelector(".owl-sit")).not.toBeNull();
    expect(warnedAbout(id(1))).toBe(false);
  });

  it("a set_expression whose new webp fails keeps the current image, warns once, and calls onAssetError", async () => {
    const onAssetError = vi.fn();
    show({
      page: page(
        [layer(1, "bun", { pose: "stand", expression: "happy" })],
        [],
        [tap(1, { action: "set_expression", target: id(1), expression: "sad" })],
      ),
      onAssetError,
    });
    await settle();
    fireEvent.click(assetOf(1));
    const swapped = assetOf(1).querySelector('img[src="https://cdn.test/bun/bun-sad.webp"]') as HTMLImageElement | null;
    if (swapped) fireEvent.error(swapped);
    await settle();
    const imgs = Array.from(assetOf(1).querySelectorAll("img")).map((img) => img.getAttribute("src"));
    expect(imgs).toEqual(["https://cdn.test/bun/bun-happy.webp"]);
    expect(warn.mock.calls.filter((args) => args.map(String).join(" ").includes(id(1)))).toHaveLength(1);
    expect(onAssetError).toHaveBeenCalledTimes(1);
    expect(onAssetError).toHaveBeenCalledWith(id(1), "https://cdn.test/bun/bun-sad.webp");
  });
});

// ---- #68: backdrop frame, fit, still mode, page phases, load report.

describe("SceneView frame, fit, still mode, phases and load report (#68)", () => {
  const PAPER_URL = "https://cdn.test/paper.webp";
  const opacityCalls = (el: Element) => callsOn(el).filter((c) => "opacity" in (c.keyframes as object));

  it("PLY-01.S2 a page draws its backdrop in a 2400 x 1200 frame, its layers in a 1600 x 1200 clipping stage, and one tiled paper texture with multiply", async () => {
    stubClientSize(1002, 578);
    show({
      page: page([layer(1, "pip", { pose: "stand", expression: "happy" }), layer(2, "tree"), layer(3, "bun")]),
      textureUrl: PAPER_URL,
    });
    await settle();
    for (const n of [1, 2]) {
      expect(assetOf(n).querySelectorAll("svg"), `layer ${n}`).toHaveLength(1);
      expect(assetOf(n).querySelectorAll("img"), `layer ${n}`).toHaveLength(0);
    }
    expect(assetOf(3).querySelectorAll("img")).toHaveLength(1);
    expect(assetOf(3).querySelectorAll("svg")).toHaveLength(0);

    // Invariant 3, contain: k = min(W / 1600, H / 1200), x = (W - 2400k) / 2, y = (H - 1200k) / 2.
    const k = Math.min(1002 / 1600, 578 / 1200);
    const frame = frameEl();
    expect(frame).not.toBeNull();
    expect(frame.style.width).toBe("2400px");
    expect(frame.style.height).toBe("1200px");
    // jsdom 31 serialises "0 0" as "0px 0px" (measured 2026-11-19).
    expect(["0 0", "0px 0px"]).toContain(frame.style.transformOrigin);
    expect(scaleOf(frame)).toBeCloseTo(k, 3);
    expect(parseFloat(frame.style.left)).toBeCloseTo((1002 - 2400 * k) / 2, 3);
    expect(parseFloat(frame.style.top)).toBeCloseTo((578 - 1200 * k) / 2, 3);

    const children = Array.from(frame.children) as HTMLElement[];
    expect(children.map((c) => c.className)).toEqual(["sv-backdrop", "sv-stage", "sv-paper", "sv-overlay"]);
    for (const child of children) expect(child.style.zIndex, child.className).toBe("");

    const stage = frame.querySelector(":scope > .sv-stage") as HTMLElement;
    expect(stage.style.left).toBe("400px");
    expect(stage.style.width).toBe("1600px");
    expect(stage.style.height).toBe("1200px");
    expect(stage.style.overflow).toBe("hidden");
    expect(stage.style.isolation).toBe("isolate");
    expect(stage.style.pointerEvents).toBe("none");
    expect(stage.style.backgroundColor).toBe("");
    expect(stage.style.transform).toBe("");
    expect(stage.style.zIndex).toBe("");
    const layers = Array.from(document.querySelectorAll(".sv-layer"));
    expect(layers).toHaveLength(3);
    for (const el of layers) expect(stage.contains(el)).toBe(true);

    const [backdropSvg, ...more] = childSvgs(backdropEl());
    expect(more).toHaveLength(0);
    expect(backdropSvg?.getAttribute("width")).toBe("2400");
    expect(backdropSvg?.getAttribute("height")).toBe("1200");
    expect(localRefsResolve(backdropSvg as SVGSVGElement)).toBe(true);

    const papers = document.querySelectorAll<HTMLElement>(".sv-paper");
    expect(papers).toHaveLength(1);
    const paper = papers[0] as HTMLElement;
    expect(paper.style.backgroundImage).toBe('url("https://cdn.test/paper.webp")');
    expect(paper.style.backgroundSize).toBe("480px 480px");
    expect(paper.style.backgroundRepeat).toBe("repeat");
    expect(paper.style.opacity).toBe("0.32");
    expect(paper.style.mixBlendMode).toBe("multiply");
    expect(paper.style.pointerEvents).toBe("none");
    expect(paper.style.width).toBe("2400px");

    // No per-layer SVG filters (design "5").
    expect(document.querySelectorAll("[filter]")).toHaveLength(0);
    for (const el of document.querySelectorAll<HTMLElement>("*")) expect(el.style?.filter ?? "").toBe("");
  });

  it("fit cover scales by the larger factor", () => {
    stubClientSize(151, 148);
    const p = page([layer(1, "bun")]);
    const view = show({ page: p, mode: "still", fit: "cover" });
    const k = 148 / 1200;
    expect(scaleOf(frameEl())).toBeCloseTo(k, 4);
    expect(parseFloat(frameEl().style.left)).toBeCloseTo((151 - 2400 * k) / 2, 4);
    view.again({ page: p, mode: "still", fit: "contain" });
    expect(scaleOf(frameEl())).toBeCloseTo(151 / 1600, 4);
  });

  it("until the backdrop loads, only the paper colour shows", async () => {
    let release: (text?: string) => Promise<void> = async () => {};
    show({ page: page([layer(1, "bun")]) }, (svgText) => (release = hold(svgText, "meadow", "night.svg")));
    await settle();
    expect(backdropEl()).not.toBeNull();
    expect(backdropEl().childElementCount).toBe(0);
    await release();
    await settle();
    expect(childSvgs(backdropEl())).toHaveLength(1);
  });

  it("a webp backdrop is an img with the resolver url", () => {
    show({ page: page([layer(1, "tree")], [], [], "night", "pond") });
    const img = document.querySelector(".sv-backdrop img") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://cdn.test/pond/night.webp");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("width")).toBe("2400");
    expect(img?.getAttribute("height")).toBe("1200");
  });

  it("the scale comes from clientWidth and clientHeight, not getBoundingClientRect", () => {
    stubClientSize(800, 600);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    } as DOMRect);
    show({ page: page([layer(1, "bun")]) });
    expect(scaleOf(frameEl())).toBeCloseTo(0.5, 6);
  });

  it("onAssetsSettled reports no failure when every file loads", async () => {
    const onAssetsSettled = vi.fn();
    show({ page: page([layer(1, "tree"), layer(2, "bun")]), onAssetsSettled });
    await settle();
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(onAssetsSettled).toHaveBeenCalledWith({ failed: [] });
    expect(viewportEl().getAttribute("data-settled")).toBe("true");
  });

  it("a layer svg that the sanitiser refuses is a reported failure", async () => {
    const onAssetsSettled = vi.fn();
    const onAssetError = vi.fn();
    show({ page: page([layer(1, "tree")]), onAssetsSettled, onAssetError }, (svgText) =>
      replaceText(svgText, "tree", "tree.svg", async () => '<svg viewBox="0 0 0 1200"/>'),
    );
    await settle();
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(onAssetsSettled.mock.calls[0]?.[0].failed).toEqual([
      { key: id(1), ref: "tree", url: "https://cdn.test/tree/tree.svg", reason: "is not a valid SVG" },
    ]);
    expect(onAssetError).toHaveBeenCalledTimes(1);
    expect(onAssetError).toHaveBeenCalledWith(id(1), "https://cdn.test/tree/tree.svg");
  });

  it("a rejected svg load and a webp error are reported failures", async () => {
    const onAssetsSettled = vi.fn();
    show({ page: page([layer(1, "tree"), layer(2, "bun")]), onAssetsSettled }, (svgText) =>
      replaceText(svgText, "tree", "tree.svg", () => Promise.reject(new Error("network"))),
    );
    // The tree rejects first; then the bun image fails.
    for (let i = 0; i < 3; i++) await act(async () => {});
    fireEvent.error(assetOf(2).querySelector("img") as HTMLImageElement);
    await settle();
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(onAssetsSettled.mock.calls[0]?.[0].failed).toEqual([
      { key: id(1), ref: "tree", url: "https://cdn.test/tree/tree.svg", reason: "could not be loaded" },
      { key: id(2), ref: "bun", url: "https://cdn.test/bun/bun-happy.webp", reason: "could not be loaded" },
    ]);
  });

  it("an invalid backdrop svg is reported and shows paper", async () => {
    const onAssetsSettled = vi.fn();
    const onAssetError = vi.fn();
    show({ page: page([layer(1, "tree")]), onAssetsSettled, onAssetError }, (svgText) =>
      replaceText(svgText, "meadow", "night.svg", async () => '<svg viewBox="0 0 0 1200"/>'),
    );
    await settle();
    expect(backdropEl().childElementCount).toBe(0);
    const warnings = warn.mock.calls.map((args) => args.map(String).join(" "));
    expect(warnings.filter((w) => w.includes("meadow") && w.includes("is not a valid SVG"))).toHaveLength(1);
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(onAssetsSettled.mock.calls[0]?.[0].failed).toEqual([
      { key: "backdrop", ref: "meadow", url: "https://cdn.test/meadow/night.svg", reason: "is not a valid SVG" },
    ]);
    expect(onAssetError).not.toHaveBeenCalled();
  });

  it("a backdrop without a variant for the sky shows paper, warns once and is reported", async () => {
    const onAssetsSettled = vi.fn();
    show({ page: page([layer(1, "bun")], [FADE(1)], [], "dusk", "pond"), onAssetsSettled });
    await settle();
    expect(backdropEl()).not.toBeNull();
    expect(backdropEl().childElementCount).toBe(0);
    const warnings = warn.mock.calls.map((args) => args.map(String).join(" "));
    expect(warnings.filter((w) => w.includes('no variant for sky "dusk"'))).toHaveLength(1);
    expect(opacityCalls(onceOf(1)).filter(running)).toHaveLength(1);
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(onAssetsSettled.mock.calls[0]?.[0].failed).toEqual([
      { key: "backdrop", ref: "pond", url: null, reason: 'backdrop "pond" has no variant for sky "dusk"' },
    ]);
  });

  it("an unknown ref is a reported failure", async () => {
    const onAssetsSettled = vi.fn();
    show({ page: page([layer(1, "ghost")]), onAssetsSettled });
    await settle();
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(onAssetsSettled.mock.calls[0]?.[0].failed).toEqual([
      { key: id(1), ref: "ghost", url: null, reason: 'has unknown ref "ghost"' },
    ]);
  });

  it("a failed swap is not in the report", async () => {
    const onAssetsSettled = vi.fn();
    show({
      page: page(
        [layer(1, "owlx", { pose: "stand", expression: "happy" })],
        [],
        [tap(1, { action: "set_expression", target: id(1), expression: "sad" })],
      ),
      onAssetsSettled,
    });
    await settle();
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(onAssetsSettled).toHaveBeenCalledWith({ failed: [] });
    fireEvent.click(assetOf(1));
    await settle();
    expect(warnedAbout(id(1))).toBe(true);
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
  });

  // Replaces "enter animations start only after the layer's asset is ready"
  // (Tests that break): one gate per page.
  it("enter animations start only when every asset of the page is settled", async () => {
    let release: (text?: string) => Promise<void> = async () => {};
    show({ page: page([layer(1, "tree"), layer(2, "bun")], [FADE(1), FADE(2)]) }, (svgText) => {
      release = hold(svgText, "tree", "tree.svg");
    });
    await settle();
    // bun loaded (settle fires its load), the backdrop is in; tree is held.
    expect(callsOn(onceOf(2))).toHaveLength(0);
    expect(callsOn(onceOf(1))).toHaveLength(0);
    await release();
    await settle();
    expect(svgOf(1)).not.toBeNull();
    expect(callsOn(onceOf(1))).toHaveLength(1);
    expect(callsOn(onceOf(2))).toHaveLength(1);
  });

  it("a layer with an enter fade-in is hidden until enter starts", async () => {
    const p = page([layer(1, "bun"), layer(2, "bun")], [FADE(2)]);
    show({ page: p });
    expect(onceOf(2).style.opacity).toBe("0");
    expect(onceOf(1).style.opacity).toBe("");
    await settle();
    expect(onceOf(2).style.opacity).toBe("");
    cleanup();
    for (const mode of ["edit", "still"] as const) {
      show({ page: p, mode });
      expect(onceOf(2).style.opacity, mode).toBe("");
      await settle();
      expect(onceOf(2).style.opacity, mode).toBe("");
      cleanup();
    }
  });

  it("phase incoming runs loops, starts no enter, and has no tappable layer", async () => {
    const onAssetsSettled = vi.fn();
    const p = page([layer(1, "bun"), layer(2, "bun")], [FLOAT, FADE(2)], [tap(1, { action: "play_sfx", sfx: "chime" })]);
    const view = show({ page: p, phase: "incoming", onAssetsSettled });
    await settle();
    expect(animateCalls.filter(isLoop).filter(running)).toHaveLength(1);
    expect(animateCalls.filter((c) => !isLoop(c))).toHaveLength(0);
    expect(document.querySelectorAll("[role='button']")).toHaveLength(0);
    expect(document.querySelectorAll(".sv-hitbox")).toHaveLength(0);
    expect(document.querySelector(".sv-hits")).toBeNull();
    expect(assetOf(1).hasAttribute("tabindex")).toBe(false);
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(viewportEl().getAttribute("data-phase")).toBe("incoming");

    view.again({ page: p, phase: "current", onAssetsSettled });
    await settle();
    expect(opacityCalls(onceOf(2)).filter(running)).toHaveLength(1);
    expect(assetOf(1).getAttribute("role")).toBe("button");
    expect(assetOf(1).tabIndex).toBe(0);
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(viewportEl().getAttribute("data-phase")).toBe("current");
  });

  it("phase outgoing cancels loops and removes the bubble; taps do nothing", async () => {
    const onSfx = vi.fn();
    const p = page(
      [layer(1, "bun")],
      [FLOAT],
      [
        tap(
          1,
          { action: "play_sfx", sfx: "chime" },
          { action: "show_bubble", target: id(1), text: "Hi" },
          { action: "play_animation", target: id(1), primitive: "bounce" },
        ),
      ],
    );
    const view = show({ page: p, phase: "current", onSfx });
    await settle();
    fireEvent.click(assetOf(1));
    expect(onSfx).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Hi")).not.toBeNull();
    const [float] = callsOn(loopOf(1));
    const [bounce] = callsOn(onceOf(1)).filter((c) => "translate" in (c.keyframes as object));
    expect(float).toBeDefined();
    expect(bounce).toBeDefined();

    view.again({ page: p, phase: "outgoing", onSfx });
    await settle();
    expect(float?.canceled).toBe(true);
    expect(screen.queryByText("Hi")).toBeNull();
    const before = animateCalls.length;
    fireEvent.click(assetOf(1));
    await settle();
    expect(onSfx).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Hi")).toBeNull();
    expect(animateCalls).toHaveLength(before);
    expect(bounce?.canceled).toBe(false);
  });

  it("a load in outgoing starts nothing, and is kept for a later current", async () => {
    const onAssetsSettled = vi.fn();
    let release: (text?: string) => Promise<void> = async () => {};
    const p = page([layer(1, "tree")], [FADE(1)]);
    const view = show({ page: p, phase: "outgoing", onAssetsSettled }, (svgText) => {
      release = hold(svgText, "tree", "tree.svg");
    });
    await settle();
    await release();
    await settle();
    expect(svgOf(1)).not.toBeNull();
    expect(animateCalls).toHaveLength(0);
    expect(onAssetsSettled).not.toHaveBeenCalled();

    view.again({ page: p, phase: "current", onAssetsSettled });
    await settle();
    expect(opacityCalls(onceOf(1)).filter(running)).toHaveLength(1);
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
  });

  it("enter runs once per mount and page", async () => {
    const p = page([layer(1, "bun")], [FADE(1)]);
    const view = show({ page: p, phase: "current" });
    await settle();
    expect(opacityCalls(onceOf(1))).toHaveLength(1);
    view.again({ page: p, phase: "outgoing" });
    await settle();
    view.again({ page: p, phase: "current" });
    await settle();
    expect(opacityCalls(onceOf(1))).toHaveLength(1);
  });

  it("under StrictMode, enter runs and onAssetsSettled fires once", async () => {
    const onAssetsSettled = vi.fn();
    const { resolver } = makeResolver();
    render(
      <StrictMode>
        <SceneView
          page={page([layer(1, "tree"), layer(2, "bun")], [FADE(2)])}
          assets={resolver}
          mode="play"
          onAssetsSettled={onAssetsSettled}
        />
      </StrictMode>,
    );
    await settle();
    expect(opacityCalls(onceOf(2)).filter(running)).toHaveLength(1);
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
  });

  it("a failed layer asset does not block enter", async () => {
    const onAssetsSettled = vi.fn();
    // owlx: stand/sad is legal but owl-sad.svg does not load.
    show({
      page: page([layer(1, "owlx", { pose: "stand", expression: "sad" }), layer(2, "bun")], [FADE(2)]),
      onAssetsSettled,
    });
    await settle();
    expect(opacityCalls(onceOf(2)).filter(running)).toHaveLength(1);
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    const failed = onAssetsSettled.mock.calls[0]?.[0].failed as { key: string }[];
    expect(failed).toHaveLength(1);
    expect(failed[0]?.key).toBe(id(1));
  });

  it("a late image fades in for 200 ms only after a turn to current", async () => {
    // Mount with `mount` phase, then (optionally) turn to current, then release.
    async function lateCase(options: {
      held: [string, string];
      layers: Parameters<typeof page>[0];
      animations?: Animation[];
      mount: "incoming" | "current";
      reducedMotion?: boolean;
    }): Promise<void> {
      cleanup();
      animateCalls.length = 0;
      let release: (text?: string) => Promise<void> = async () => {};
      const p = page(options.layers, options.animations ?? []);
      const props = { page: p, reducedMotion: options.reducedMotion };
      const view = show({ ...props, phase: options.mount }, (svgText) => {
        release = hold(svgText, ...options.held);
      });
      await settle();
      if (options.mount === "incoming") view.again({ ...props, phase: "current" });
      await settle();
      await release();
      await settle();
    }
    const lateFades = (el: Element) =>
      opacityCalls(el).filter((c) => (c.options as KeyframeAnimationOptions | undefined)?.duration === 200);

    // A layer image after a turn to current: one 200 ms fade on .sv-layer.
    await lateCase({ held: ["tree", "tree.svg"], layers: [layer(1, "tree")], mount: "incoming" });
    expect(callsOn(layerEl(1))).toHaveLength(1);
    expect(callsOn(layerEl(1))[0]?.keyframes).toEqual({ opacity: ["0", "1"] });
    expect(callsOn(layerEl(1))[0]?.options).toMatchObject({ duration: 200 });

    // With reduced motion: no fade.
    await lateCase({ held: ["tree", "tree.svg"], layers: [layer(1, "tree")], mount: "incoming", reducedMotion: true });
    expect(callsOn(layerEl(1))).toHaveLength(0);

    // On a mount as current: no fade.
    await lateCase({ held: ["tree", "tree.svg"], layers: [layer(1, "tree")], mount: "current" });
    expect(callsOn(layerEl(1))).toHaveLength(0);

    // A layer with an enter fade-in: only its own 600 ms call.
    await lateCase({ held: ["tree", "tree.svg"], layers: [layer(1, "tree")], animations: [FADE(1)], mount: "incoming" });
    expect(callsOn(layerEl(1))).toHaveLength(0);
    expect(opacityCalls(onceOf(1))).toHaveLength(1);
    expect(opacityCalls(onceOf(1))[0]?.options).toMatchObject({ duration: 600 });

    // The backdrop: the same rule, on .sv-backdrop.
    await lateCase({ held: ["meadow", "night.svg"], layers: [layer(1, "tree")], mount: "incoming" });
    expect(lateFades(backdropEl())).toHaveLength(1);
    expect(callsOn(backdropEl())).toHaveLength(1);
    expect(callsOn(backdropEl())[0]?.keyframes).toEqual({ opacity: ["0", "1"] });
    await lateCase({ held: ["meadow", "night.svg"], layers: [layer(1, "tree")], mount: "current" });
    expect(callsOn(backdropEl())).toHaveLength(0);
  });

  it("still mode draws the picture and nothing else", async () => {
    const onSfx = vi.fn();
    const onAssetsSettled = vi.fn();
    const p = page(
      [layer(1, "pip", { pose: "stand", expression: "happy" }), layer(2, "bun")],
      [FLOAT, FADE(2)],
      [tap(1, { action: "set_pose", target: id(1), pose: "sit" }, { action: "play_sfx", sfx: "chime" })],
    );
    const still = show({ page: p, mode: "still", phase: "incoming", onSfx, onAssetsSettled, textureUrl: PAPER_URL });
    await settle();
    expect(animateCalls).toHaveLength(0);
    expect(onceOf(2).style.opacity).toBe("");
    expect(document.querySelectorAll("[role]")).toHaveLength(0);
    expect(document.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(document.querySelectorAll(".sv-hitbox")).toHaveLength(0);
    expect(document.querySelector(".sv-hits")).toBeNull();
    fireEvent.click(assetOf(1));
    await settle();
    expect(onSfx).not.toHaveBeenCalled();
    expect(document.querySelector(".sv-bubble")).toBeNull();
    expect(still.svgText).not.toHaveBeenCalledWith("pip", "sit.svg");
    expect(onAssetsSettled).toHaveBeenCalledTimes(1);
    expect(viewportEl().getAttribute("data-phase")).toBe("current");
    expect(document.querySelector(".sv-paper")).not.toBeNull();
    cleanup();

    // In play mode the same page preloads the swap file.
    const played = show({ page: p, mode: "play" });
    await settle();
    expect(played.svgText).toHaveBeenCalledWith("pip", "sit.svg");
  });

  it("a bubble stays inside the stage vertically", () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(300);
    show({
      page: page(
        [layer(1, "bun", { at: { x: 500, y: 200, scale: 0.5, z: 1 } })],
        [],
        [tap(1, { action: "show_bubble", target: id(1), text: "Up here" })],
      ),
    });
    fireEvent.click(assetOf(1));
    const bubble = screen.getByText("Up here");
    // Bottom edge = clamp(bottom, h, 1200) with h = 300 (Exact changes 7).
    expect(1200 - parseFloat(bubble.style.bottom)).toBe(300);
    expect(bubble.getAttribute("role")).toBe("status");
    expect(bubble.style.maxWidth).toBe("960px");
    expect(["", "none"]).toContain(bubble.style.borderStyle);
    expect(bubble.style.boxShadow).toBe("0 6px 0 var(--edge, #E6D5BC)");
  });
});
