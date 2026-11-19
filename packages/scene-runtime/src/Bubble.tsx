import { useLayoutEffect, useRef, useState } from "react";
import { STAGE_H, STAGE_W } from "./keyframes";

type Props = {
  text: string;
  // Stage x of the bubble centre (the target's `at.x`).
  x: number;
  // Stage y of the bubble's bottom edge.
  bottom: number;
};

// The bubble is HTML over the stage, not part of the stage image (design
// "4. Layout engine"). Proposed look; the owner judges it in #15.
export function Bubble({ text, x, bottom }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(x);

  // Centre on x, then clamp so the bubble stays inside 0..1600. offsetWidth
  // is in stage units: the stage scale is a transform on an ancestor.
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 0;
    setLeft(Math.min(Math.max(x - w / 2, 0), Math.max(STAGE_W - w, 0)));
  }, [x, text]);

  return (
    <div
      ref={ref}
      className="sv-bubble"
      style={{
        position: "absolute",
        left,
        bottom: STAGE_H - bottom,
        zIndex: 10000,
        boxSizing: "border-box",
        width: "max-content",
        maxWidth: 900,
        padding: "32px 44px",
        background: "#FFFDF7",
        border: "4px solid #EADFC6",
        borderRadius: 48,
        color: "#23354A",
        fontFamily: "Nunito, sans-serif",
        fontWeight: 700,
        fontSize: 64,
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}
