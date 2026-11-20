import { useLayoutEffect, useRef, useState } from "react";
import { STAGE_H, STAGE_W } from "./keyframes";

type Props = {
  text: string;
  // Stage x of the bubble centre (the target's `at.x`).
  x: number;
  // Stage y of the bubble's bottom edge.
  bottom: number;
};

// The bubble is HTML in the stage overlay, not part of the stage image
// (design "5", ADR 0017 decision 16). Values in stage units: DESIGN.md 12.3
// "Bubble on a stage". No tail (D68-5).
export function Bubble({ text, x, bottom }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, bottom });

  // Centre on x and clamp inside 0..1600 across; keep the whole bubble inside
  // 0..1200 down. offsetWidth and offsetHeight are in stage units: the frame
  // scale is a transform on an ancestor.
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 0;
    const h = ref.current?.offsetHeight ?? 0;
    setPlace({
      left: Math.min(Math.max(x - w / 2, 0), Math.max(STAGE_W - w, 0)),
      bottom: Math.min(Math.max(bottom, h), STAGE_H),
    });
  }, [x, bottom, text]);

  return (
    <div
      ref={ref}
      className="sv-bubble"
      role="status"
      style={{
        position: "absolute",
        left: place.left,
        bottom: STAGE_H - place.bottom,
        boxSizing: "border-box",
        width: "max-content",
        maxWidth: 960,
        padding: "32px 44px",
        background: "var(--card, #FFFDF8)",
        border: "none",
        boxShadow: "0 6px 0 var(--edge, #E6D5BC)",
        borderRadius: 48,
        color: "var(--ink, #3A2E25)",
        fontFamily: "'Baloo 2', ui-rounded, system-ui, sans-serif",
        fontWeight: 700,
        fontSize: 64,
        lineHeight: 1.3,
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}
