import { type Layer, type PoseEntry, selectPoseEntry } from "@storybook/dsl";
import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  onSvg(instanceId: string, svg: SVGSVGElement | null): void;
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
export function LayerView({ layer, asset, state, assets, tappable, onTap, register, onSvg }: Props) {
  const { instanceId, ref, at } = layer;
  const rootRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<HTMLDivElement>(null);
  const onceRef = useRef<HTMLDivElement>(null);
  const assetRef = useRef<HTMLDivElement>(null);
  const entry = entryFor(asset, state);
  const inline = asset.renderer === "svg" || asset.renderer === "svg-rig";
  const file = entry?.file;
  // The inserted SVG and the entry it shows. A pose swap keeps the old node
  // (and its foot) until the new file is ready.
  const [svg, setSvg] = useState<{ node: SVGSVGElement; entry: PoseEntry } | null>(null);

  useLayoutEffect(() => {
    register(instanceId, { root: rootRef.current!, loop: loopRef.current!, once: onceRef.current! });
    return () => register(instanceId, null);
  }, [instanceId, register]);

  useEffect(() => {
    if (!entry) console.warn(`scene-runtime: layer ${instanceId} has no pose entry for "${state.pose}"; skipped`);
  }, [entry, instanceId, state.pose]);

  useEffect(() => {
    if (!inline || !entry) return;
    let live = true;
    assets.svgText(ref, entry.file).then(
      (text) => {
        if (!live) return;
        const node = sanitizeSvg(text, instanceId);
        if (!node) {
          console.warn(`scene-runtime: layer ${instanceId}: ${ref}/${entry.file} is not a valid SVG; skipped`);
          return;
        }
        setSvg({ node, entry });
      },
      () => {
        if (live) console.warn(`scene-runtime: layer ${instanceId}: ${ref}/${entry.file} could not be loaded; skipped`);
      },
    );
    return () => {
      live = false;
    };
    // The file decides the load; `entry` is a new object per render.
  }, [inline, ref, file, instanceId, assets]);

  // Insert the sanitised node with appendChild (invariant 5).
  useLayoutEffect(() => {
    const host = assetRef.current;
    if (!svg || !host) return;
    const { node } = svg;
    // R63: an inline svg clips at its viewBox; a wave can reach past it.
    if (asset.renderer === "svg-rig") node.style.overflow = "visible";
    host.appendChild(node);
    onSvg(instanceId, node);
    return () => {
      onSvg(instanceId, null);
      node.remove();
    };
  }, [svg, asset.renderer, instanceId, onSvg]);

  // svg-rig expression: show only expr-<expression>.
  useLayoutEffect(() => {
    if (!svg || asset.renderer !== "svg-rig" || state.expression === undefined) return;
    const show = `expr-${state.expression}`;
    for (const el of Array.from(svg.node.querySelectorAll<SVGElement>("[class]"))) {
      const classes = Array.from(el.classList);
      if (!classes.some((c) => c.startsWith("expr-"))) continue;
      if (classes.includes(show)) el.style.removeProperty("display");
      else el.style.display = "none";
    }
  }, [svg, asset.renderer, state.expression]);

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
            {asset.renderer === "webp" && entry ? (
              <img
                src={assets.url(ref, entry.file)}
                alt=""
                draggable={false}
                style={{ display: "block", maxWidth: "none", width: "auto", height: "auto" }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
