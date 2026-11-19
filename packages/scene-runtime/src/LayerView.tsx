import { type Layer, type PoseEntry, selectPoseEntry } from "@storybook/dsl";
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { sanitizeSvg } from "./sanitizeSvg";
import type { AssetResolver, LayerState, ResolvedAsset } from "./types";

export type LayerNodes = { root: HTMLElement; loop: HTMLElement; once: HTMLElement };

type Props = {
  layer: Layer & { at: NonNullable<Layer["at"]> };
  asset: ResolvedAsset;
  state: LayerState;
  assets: AssetResolver;
  tappable: boolean;
  onTap(instanceId: string): void;
  register(instanceId: string, nodes: LayerNodes | null): void;
  // A new inlined SVG node (or null when it is removed). Inserting it makes
  // the layer ready.
  onSvg(instanceId: string, svg: SVGSVGElement | null): void;
  // The WebP image loaded (ready) or is about to change (not ready).
  onReady(instanceId: string, ready: boolean): void;
  // The asset failed. `shown` is the state of the asset still on screen, if
  // any (a failed swap); undefined on a failed first load.
  onAssetFailed(instanceId: string, url: string, reason: string, shown: LayerState | undefined): void;
};

const ORIGIN: CSSProperties = { transformOrigin: "0 0", pointerEvents: "none" };

// The pose entry a layer state shows (implementation decision R8).
export function entryFor(asset: ResolvedAsset, state: LayerState): PoseEntry | undefined {
  return asset.renderer === "svg-rig"
    ? selectPoseEntry(asset.manifest, state.pose)
    : selectPoseEntry(asset.manifest, state.pose, state.expression);
}

// One layer in the DOM shape of invariant 2:
// .sv-layer > .sv-loop > .sv-once > .sv-asset > img | svg
// SceneView keys it by instanceId and ref, so a new asset mounts a new view.
export function LayerView(props: Props) {
  const { layer, asset, state, assets, tappable, onTap, register, onSvg, onReady, onAssetFailed } = props;
  const { instanceId, ref, at } = layer;
  // Ids inside the SVG are unique per mount, also across two SceneViews of
  // one page in one document.
  const idSuffix = `${instanceId}-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<HTMLDivElement>(null);
  const onceRef = useRef<HTMLDivElement>(null);
  const assetRef = useRef<HTMLDivElement>(null);
  const entry = entryFor(asset, state);
  // Effects depend on the renderer string, not on the asset object: the
  // resolver may return a new object on every render.
  const renderer = asset.renderer;
  const inline = renderer === "svg" || renderer === "svg-rig";
  const file = entry?.file;
  // The inserted SVG and the entry it shows. A pose swap keeps the old node
  // (and its foot) until the new file is ready, and keeps it if the new file
  // fails.
  const [svg, setSvg] = useState<{ node: SVGSVGElement; entry: PoseEntry } | null>(null);
  // The layer state of the asset on screen (set when a file is shown), and
  // the current state. A failed swap goes back to the state on screen. On
  // svg-rig the expression is not part of the file, so it stays current.
  const shownState = useRef<LayerState | undefined>(undefined);
  const stateNow = useRef(state);
  stateNow.current = state;
  const shownNow = (): LayerState | undefined =>
    shownState.current && renderer === "svg-rig"
      ? { ...shownState.current, expression: stateNow.current.expression }
      : shownState.current;
  // WebP: the last URL that loaded, and the URL that failed.
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  // svg-rig expressions without a group in the file, warned once each.
  const missingWarned = useRef(new Set<string>());
  const showExpression = (node: SVGSVGElement) => {
    const expression = stateNow.current.expression;
    if (applyExpression(node, renderer, expression) || expression === undefined) return;
    if (missingWarned.current.has(expression)) return;
    missingWarned.current.add(expression);
    console.warn(`scene-runtime: layer ${instanceId} has no group for expression "${expression}"; left as authored`);
  };

  useLayoutEffect(() => {
    register(instanceId, { root: rootRef.current!, loop: loopRef.current!, once: onceRef.current! });
    return () => register(instanceId, null);
  }, [instanceId, register]);

  useEffect(() => {
    if (!entry) console.warn(`scene-runtime: layer ${instanceId} has no pose entry for "${state.pose}"; skipped`);
  }, [entry, instanceId, state.pose]);

  // Load and sanitise the SVG file. The file decides the load.
  useEffect(() => {
    if (!inline || !entry || svg?.entry.file === entry.file) return;
    let live = true;
    const url = assets.url(ref, entry.file);
    const fail = (reason: string) => {
      if (live) onAssetFailed(instanceId, url, reason, shownNow());
    };
    const loading = { pose: state.pose, expression: state.expression };
    assets.svgText(ref, entry.file).then((text) => {
      if (!live) return;
      const node = sanitizeSvg(text, idSuffix);
      if (!node) {
        fail("is not a valid SVG");
        return;
      }
      shownState.current = loading;
      setSvg({ node, entry });
    }, () => fail("could not be loaded"));
    return () => {
      live = false;
    };
    // `entry`, `state` and `svg` are read for the file only, so they are not deps.
  }, [inline, ref, file, instanceId, assets, idSuffix, onAssetFailed]);

  // Insert the sanitised node with appendChild (invariant 5).
  useLayoutEffect(() => {
    const host = assetRef.current;
    if (!svg || !host) return;
    const { node } = svg;
    // R63: an inline svg clips at its viewBox; a wave can reach past it.
    if (renderer === "svg-rig") node.style.overflow = "visible";
    host.appendChild(node);
    showExpression(node);
    onSvg(instanceId, node);
    return () => {
      onSvg(instanceId, null);
      node.remove();
    };
    // The expression effect below follows later expression changes.
  }, [svg, renderer, instanceId, onSvg]);

  // svg-rig expression changes after insertion.
  useLayoutEffect(() => {
    if (svg) showExpression(svg.node);
    // showExpression reads the current state through a ref.
  }, [svg, renderer, state.expression]);

  // A new WebP file is not ready until it loads.
  useLayoutEffect(() => {
    if (asset.renderer !== "webp") return;
    onReady(instanceId, false);
  }, [asset.renderer, file, instanceId, onReady]);

  const shown = inline ? (svg?.entry ?? entry) : entry;
  const s = at.scale;
  const sx = layer.flip ? -s : s;
  const assetStyle: CSSProperties = {
    transformOrigin: "0 0",
    transform: shown ? `scale(${sx}, ${s}) translate(${-shown.foot.x}px, ${-shown.foot.y}px)` : undefined,
    pointerEvents: tappable ? "auto" : "none",
    ...(tappable ? { cursor: "pointer", touchAction: "manipulation" } : {}),
  };
  const tapProps = tappable
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": ref,
        onClick: () => onTap(instanceId),
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onTap(instanceId);
        },
      }
    : {};
  const imageUrl = asset.renderer === "webp" && entry ? assets.url(ref, entry.file) : null;

  return (
    <div
      ref={rootRef}
      className="sv-layer"
      data-instance-id={instanceId}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: `translate(${at.x}px, ${at.y}px)`,
        zIndex: at.z,
        pointerEvents: "none",
      }}
    >
      <div ref={loopRef} className="sv-loop" style={ORIGIN}>
        <div ref={onceRef} className="sv-once" style={ORIGIN}>
          <div ref={assetRef} className="sv-asset" style={assetStyle} {...tapProps}>
            {imageUrl && failedImage !== imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                style={{ display: "block", maxWidth: "none", width: "auto", height: "auto" }}
                onLoad={() => {
                  shownState.current = { pose: state.pose, expression: state.expression };
                  setLoadedImage(imageUrl);
                  onReady(instanceId, true);
                }}
                onError={() => {
                  // A failed swap goes back to the image on screen; a failed
                  // first load leaves the layer empty.
                  setFailedImage(imageUrl);
                  onAssetFailed(instanceId, imageUrl, "could not be loaded", loadedImage ? shownNow() : undefined);
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// svg-rig expression (R64): every expr-* element gets an explicit inline
// value, "inline" for the chosen expression and "none" for the others.
// Clearing it would leave an authored display="none" attribute in force.
// Without an expression, or when the file has no group for it, the SVG stays
// as it is (never all groups hidden). Returns false in that second case.
function applyExpression(node: SVGSVGElement, renderer: ResolvedAsset["renderer"], expression: string | undefined): boolean {
  if (renderer !== "svg-rig" || expression === undefined) return true;
  const show = `expr-${expression}`;
  const groups = Array.from(node.querySelectorAll<SVGElement>("[class]")).filter((el) =>
    Array.from(el.classList).some((c) => c.startsWith("expr-")),
  );
  if (!groups.some((el) => el.classList.contains(show))) return false;
  for (const el of groups) el.style.display = el.classList.contains(show) ? "inline" : "none";
  return true;
}
