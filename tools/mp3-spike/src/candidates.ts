// The candidate list (issue #69, exact change 3, measured rows).
export type CandidateId = "breezy-lamejs" | "lamejs" | "wasm-media-encoders" | "shine.js";

export const CANDIDATES: { id: CandidateId; pkg: string; version: string; notUsable?: string }[] = [
  { id: "breezy-lamejs", pkg: "@breezystack/lamejs", version: "1.2.7" },
  { id: "lamejs", pkg: "lamejs", version: "1.2.1" },
  { id: "wasm-media-encoders", pkg: "wasm-media-encoders", version: "0.7.0" },
  {
    id: "shine.js",
    pkg: "shine.js",
    version: "0.0.3",
    notUsable:
      'not usable: npm package shine.js 0.0.3 is a CSS shadow library ("A library for pretty shadows"), not the shine MP3 encoder; it has no PCM-to-MP3 API',
  },
];

export const BITRATES = [32, 48, 64] as const;
export const DURATIONS = [15, 60] as const;
export const RATE = 24000;
