import { type RefObject, useEffect, useId, useLayoutEffect, useState } from "react";
import { FRAME_H, FRAME_W } from "./frame";
import { sanitizeSvg } from "./sanitizeSvg";
import type { AssetResolver } from "./types";

type Props = {
  // The backdrop asset key and the variant file that resolveBackdrop named.
  backdrop: string;
  renderer: "svg" | "webp";
  file: string;
  url: string;
  assets: AssetResolver;
  // `.sv-backdrop`: the sanitised SVG is appended to it.
  host: RefObject<HTMLDivElement | null>;
  onReady(): void;
  onFailed(url: string, reason: string): void;
};

// The backdrop variant inside `.sv-backdrop` (#68 Exact changes 5). An SVG
// goes through sanitizeSvg and appendChild, exactly like a layer SVG
// (invariant 2). SceneView keys it by backdrop and file.
export function BackdropView({ backdrop, renderer, file, url, assets, host, onReady, onFailed }: Props) {
  const idSuffix = `bd-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const [node, setNode] = useState<SVGSVGElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (renderer !== "svg") return;
    let live = true;
    assets.svgText(backdrop, file).then(
      (text) => {
        if (!live) return;
        const svg = sanitizeSvg(text, idSuffix);
        if (!svg) {
          onFailed(url, "is not a valid SVG");
          return;
        }
        svg.setAttribute("width", String(FRAME_W));
        svg.setAttribute("height", String(FRAME_H));
        svg.style.display = "block";
        setNode(svg);
      },
      () => {
        if (live) onFailed(url, "could not be loaded");
      },
    );
    return () => {
      live = false;
    };
  }, [renderer, backdrop, file, url, assets, idSuffix, onFailed]);

  useLayoutEffect(() => {
    const parent = host.current;
    if (!node || !parent) return;
    parent.appendChild(node);
    onReady();
    return () => node.remove();
  }, [node, host, onReady]);

  if (renderer !== "webp" || failed) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      width={FRAME_W}
      height={FRAME_H}
      style={{ display: "block", width: FRAME_W, height: FRAME_H, maxWidth: "none" }}
      onLoad={onReady}
      onError={() => {
        // A network error, a non-2xx status and bytes that cannot be decoded
        // all fire `error` (HTML image loading; checked by B7).
        setFailed(true);
        onFailed(url, "could not be loaded");
      }}
    />
  );
}
