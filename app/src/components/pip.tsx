import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PIP_DEFS, PIP_STAND, PIP_WAVE } from "./pip-markup.gen";

// Pip is a character, not UI (DESIGN.md section 5): Pip floats and blinks,
// and answers a tap with a jelly bounce and a wave. The drawing is Producer's
// (producer/scene/pip.py, through app/scripts/gen_pip.py). The motion is CSS
// in styles.css, so prefers-reduced-motion can turn it off.

// One wave is one breath (Producer's LOOP = 2.0 s), after a 160 ms press.
const WAVE_MS = 2160;

export function Pip({ label, className }: { label: string; className?: string }) {
  const [waving, setWaving] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A tap during a wave does nothing, so taps never stack or speed up.
  function sayHello() {
    setGreeted(true);
    if (busy.current) return;
    busy.current = true;
    setWaving(true);
    timer.current = window.setTimeout(() => {
      busy.current = false;
      setWaving(false);
    }, WAVE_MS);
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={sayHello}
      data-waving={waving ? "" : undefined}
      className={cn(
        "pip relative inline-flex aspect-[190/324] min-h-16 min-w-16 cursor-pointer touch-manipulation rounded-[22px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <span className="pip-float relative block h-full w-full">
        {/* The Lamp ring says "tap me" until the first tap. */}
        {!greeted && <span className="pip-ring" />}
        <svg
          viewBox="40 -24 190 324"
          aria-hidden="true"
          focusable="false"
          className="relative h-full w-full overflow-visible"
          dangerouslySetInnerHTML={{
            __html: `<defs>${PIP_DEFS}</defs>${waving ? PIP_WAVE : PIP_STAND}`,
          }}
        />
      </span>
    </button>
  );
}
