import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlayIcon } from "./icons";
import type { LayoutName } from "./layout";

// The form of the panel content of the Start gate and Resting: a stack, or
// one row in Short with `w` >= 640 (DESIGN.md 12.2).
export function gateClass(layout: LayoutName, w: number): string {
  if (layout === "short" && w >= 640) return "flex flex-row items-center justify-center gap-4 text-left";
  return cn("flex flex-col items-center justify-center text-center", layout === "narrow" || layout === "short" ? "gap-3" : "gap-4");
}

const WAIT_DELAYS = [0, 300, 600];

// The three waiting dots of Loading and of the shelf in Waiting.
export function WaitingDots() {
  return (
    <div className="flex gap-2" aria-hidden="true">
      {WAIT_DELAYS.map((delay) => (
        <span
          key={delay}
          className="size-[10px] rounded-full bg-teal-deep opacity-30 motion-safe:animate-[player-wait_1.8s_ease-in-out_infinite]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

type StartGateProps = {
  layout: LayoutName;
  w: number;
  // null while the book loads (Loading).
  title: string | null;
  onStart: () => void;
  startRef?: Ref<HTMLButtonElement>;
};

// The panel of Loading and Ready (DESIGN.md 12.2).
export function StartGate({ layout, w, title, onStart, startRef }: StartGateProps) {
  const short = layout === "short";
  return (
    <div className={gateClass(layout, w)}>
      {title === null ? (
        <div className={cn("flex flex-col items-center", short ? "gap-2" : "gap-3")}>
          <p className={cn("leading-[1.3] font-semibold text-ink", short ? "text-[22px]" : "text-[28px]")}>Opening the book</p>
          <WaitingDots />
        </div>
      ) : (
        <h1
          className={cn(
            "line-clamp-2 leading-[1.1] font-extrabold text-ink",
            layout === "wide" ? "text-[40px]" : "text-[28px]",
            short && w >= 640 ? "min-w-0 flex-1" : "max-w-full",
          )}
        >
          {title}
        </h1>
      )}
      <Button
        ref={startRef}
        size="child-start"
        aria-label="Start the story"
        disabled={title === null}
        focusableWhenDisabled
        onClick={onStart}
      >
        <PlayIcon />
        Start
      </Button>
    </div>
  );
}
