import type { Animation as SceneAnimation, PageScene, PrimitiveId } from "@storybook/dsl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { runTap, type TapContext } from "./actions";
import { type AnimationGroup, Animator } from "./animator";
import { Bubble } from "./Bubble";
import { isLoopable, type KeyframeSpec, keyframesFor, STAGE_H, STAGE_W } from "./keyframes";
import { entryFor, type LayerNodes, LayerView } from "./LayerView";
import { SKY_COLORS } from "./sky";
import type { AssetResolver, LayerState, SceneViewProps } from "./types";
import { useReducedMotion } from "./useReducedMotion";

const BUBBLE_MS = 3000;
const BUBBLE_GAP = 24;

type BubbleState = { key: number; text: string; x: number; bottom: number };
type Preload = { ref: string; file: string; renderer: string };

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
  const reduced = useReducedMotion(props.reducedMotion);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // Layer states are read and written synchronously inside one tap, so a
  // later action sees an earlier one. They reset when the page changes.
  const states = useRef<Map<string, LayerState>>(new Map());
  const statesPage = useRef<PageScene | null>(null);
  if (statesPage.current !== page) {
    statesPage.current = page;
    states.current = initialStates(page);
  }

  const animator = useRef(new Animator()).current;
  const nodes = useRef(new Map<string, LayerNodes>()).current;
  const svgs = useRef(new Map<string, SVGSVGElement>()).current;
  // Layers whose asset is shown (SVG inserted or WebP loaded).
  const ready = useRef(new Set<string>()).current;
  // Layers whose enter animations started for the current page.
  const entered = useRef(new Set<string>()).current;
  // Current values for the callbacks that child effects call.
  const live = useRef({ page, play, reduced, assets, onSfx: props.onSfx, onAssetError: props.onAssetError });
  live.current = { page, play, reduced, assets, onSfx: props.onSfx, onAssetError: props.onAssetError };

  const viewportRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
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
      const { page: current, play: playing, reduced: reducedMotion } = live.current;
      if (!playing || reducedMotion) return;
      for (const a of current.animations) {
        if (!isPageLoop(a) || (only !== null && a.target !== only)) continue;
        const spec = pageKeyframes(a);
        if (!partsOnly || isPart(spec)) startSpec(a.target, a.primitive, "loop", spec);
      }
    },
    [startSpec],
  );

  // The page's enter animations of one layer: once per page, after the
  // layer's asset is ready. `partsOnly` restarts them on a new SVG node.
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

  const markReady = useCallback(
    (instanceId: string) => {
      ready.add(instanceId);
      if (!live.current.play || entered.has(instanceId)) return;
      entered.add(instanceId);
      startEnter(instanceId, false);
    },
    [ready, entered, startEnter],
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
      }
    },
    [animator, nodes, ready],
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
    (instanceId: string, url: string, reason: string, shownPose: string | undefined) => {
      console.warn(`scene-runtime: layer ${instanceId}: ${url} ${reason}; skipped`);
      live.current.onAssetError?.(instanceId, url);
      // A failed pose swap changes nothing: the state goes back to the pose
      // that is still on screen.
      const state = states.current.get(instanceId);
      if (shownPose !== undefined && state && state.pose !== shownPose) {
        states.current.set(instanceId, { ...state, pose: shownPose });
        rerender();
      }
    },
    [],
  );

  // Page loops: on mount and whenever the page or reduced motion changes.
  // A reduced-motion change touches only the loops.
  useLayoutEffect(() => {
    startLoops(null, false);
    return () => animator.cancelGroup("loop");
  }, [page, play, reduced, animator, startLoops]);

  // Enter animations: once per page, for each layer when its asset is ready.
  useLayoutEffect(() => {
    entered.clear();
    for (const instanceId of ready) markReady(instanceId);
    return () => {
      animator.cancelGroup("enter");
      animator.cancelGroup("tap");
    };
  }, [page, play, animator, entered, ready, markReady]);

  useEffect(() => () => animator.cancelAll(), [animator]);

  // Skip-and-warn cases of a layer (invariant 6).
  useEffect(() => {
    for (const l of page.layers) {
      if (!l.at) console.warn(`scene-runtime: layer ${l.instanceId} has no "at"; skipped`);
      else if (!assets.get(l.ref)) console.warn(`scene-runtime: layer ${l.instanceId} has unknown ref "${l.ref}"; skipped`);
    }
  }, [page, assets]);

  // Preload the files that a set_pose or set_expression tap would show.
  const preloadKey = JSON.stringify(preloadList(page, assets));
  useEffect(() => {
    for (const { ref, file, renderer } of JSON.parse(preloadKey) as Preload[]) {
      if (renderer === "webp") new Image().src = assets.url(ref, file);
      else assets.svgText(ref, file).catch(() => {});
    }
  }, [preloadKey, assets]);

  // Stage scale k = viewport width / 1600.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setK(viewport.getBoundingClientRect().width / STAGE_W);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(bubbleTimer.current), []);

  const onTap = useCallback(
    (instanceId: string) => {
      const { page: current, play: playing, assets: resolver, onSfx } = live.current;
      if (!playing) return;
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

  const tappable = useMemo(() => new Set(play ? page.interactions.map((i) => i.on.tap) : []), [page, play]);

  return (
    <div
      ref={viewportRef}
      className={className ? `sv-viewport ${className}` : "sv-viewport"}
      style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", overflow: "hidden" }}
    >
      <div
        className="sv-stage"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: STAGE_W,
          height: STAGE_H,
          transformOrigin: "0 0",
          transform: `scale(${k})`,
          background: SKY_COLORS[page.sky],
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
              onTap={onTap}
              register={register}
              onSvg={onSvg}
              onReady={onReady}
              onAssetFailed={onAssetFailed}
            />
          );
        })}
        {textureUrl ? (
          <img
            className="sv-paper"
            src={textureUrl}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: STAGE_W,
              height: STAGE_H,
              objectFit: "cover",
              mixBlendMode: "multiply",
              pointerEvents: "none",
              zIndex: 9999,
            }}
          />
        ) : null}
        {bubble ? <Bubble key={bubble.key} text={bubble.text} x={bubble.x} bottom={bubble.bottom} /> : null}
      </div>
    </div>
  );
}
