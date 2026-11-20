import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HouseIcon } from "./icons";
import type { LayoutName } from "./layout";
import { gateClass } from "./StartGate";

// The Resting picture: the `night` palette of DESIGN.md 2 with three hills
// and Moon stars, drawn by the Player (no request). It fills the whole
// picture area.
export function NightPicture() {
  const stars = [
    [90, 70, 9],
    [210, 40, 6],
    [300, 95, 8],
    [420, 55, 10],
    [520, 110, 6],
    [610, 45, 8],
    [700, 90, 7],
    [150, 140, 5],
    [560, 170, 5],
  ];
  return (
    <svg aria-hidden="true" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="block size-full">
      <rect width="800" height="450" fill="#2F4066" />
      {stars.map(([x, y, r]) => (
        <path
          key={`${x}-${y}`}
          fill="#F4D98A"
          transform={`translate(${x} ${y}) scale(${r! / 10})`}
          d="M0-10 2.6-3.6 9.5-3.1 4.2 1.4 5.9 8.1 0 4.4-5.9 8.1-4.2 1.4-9.5-3.1-2.6-3.6Z"
        />
      ))}
      <path fill="#3D5A5E" d="M0 300 Q160 220 330 280 T640 250 T800 270 V450 H0Z" />
      <path fill="#344E4B" d="M0 350 Q200 290 400 340 T800 320 V450 H0Z" />
      <path fill="#2D443F" d="M0 400 Q240 360 480 395 T800 385 V450 H0Z" />
    </svg>
  );
}

type RestingProps = { layout: LayoutName; w: number; onHome: () => void; homeRef?: Ref<HTMLButtonElement> };

// The panel of the Resting state (DESIGN.md 12.2): the line and Home.
export function Resting({ layout, w, onHome, homeRef }: RestingProps) {
  return (
    <div className={gateClass(layout, w)}>
      <p className={cn("leading-[1.3] font-semibold text-ink", layout === "short" ? "text-[22px]" : "text-[28px]")}>
        This book is sleeping. Come back soon.
      </p>
      <Button ref={homeRef} size="child" onClick={onHome}>
        <HouseIcon />
        Home
      </Button>
    </div>
  );
}
