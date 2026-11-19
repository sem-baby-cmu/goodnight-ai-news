import type { Animation as SceneAnimation, PageScene, PrimitiveId } from "@storybook/dsl";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { runTap, type TapContext } from "./actions";
import { Animator } from "./animator";
import { Bubble } from "./Bubble";
import { isLoopable, type KeyframeSpec, keyframesFor, STAGE_H, STAGE_W } from "./keyframes";
import { entryFor, type LayerNodes, LayerView } from "./LayerView";
import { SKY_COLORS } from "./sky";
import type { LayerState, SceneViewProps } from "./types";
import { useReducedMotion } from "./useReducedMotion";

const BUBBLE_MS = 3000;
const BUBBLE_GAP = 24;

type BubbleState = { key: number; text: string; x: number; bottom: number };

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

// A page animation, or null when reduced motion turns it off (design
// section 5: reduced motion turns looping animations off).
function pageSpec(a: SceneAnimation, reducedMotion: boolean): KeyframeSpec | null {
  if (reducedMotion && a.trigger === "loop" && isLoopable(a.primitive)) return null;
  return keyframesFor(a.primitive, a.params, a.trigger === "loop" ? "loop" : "once");
}

export function SceneView(props: SceneViewProps) {
  const { page, assets, mode, textureUrl } = props;
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
  // Current values for the callbacks that child effects call.
  const live = useRef({ page, play, reduced, assets, onSfx: props.onSfx });
  live.current = { page, play, reduced, assets, onSfx: props.onSfx };

  const viewportRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Starts one spec on its element. Wrapper specs start now; part specs start
  // only when the layer's SVG is inserted (`onSvg` starts them then).
  const startSpec = useCallback(
    (target: string, primitive: PrimitiveId, spec: KeyframeSpec): void => {
      const layerNodes = nodes.get(target);
      if (!layerNodes) {
        console.warn(`scene-runtime: animation target ${target} is not on the stage; skipped`);
        return;
      }
      if (spec.element === "loop" || spec.element === "once") {
        animator.start(layerNodes[spec.element], primitive, spec);
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
      animator.start(part, primitive, spec);
    },
    [animator, nodes, svgs],
  );

  const register = useCallback(
    (instanceId: string, layerNodes: LayerNodes | null) => {
      if (layerNodes) nodes.set(instanceId, layerNodes);
      else nodes.delete(instanceId);
    },
    [nodes],
  );

  // A new SVG node (first load or pose swap): cancel the part animations of
  // the old node, then start the page's part animations on the new one.
  const onSvg = useCallback(
    (instanceId: string, svg: SVGSVGElement | null) => {
      const old = svgs.get(instanceId);
      if (old) animator.cancelWithin(old);
      if (!svg) {
        svgs.delete(instanceId);
        return;
      }
      svgs.set(instanceId, svg);
      const { page: current, play: playing, reduced: reducedMotion } = live.current;
      if (!playing) return;
      for (const a of current.animations) {
        if (a.target !== instanceId) continue;
        const spec = pageSpec(a, reducedMotion);
        if (spec && spec.element !== "loop" && spec.element !== "once") startSpec(a.target, a.primitive, spec);
      }
    },
    [animator, svgs, startSpec],
  );

  // Page animations: on mount and whenever the page or reduced motion changes.
  useLayoutEffect(() => {
    if (!play) return;
    for (const a of page.animations) {
      const spec = pageSpec(a, reduced);
      if (spec) startSpec(a.target, a.primitive, spec);
    }
    return () => animator.cancelAll();
  }, [page, play, reduced, animator, startSpec]);

  // Skip-and-warn cases of a layer (invariant 6).
  useEffect(() => {
    for (const l of page.layers) {
      if (!l.at) console.warn(`scene-runtime: layer ${l.instanceId} has no "at"; skipped`);
      else if (!assets.get(l.ref)) console.warn(`scene-runtime: layer ${l.instanceId} has unknown ref "${l.ref}"; skipped`);
    }
  }, [page, assets]);

  // Preload the files that a set_pose or set_expression tap would show.
  useEffect(() => {
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
        if (!entry) continue;
        if (asset.renderer === "webp") new Image().src = assets.url(layer.ref, entry.file);
        else if (asset.renderer === "svg" || asset.renderer === "svg-rig")
          assets.svgText(layer.ref, entry.file).catch(() => {});
      }
    }
  }, [page, assets]);

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
        playOnce: (target, primitive) => startSpec(target, primitive, keyframesFor(primitive, {}, "once")),
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
        onSfx,
      };
      runTap(instanceId, ctx);
    },
    [startSpec],
  );

  const tappable = new Set(play ? page.interactions.map((i) => i.on.tap) : []);

  return (
    <div
      ref={viewportRef}
      className="sv-viewport"
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
              key={layer.instanceId}
              layer={{ ...layer, at }}
              asset={asset}
              state={states.current.get(layer.instanceId) ?? {}}
              assets={assets}
              tappable={tappable.has(layer.instanceId)}
              onTap={onTap}
              register={register}
              onSvg={onSvg}
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
