import { cn } from "@/lib/utils";
import type { NarrationSize } from "./layout";

type ReadingPanelProps = { text: string; size: NarrationSize; width: number };

// The narration of the reading page. It fades in once, at "Start" (the
// 200 ms panel swap of DESIGN.md 5); a page change only changes the text.
export function ReadingPanel({ text, size, width }: ReadingPanelProps) {
  return (
    <p
      data-testid="narration"
      aria-live="polite"
      className="text-center font-semibold text-ink motion-safe:animate-[player-fade-in_200ms_ease-out]"
      style={{ fontSize: size.px, lineHeight: size.lh, width, maxWidth: "100%", textWrap: "pretty" }}
    >
      {text}
    </p>
  );
}

type PillProps = { index: number; count: number; dots: boolean };

// The progress pill: a status, not a control (DESIGN.md 12.3). The dots
// show only in Narrow.
export function ProgressPill({ index, count, dots }: PillProps) {
  return (
    <div
      role="status"
      aria-label={`Page ${index + 1} of ${count}`}
      className="pointer-events-none inline-flex h-[44px] items-center gap-3 rounded-full bg-card px-4 text-[18px] leading-none font-extrabold whitespace-nowrap text-ink tabular-nums shadow-[0_3px_0_var(--edge)]"
    >
      <span>
        {index + 1} / {count}
      </span>
      {dots ? (
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 rounded-full",
                i === index ? "w-[22px] bg-teal-deep" : "w-2",
                i < index && "bg-teal",
                i > index && "bg-dot-ahead shadow-[inset_0_0_0_2px_var(--ink-3)]",
              )}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}
