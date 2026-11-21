import type { CSSProperties, ReactNode } from "react";
import { BAR, GUTTER, RAIL } from "./layout";
import type { PanelMetrics } from "./measure";

// One page sheet: a picture area and a narration panel on Paper, with a
// shade above them. During a turn there are two; the leaving one is inert.
export type FrameSheet = {
  key: string;
  // The content of the picture area (a SceneView, the night picture, or Paper).
  picture: ReactNode;
  // The content of the narration panel.
  panel: ReactNode;
  inert: boolean;
  // The turning sheet lies above the other one.
  zIndex: 1 | 2;
  ref: (el: HTMLDivElement | null) => void;
};

type FrameProps = {
  metrics: PanelMetrics;
  // In stacking order by `zIndex`, never by DOM order (a moved node loses
  // the focus).
  sheets: FrameSheet[];
  // Frame controls; null leaves the place empty.
  home: ReactNode;
  previous: ReactNode;
  next: ReactNode;
  pill: ReactNode;
};

const PADDING = { wide: { y: 20, x: 32 }, narrow: { y: 16, x: 16 }, short: { y: 12, x: 12 } } as const;

// The torn paper edge: the top 12 px of the narration panel, a Paper shape
// with an irregular top line on a strip of `--edge` (DESIGN.md 8).
const EDGE =
  "M0 4 L18 2.5 L34 4.5 L52 2 L71 3.8 L90 1.8 L112 4.2 L131 2.6 L150 4.6 L172 2.2 L193 3.9 L214 2 L236 4.4 L258 2.7 L279 4.1 L300 1.9 L322 3.7 L344 2.4 L366 4.5 L384 2.6 L400 3.6 V12 H0 Z";

function TornEdge() {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 12" preserveAspectRatio="none" className="absolute inset-x-0 top-0 block h-[12px] w-full">
      <path d={EDGE} fill="var(--edge)" />
      <path d={EDGE} fill="var(--paper)" transform="translate(0 2)" />
    </svg>
  );
}

// One placed frame control. Frame controls lie above the page panel (later
// in DOM order, higher z-index) and no ancestor clips them (invariant 11).
function Slot({ style, children }: { style: CSSProperties; children: ReactNode }) {
  if (children === null || children === undefined || children === false) return null;
  return (
    <div className="absolute z-10 flex" style={style}>
      {children}
    </div>
  );
}

// The frame of one layout (DESIGN.md 12.3): the Desk ground, the page panel
// with the page sheets (picture area, then narration panel), and the frame
// parts with their control slots. Every frame part has its full size and
// place in every state; a part with no control is empty Paper.
export function Frame({ metrics, sheets, home, previous, next, pill }: FrameProps) {
  const { layout, w, h, picture: area } = metrics;
  const pad = PADDING[layout];
  const wide = layout === "wide";
  const narrow = layout === "narrow";
  const short = layout === "short";

  const pagePanel: CSSProperties = wide
    ? { left: GUTTER, top: 0, width: w - 2 * GUTTER, height: h }
    : narrow
      ? { left: 0, top: BAR, width: w, height: area.h + metrics.panel }
      : { left: RAIL, top: 0, width: w - 2 * RAIL, height: h };

  // Wide arrows: centred on the picture area, but never above 92 px.
  const arrowTop = Math.max(92, area.h / 2 - 32);

  return (
    <>
      <div
        className={wide ? "absolute rounded-b-[28px] bg-paper" : "absolute bg-paper"}
        style={{ ...pagePanel, isolation: "isolate", perspective: "2600px" }}
      >
        {sheets.map((s) => (
          <div
            key={s.key}
            ref={s.ref}
            data-testid="page-sheet"
            inert={s.inert}
            className={wide ? "absolute inset-0 flex flex-col rounded-b-[28px] bg-paper" : "absolute inset-0 flex flex-col bg-paper"}
            style={{ zIndex: s.zIndex, transformOrigin: "0 50%" }}
          >
            {/* Its own stacking context: the layer z-index values stay inside. */}
            <div data-testid="picture-area" className="relative shrink-0" style={{ width: area.w, height: area.h, isolation: "isolate" }}>
              {s.picture}
            </div>
            <div
              data-testid="narration-panel"
              className={wide ? "relative shrink-0 rounded-b-[28px] bg-paper" : "relative shrink-0 bg-paper"}
              style={{ height: metrics.panel }}
            >
              <TornEdge />
              <div
                className="absolute inset-x-0 bottom-0 flex items-center justify-center"
                style={{ top: 12, padding: `${pad.y}px ${pad.x}px` }}
              >
                {s.panel}
              </div>
            </div>
            <div
              data-testid="sheet-shade"
              aria-hidden="true"
              className={wide ? "pointer-events-none absolute inset-0 rounded-b-[28px] bg-ink" : "pointer-events-none absolute inset-0 bg-ink"}
              style={{ opacity: 0 }}
            />
          </div>
        ))}
      </div>

      {narrow ? (
        <>
          <div data-testid="top-bar" className="absolute top-0 left-0 z-10 bg-paper" style={{ width: w, height: BAR }}>
            <Slot style={{ left: 16, top: 10 }}>{home}</Slot>
            <Slot style={{ left: 16 + 64 + 12, top: 20 }}>{pill}</Slot>
          </div>
          <div data-testid="control-row" className="absolute bottom-0 left-0 z-10 bg-paper" style={{ width: w, height: BAR }}>
            <Slot style={{ left: 16, top: 10 }}>{previous}</Slot>
            <Slot style={{ right: 16, top: 10 }}>{next}</Slot>
          </div>
        </>
      ) : null}

      {short ? (
        <>
          <div data-testid="rail-left" className="absolute top-0 left-0 z-10 bg-paper" style={{ width: RAIL, height: h }}>
            <Slot style={{ left: 12, top: 12 }}>{home}</Slot>
            <Slot style={{ left: 12, bottom: 12 }}>{previous}</Slot>
          </div>
          <div data-testid="rail-right" className="absolute top-0 right-0 z-10 bg-paper" style={{ width: RAIL, height: h }}>
            <Slot style={{ left: 0, right: 0, top: 12, justifyContent: "center" }}>{pill}</Slot>
            <Slot style={{ right: 12, bottom: 12 }}>{next}</Slot>
          </div>
        </>
      ) : null}

      {wide ? (
        <>
          <Slot style={{ left: 16, top: 16 }}>{home}</Slot>
          <Slot style={{ left: 16, top: arrowTop }}>{previous}</Slot>
          <Slot style={{ left: w - GUTTER, width: GUTTER, top: 26, justifyContent: "center" }}>{pill}</Slot>
          <Slot style={{ left: w - GUTTER + 16, top: arrowTop }}>{next}</Slot>
        </>
      ) : null}
    </>
  );
}
