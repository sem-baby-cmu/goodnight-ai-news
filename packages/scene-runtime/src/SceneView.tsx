import type { Animation as SceneAnimation, PageScene, PrimitiveId } from "@storybook/dsl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { runTap, type TapContext } from "./actions";
import { type AnimationGroup, Animator } from "./animator";
import { BackdropView } from "./BackdropView";
import { Bubble } from "./Bubble";
import {
  BLEED,
  FRAME_H,
  FRAME_W,
  fitFrame,
  LATE_FADE_MS,
  PAPER,
  resolveBackdrop,
  TEXTURE_OPACITY,
  TEXTURE_TILE,
} from "./frame";
import { isLoopable, type KeyframeSpec, keyframesFor, STAGE_H, STAGE_W } from "./keyframes";
import { entryFor, type LayerNodes, LayerView } from "./LayerView";
import type { AssetFailure, AssetResolver, LayerState, ScenePhase, SceneViewProps } from "./types";
import { useReducedMotion } from "./useReducedMotion";

const BUBBLE_MS = 3000;
const BUBBLE_GAP = 24;

type BubbleState = { key: number; text: string; x: number; bottom: number };
type Preload = { ref: string; file: string; renderer: string };

const BACKDROP = "backdrop";
const LATE_FADE: KeyframeSpec = {
  element: "once",
  keyframes: { opacity: ["0", "1"] },
  // Easing ease-out: implementation decision (#68 Exact changes 9).
  options: { duration: LATE_FADE_MS, easing: "ease-out", iterations: 1 },
};

// The keys the load report waits for: "backdrop" and every layer that is not
// audio (#68 Exact changes 6, D68-11 (a)).
function expectedKeys(page: PageScene, assets: AssetResolver): string[] {
  const keys = [BACKDROP];
  for (const l of page.layers) if (assets.get(l.ref)?.renderer !== "audio") keys.push(l.instanceId);
  return keys;
}

// The layers the runtime cannot even request, with the reason of their
// warning. They count as failed at once, with no url (D68-11 (a)).
function unrequestable(page: PageScene, assets: AssetResolver): AssetFailure[] {
  const out: AssetFailure[] = [];
  for (const l of page.layers) {
    const asset = assets.get(l.ref);
    if (asset?.renderer === "audio") continue;
    const reason = !l.at
      ? `has no "at"`
      : !asset
        ? `has unknown ref "${l.ref}"`
        : !entryFor(asset, { pose: l.pose, expression: l.expression })
          ? `has no pose entry for "${l.pose}"`
          : null;
    if (reason) out.push({ key: l.instanceId, ref: l.ref, url: null, reason });
  }
  return out;
}

const hasEnterFade = (page: PageScene, instanceId: string) =>
  page.animations.some((a) => a.target === instanceId && a.trigger === "enter" && a.primitive === "fade-in");

function initialStates(page: PageScene): Map<string, LayerState> {
  return new Map(page.layers.map((l) => [l.instanceId, { pose: l.pose, expression: l.expression }]));
}

// Sets the part's rotation origin from `data-pivot` (implementation decision R6).
function applyPivot(part: SVGElement, instanceId: string): void {
  const pivot = part.getAttribute("data-pivot")?.trim().split(/[\s,]+/).map(Number);
  if (!pivot || pivot.length !== 2 || pivot.some((n) => !Number.isFinite(n))) {
    console.warn(`scene-runtime: layer ${instanceId}: part "${part.getAttribute("class")}" has no valid data-pivot`);
    return;
  }
  part.style.transformBox = "view-box";
  part.style.transformOrigin = `${pivot[0]}px ${pivot[1]}px`;
}

// A page loop that may run: loop trigger on a loopable primitive.
const isPageLoop = (a: SceneAnimation) => a.trigger === "loop" && isLoopable(a.primitive);
const isPart = (spec: KeyframeSpec) => spec.element !== "loop" && spec.element !== "once";
const pageKeyframes = (a: SceneAnimation) => keyframesFor(a.primitive, a.params, a.trigger === "loop" ? "loop" : "once");

// The files that a set_pose or set_expression tap would show, sorted, so the
// preload runs again only when this list changes, not on a new page object.
function preloadList(page: PageScene, assets: AssetResolver): Preload[] {
  const out = new Map<string, Preload>();
  for (const interaction of page.interactions) {
    for (const action of interaction.do) {
      if (action.action !== "set_pose" && action.action !== "set_expression") continue;
      const layer = page.layers.find((l) => l.instanceId === action.target);
      const asset = layer && assets.get(layer.ref);
      if (!layer || !asset) continue;
      const state =
        action.action === "set_pose"
          ? { pose: action.pose, expression: layer.expression }
          : { pose: layer.pose, expression: action.expression };
      const entry = entryFor(asset, state);
      if (entry) out.set(`${layer.ref}\n${entry.file}`, { ref: layer.ref, file: entry.file, renderer: asset.renderer });
    }
  }
  return [...out.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, p]) => p);
}

export function SceneView(props: SceneViewProps) {
  const { page, assets, mode, textureUrl, className } = props;
  const play = mode === "play";
  // Edit and still mode ignore `phase` (invariants 11 and 12).
  const phase: ScenePhase = play ? (props.phase ?? "current") : "current";
  const fitMode = props.fit ?? "contain";
  const reduced = useReducedMotion(props.reducedMotion);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [settledVersion, bumpSettled] = useReducer((n: number) => n + 1, 0);

  // Layer states are read and written synchronously inside one tap, so a
  // later action sees an earlier one. They reset when the page changes.
  const states = useRef<Map<string, LayerState>>(new Map());
  const statesPage = useRef<PageScene | null>(null);
  // Load report and enter gate (#68 invariants 7 to 9): keys that loaded or
  // failed for this page, the failures in settle order, and two once-flags.
  const settled = useRef(new Set<string>());
  const failures = useRef<AssetFailure[]>([]);
  const enterStarted = useRef(false);
  const reported = useRef(false);
  // Views that stay mounted across a page change do not load again, so their
  // result is carried to the new page (implementation decision).
  const layerFailures = useRef(new Map<string, AssetFailure>()).current;
  const backdropDone = useRef<{ id: string; failure: AssetFailure | null } | null>(null);
  // Layers whose asset is shown (SVG inserted or WebP loaded).
  const ready = useRef(new Set<string>()).current;

  const source = resolveBackdrop(assets, page);
  const backdropId = source.ok ? `${page.backdrop}\n${source.file}` : null;

  // Adds `key` to the settled set once; a failure is listed once per key.
  const record = (key: string, failure: AssetFailure | null): boolean => {
    if (settled.current.has(key)) return false;
    settled.current.add(key);
    if (failure) failures.current.push(failure);
    return true;
  };

  if (statesPage.current !== page) {
    const previous = statesPage.current;
    statesPage.current = page;
    states.current = initialStates(page);
    settled.current = new Set();
    failures.current = [];
    enterStarted.current = false;
    reported.current = false;
    if (!source.ok) record(BACKDROP, { key: BACKDROP, ref: page.backdrop, url: null, reason: source.reason });
    else if (backdropDone.current?.id === backdropId) record(BACKDROP, backdropDone.current.failure);
    for (const failure of unrequestable(page, assets)) record(failure.key, failure);
    for (const l of page.layers) {
      // A view with a new ref mounts again and loads again: carry nothing.
      const before = previous?.layers.find((p) => p.instanceId === l.instanceId);
      if (before?.ref !== l.ref) continue;
      if (ready.has(l.instanceId)) record(l.instanceId, null);
      const failure = layerFailures.get(l.instanceId);
      if (failure && failure.ref === l.ref) record(l.instanceId, failure);
    }
  }

  // True once the phase changed to current after mount (late fade, #68
  // Exact changes 9). Never true in edit and still mode.
  const lastPhase = useRef(phase);
  const becameCurrent = useRef(false);
  if (lastPhase.current !== phase) {
    if (phase === "current") becameCurrent.current = true;
    lastPhase.current = phase;
  }

  const animator = useRef(new Animator()).current;
  const nodes = useRef(new Map<string, LayerNodes>()).current;
  const svgs = useRef(new Map<string, SVGSVGElement>()).current;
  // Layers whose enter animations started for the current page.
  const entered = useRef(new Set<string>()).current;
  // Current values for the callbacks that child effects call.
  const current = {
    page,
    play,
    phase,
    reduced,
    assets,
    onSfx: props.onSfx,
    onAssetError: props.onAssetError,
    onAssetsSettled: props.onAssetsSettled,
  };
  const live = useRef(current);
  live.current = current;

  const viewportRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(() => fitFrame(0, 0));
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Starts one spec on its element. Part specs need the inserted SVG.
  const startSpec = useCallback(
    (target: string, primitive: PrimitiveId, group: AnimationGroup, spec: KeyframeSpec): void => {
      const layerNodes = nodes.get(target);
      if (!layerNodes) {
        console.warn(`scene-runtime: animation target ${target} is not on the stage; skipped`);
        return;
      }
      if (spec.element === "loop" || spec.element === "once") {
        animator.start(layerNodes[spec.element], primitive, group, spec);
        return;
      }
      const svg = svgs.get(target);
      if (!svg) return;
      const part = svg.querySelector<SVGElement>(`.${spec.element}`);
      if (!part) {
        console.warn(`scene-runtime: layer ${target} has no part "${spec.element}"; ${primitive} skipped`);
        return;
      }
      applyPivot(part, target);
      animator.start(part, primitive, group, spec);
    },
    [animator, nodes, svgs],
  );

  // The page's loop animations of one layer (or all layers), unless reduced
  // motion is on. `partsOnly` restarts the parts on a new SVG node.
  const startLoops = useCallback(
    (only: string | null, partsOnly: boolean) => {
      const { page: current, play: playing, phase: now, reduced: reducedMotion } = live.current;
      if (!playing || reducedMotion || now === "outgoing") return;
      for (const a of current.animations) {
        if (!isPageLoop(a) || (only !== null && a.target !== only)) continue;
        const spec = pageKeyframes(a);
        if (!partsOnly || isPart(spec)) startSpec(a.target, a.primitive, "loop", spec);
      }
    },
    [startSpec],
  );

  // The page's enter animations of one layer. The enter gate calls it once
  // per page; `partsOnly` restarts them on a new SVG node.
  const startEnter = useCallback(
    (instanceId: string, partsOnly: boolean) => {
      const { page: current, play: playing } = live.current;
      if (!playing) return;
      for (const a of current.animations) {
        if (isPageLoop(a) || a.target !== instanceId) continue;
        const spec = pageKeyframes(a);
        if (!partsOnly || isPart(spec)) startSpec(a.target, a.primitive, "enter", spec);
      }
    },
    [startSpec],
  );

  // A late image fades in when it loads after the page became current.
  const lateFade = useCallback(
    (el: Element | null | undefined, instanceId: string | null) => {
      const { page: current, play: playing, phase: now, reduced: reducedMotion } = live.current;
      if (!el || !playing || now !== "current" || !becameCurrent.current || reducedMotion) return;
      if (instanceId !== null && hasEnterFade(current, instanceId)) return;
      animator.start(el, "fade-in", "late", LATE_FADE);
    },
    [animator],
  );

  const markReady = useCallback(
    (instanceId: string) => {
      ready.add(instanceId);
      layerFailures.delete(instanceId);
      if (!settled.current.has(instanceId)) {
        settled.current.add(instanceId);
        lateFade(nodes.get(instanceId)?.root, instanceId);
        bumpSettled();
      }
    },
    [ready, layerFailures, nodes, lateFade],
  );

  const register = useCallback(
    (instanceId: string, layerNodes: LayerNodes | null) => {
      const old = nodes.get(instanceId);
      if (old && old !== layerNodes) animator.cancelWithin(old.root);
      if (layerNodes) {
        nodes.set(instanceId, layerNodes);
      } else {
        nodes.delete(instanceId);
        ready.delete(instanceId);
        layerFailures.delete(instanceId);
      }
    },
    [animator, nodes, ready, layerFailures],
  );

  // A new SVG node (first load or pose swap): cancel and drop the animations
  // of the old node, then start the page's part animations on the new one.
  const onSvg = useCallback(
    (instanceId: string, svg: SVGSVGElement | null) => {
      const old = svgs.get(instanceId);
      if (old) animator.cancelWithin(old);
      if (!svg) {
        svgs.delete(instanceId);
        ready.delete(instanceId);
        return;
      }
      svgs.set(instanceId, svg);
      startLoops(instanceId, true);
      if (entered.has(instanceId)) startEnter(instanceId, true);
      markReady(instanceId);
    },
    [animator, svgs, ready, entered, startLoops, startEnter, markReady],
  );

  const onReady = useCallback(
    (instanceId: string, isReady: boolean) => {
      if (isReady) markReady(instanceId);
      else ready.delete(instanceId);
    },
    [ready, markReady],
  );

  const onAssetFailed = useCallback(
    (instanceId: string, url: string, reason: string, shown: LayerState | undefined) => {
      console.warn(`scene-runtime: layer ${instanceId}: ${url} ${reason}; skipped`);
      live.current.onAssetError?.(instanceId, url);
      // A failed first load is a failure of the report; a failed swap is not.
      if (shown === undefined) {
        const ref = live.current.page.layers.find((l) => l.instanceId === instanceId)?.ref ?? "";
        const failure: AssetFailure = { key: instanceId, ref, url, reason };
        layerFailures.set(instanceId, failure);
        if (!settled.current.has(instanceId)) {
          settled.current.add(instanceId);
          failures.current.push(failure);
          bumpSettled();
        }
      }
      // A failed swap changes nothing (review item 3): the pose and the
      // expression go back to what is still on screen.
      const state = states.current.get(instanceId);
      if (shown && state && (state.pose !== shown.pose || state.expression !== shown.expression)) {
        states.current.set(instanceId, { ...shown });
        rerender();
      }
    },
    [layerFailures],
  );

  const onBackdropReady = useCallback(() => {
    if (backdropId) backdropDone.current = { id: backdropId, failure: null };
    if (settled.current.has(BACKDROP)) return;
    settled.current.add(BACKDROP);
    lateFade(backdropRef.current, null);
    bumpSettled();
  }, [backdropId, lateFade]);

  const onBackdropFailed = useCallback(
    (url: string, reason: string) => {
      const ref = live.current.page.backdrop;
      console.warn(`scene-runtime: backdrop ${ref}: ${url} ${reason}; paper shown`);
      const failure: AssetFailure = { key: BACKDROP, ref, url, reason };
      if (backdropId) backdropDone.current = { id: backdropId, failure };
      if (settled.current.has(BACKDROP)) return;
      settled.current.add(BACKDROP);
      failures.current.push(failure);
      bumpSettled();
    },
    [backdropId],
  );

  // A backdrop that does not resolve warns once per page (#68 Exact changes 5).
  const backdropWarned = useRef<PageScene | null>(null);
  const backdropReason = source.ok ? null : source.reason;
  useEffect(() => {
    if (backdropReason === null || backdropWarned.current === page) return;
    backdropWarned.current = page;
    console.warn(`scene-runtime: ${backdropReason}; paper shown`);
  }, [page, backdropReason]);

  // The gates of the load report and of `enter` (#68 Exact changes 6). A
  // load is recorded in every phase; it acts only in incoming or current.
  const evaluateGates = useCallback(() => {
    const { page: current, play: playing, phase: now, assets: resolver, onAssetsSettled } = live.current;
    if (!expectedKeys(current, resolver).every((key) => settled.current.has(key))) return;
    let changed = false;
    if (now !== "outgoing" && !reported.current) {
      reported.current = true;
      changed = true;
      onAssetsSettled?.({ failed: [...failures.current] });
    }
    if (playing && now === "current" && !enterStarted.current) {
      enterStarted.current = true;
      changed = true;
      for (const l of current.layers) {
        if (!ready.has(l.instanceId)) continue;
        entered.add(l.instanceId);
        startEnter(l.instanceId, false);
      }
    }
    if (changed) rerender();
  }, [ready, entered, startEnter]);

  // Page loops: on mount and whenever the page or reduced motion changes, and
  // off in phase outgoing. incoming -> current keeps them running.
  const loopsOn = phase !== "outgoing";
  // A reduced-motion change touches only the loops.
  useLayoutEffect(() => {
    startLoops(null, false);
    return () => animator.cancelGroup("loop");
  }, [page, play, loopsOn, reduced, animator, startLoops]);

  // Enter animations: once per page, when every asset is settled (the gate).
  useLayoutEffect(() => {
    enterStarted.current = false;
    entered.clear();
    evaluateGates();
    return () => {
      animator.cancelGroup("enter");
      animator.cancelGroup("tap");
    };
  }, [page, play, animator, entered, ready, markReady, evaluateGates]);

  useLayoutEffect(() => {
    evaluateGates();
  }, [page, phase, mode, settledVersion, evaluateGates]);

  // Leaving current removes the bubble (#68 Exact changes 6).
  useLayoutEffect(() => {
    if (phase === "current") return;
    clearTimeout(bubbleTimer.current);
    setBubble(null);
  }, [phase]);

  useEffect(() => () => animator.cancelAll(), [animator]);

  // Skip-and-warn cases of a layer (invariant 6).
  useEffect(() => {
    for (const l of page.layers) {
      if (!l.at) console.warn(`scene-runtime: layer ${l.instanceId} has no "at"; skipped`);
      else if (!assets.get(l.ref)) console.warn(`scene-runtime: layer ${l.instanceId} has unknown ref "${l.ref}"; skipped`);
    }
  }, [page, assets]);

  // Preload the files that a set_pose or set_expression tap would show. Not
  // in still mode (invariant 12).
  const preloadKey = JSON.stringify(preloadList(page, assets));
  useEffect(() => {
    if (mode === "still") return;
    for (const { ref, file, renderer } of JSON.parse(preloadKey) as Preload[]) {
      if (renderer === "webp") new Image().src = assets.url(ref, file);
      else assets.svgText(ref, file).catch(() => {});
    }
  }, [preloadKey, assets, mode]);

  // Frame scale and offset from the layout size of the viewport (invariant
  // 4): clientWidth and clientHeight do not change with an ancestor transform.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setBox(fitFrame(viewport.clientWidth, viewport.clientHeight, fitMode));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitMode]);

  useEffect(() => () => clearTimeout(bubbleTimer.current), []);

  const onTap = useCallback(
    (instanceId: string) => {
      const { page: current, play: playing, phase: now, assets: resolver, onSfx } = live.current;
      if (!playing || now !== "current") return;
      const asset = (target: string) => {
        const layer = current.layers.find((l) => l.instanceId === target);
        return layer ? resolver.get(layer.ref) : undefined;
      };
      const ctx: TapContext = {
        page: current,
        asset,
        getState: (target) => states.current.get(target),
        setState: (target, state) => {
          states.current.set(target, state);
          rerender();
        },
        playOnce: (target, primitive) => startSpec(target, primitive, "tap", keyframesFor(primitive, {}, "once")),
        showBubble: (target, text) => {
          const layer = current.layers.find((l) => l.instanceId === target);
          const resolved = asset(target);
          const state = states.current.get(target);
          const entry = resolved && state ? entryFor(resolved, state) : undefined;
          const at = layer?.at;
          if (!at || !entry) {
            console.warn(`scene-runtime: show_bubble target ${target} is not on the stage; skipped`);
            return;
          }
          // Bottom edge 24 stage units above the top of the target box.
          const bottom = at.y + (entry.box.y - entry.foot.y) * at.scale - BUBBLE_GAP;
          clearTimeout(bubbleTimer.current);
          setBubble((prev) => ({ key: (prev?.key ?? 0) + 1, text, x: at.x, bottom }));
          bubbleTimer.current = setTimeout(() => setBubble(null), BUBBLE_MS);
        },
        hasExpression: (target, expression) => {
          const svg = svgs.get(target);
          if (!svg) return undefined;
          return Array.from(svg.querySelectorAll("[class]")).some((el) => el.classList.contains(`expr-${expression}`));
        },
        onSfx,
      };
      runTap(instanceId, ctx);
    },
    [startSpec, svgs],
  );

  const taps = play && phase === "current";
  const tappable = useMemo(() => new Set(taps ? page.interactions.map((i) => i.on.tap) : []), [page, taps]);

  return (
    <div
      ref={viewportRef}
      className={className ? `sv-viewport ${className}` : "sv-viewport"}
      data-mode={mode}
      data-phase={phase}
      data-settled={reported.current ? "true" : "false"}
      style={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: PAPER,
        width: "100%",
        // Play and still: fill a definite parent, else 4:3 (#68 Exact changes 4).
        height: mode === "edit" ? "auto" : "100%",
        aspectRatio: "4 / 3",
      }}
    >
      <div
        className="sv-frame"
        style={{
          position: "absolute",
          left: box.x,
          top: box.y,
          width: FRAME_W,
          height: FRAME_H,
          transformOrigin: "0 0",
          transform: `scale(${box.k})`,
        }}
      >
        <div
          ref={backdropRef}
          className="sv-backdrop"
          style={{ position: "absolute", left: 0, top: 0, width: FRAME_W, height: FRAME_H, pointerEvents: "none" }}
        >
          {source.ok ? (
            <BackdropView
              key={backdropId}
              backdrop={page.backdrop}
              renderer={source.renderer}
              file={source.file}
              url={source.url}
              assets={assets}
              host={backdropRef}
              onReady={onBackdropReady}
              onFailed={onBackdropFailed}
            />
          ) : null}
        </div>
        <div
          className="sv-stage"
          style={{
            position: "absolute",
            left: BLEED,
            top: 0,
            width: STAGE_W,
            height: STAGE_H,
            overflow: "hidden",
            isolation: "isolate",
            pointerEvents: "none",
          }}
        >
          {page.layers.map((layer) => {
            const { at } = layer;
            const asset = assets.get(layer.ref);
            if (!at || !asset || asset.renderer === "audio") return null;
            return (
              <LayerView
                // A new asset on the same layer mounts a new view, so the old
                // SVG and its animations go away with the old view.
                key={`${layer.instanceId}\n${layer.ref}`}
                layer={{ ...layer, at }}
                asset={asset}
                state={states.current.get(layer.instanceId) ?? {}}
                assets={assets}
                tappable={tappable.has(layer.instanceId)}
                hidden={play && !enterStarted.current && hasEnterFade(page, layer.instanceId)}
                onTap={onTap}
                register={register}
                onSvg={onSvg}
                onReady={onReady}
                onAssetFailed={onAssetFailed}
              />
            );
          })}
        </div>
        {textureUrl ? (
          <div
            className="sv-paper"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: FRAME_W,
              height: FRAME_H,
              backgroundImage: `url(${JSON.stringify(textureUrl)})`,
              backgroundSize: `${TEXTURE_TILE}px ${TEXTURE_TILE}px`,
              backgroundRepeat: "repeat",
              backgroundPosition: "0 0",
              opacity: TEXTURE_OPACITY,
              mixBlendMode: "multiply",
              pointerEvents: "none",
            }}
          />
        ) : null}
        <div
          className="sv-overlay"
          style={{ position: "absolute", left: BLEED, top: 0, width: STAGE_W, height: STAGE_H, pointerEvents: "none" }}
        >
          {bubble ? <Bubble key={bubble.key} text={bubble.text} x={bubble.x} bottom={bubble.bottom} /> : null}
        </div>
      </div>
    </div>
  );
}
