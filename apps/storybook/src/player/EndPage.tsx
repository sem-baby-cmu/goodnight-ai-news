import type { PageScene } from "@storybook/dsl";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RoundArrowIcon } from "./icons";
import type { LayoutName } from "./layout";

// The picture of the end page: the backdrop of the last page in its sky,
// without layers (DESIGN.md 12.5). It loads no new file.
export function endScene(scene: PageScene): PageScene {
  return { ...scene, layers: [], animations: [], interactions: [] };
}

type EndPanelProps = {
  layout: LayoutName;
  w: number;
  onReadAgain: () => void;
  readAgainRef: Ref<HTMLButtonElement>;
};

// The panel of the end page (DESIGN.md 12.5): "The end" and "Read again",
// 16 px apart in a stack; in Short one row 16 px apart when `w` >= 640, a
// stack 12 px apart when `w` < 640.
export function EndPanel({ layout, w, onReadAgain, readAgainRef }: EndPanelProps) {
  const short = layout === "short";
  return (
    <div
      className={
        short && w >= 640
          ? "flex flex-row items-center justify-center gap-4"
          : cn("flex flex-col items-center justify-center text-center", short ? "gap-3" : "gap-4")
      }
    >
      <p className={cn("font-extrabold text-ink", short ? "text-[28px]/[1.1]" : "text-[40px]/[1.1]")}>The end</p>
      <Button ref={readAgainRef} size="child" onClick={onReadAgain}>
        <RoundArrowIcon />
        Read again
      </Button>
    </div>
  );
}
