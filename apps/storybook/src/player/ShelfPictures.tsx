import { NightPicture } from "./Resting";

// The ground of the shelf: the `day` palette of DESIGN.md 2 with the three
// hills of NightPicture and no stars, drawn by the Player (no request).
export function DayPicture() {
  return (
    <svg aria-hidden="true" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="block size-full">
      <rect width="800" height="450" fill="#CFE6EE" />
      <path fill="#C9DE9E" d="M0 300 Q160 220 330 280 T640 250 T800 270 V450 H0Z" />
      <path fill="#A3CB6E" d="M0 350 Q200 290 400 340 T800 320 V450 H0Z" />
      <path fill="#8DBC5C" d="M0 400 Q240 360 480 395 T800 385 V450 H0Z" />
    </svg>
  );
}

// The 64 px round sign of the Empty (day) and Failed (night) plates.
export function Sign({ kind }: { kind: "day" | "night" }) {
  return (
    <div aria-hidden="true" className="size-[64px] shrink-0 overflow-hidden rounded-full">
      {kind === "day" ? <DayPicture /> : <NightPicture />}
    </div>
  );
}
