// Frame-time and load measurement for the S1 spike. It measures main-thread
// frame pacing only: `requestAnimationFrame` intervals do not show frames that
// are dropped on the compositor thread (issue #15, invariant 4).

// Nearest rank: `sorted` is ascending, `p` is 0 to 100.
export function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length))) - 1;
  return sorted[index] as number;
}

export type FrameSummary = { n: number; p50: number; p95: number; p99: number; max: number; over33: number };

// A frame is over when its interval is more than 33.4 ms.
export const OVER_MS = 33.4;

export function summarize(deltas: number[]): FrameSummary {
  const sorted = [...deltas].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] as number,
    over33: sorted.filter((d) => d > OVER_MS).length,
  };
}

// The latest `responseEnd` of a spike file, in ms from navigation start. `null`
// when no spike file was requested.
export function assetLoadMs(): number | null {
  const ends = performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/spike-assets/"))
    .map((entry) => (entry as PerformanceResourceTiming).responseEnd);
  return ends.length === 0 ? null : Math.max(...ends);
}

export type ProbeResult = FrameSummary & {
  assetLoadMs: number | null;
  ua: string;
  dpr: number;
  screen: string;
};

// Waits `warmupMs`, then records the interval between consecutive animation
// frames for `windowMs`. Call it after the first `SceneView` paint.
export function runProbe(opts: { warmupMs: number; windowMs: number }): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const deltas: number[] = [];
    let previous: number | undefined;
    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= opts.warmupMs) {
        if (previous !== undefined) deltas.push(now - previous);
        previous = now;
      }
      if (elapsed < opts.warmupMs + opts.windowMs) {
        requestAnimationFrame(tick);
        return;
      }
      resolve({
        ...summarize(deltas),
        assetLoadMs: assetLoadMs(),
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        screen: `${window.screen.width}x${window.screen.height}`,
      });
    };
    requestAnimationFrame(tick);
  });
}
