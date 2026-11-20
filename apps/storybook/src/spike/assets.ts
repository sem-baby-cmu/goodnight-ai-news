// The 5 assets of the S1 spike and their versions (issue #15). Used by the
// browser resolver and by `scripts/copy-spike-assets.ts`, so this file has
// no imports.
// `meadow` is the backdrop of every spike page (ADR 0016); #67 builds it.
export const SPIKE_ASSETS = { pip: 2, cow: 1, tree: 1, fence: 1, toolbox: 1, meadow: 1 } as const;

export type SpikeRef = keyof typeof SPIKE_ASSETS;

export const SPIKE_ASSETS_BASE = "/spike-assets";

// The generated test texture (implementation decision R28).
export const SPIKE_TEXTURE_URL = `${SPIKE_ASSETS_BASE}/spike/paper-test.webp`;
