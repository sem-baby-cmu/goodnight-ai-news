import { afterEach, expect, it, vi } from "vitest";
import { percentile, runProbe, summarize } from "./probe";

it("percentile uses nearest rank", () => {
  const sorted = [10, 20, 30, 40];
  expect(percentile(sorted, 95)).toBe(40);
  expect(percentile(sorted, 50)).toBe(20);
  expect(percentile([7], 95)).toBe(7);
  expect(percentile([7], 50)).toBe(7);
});

it("summarize counts frames over 33.4 ms", () => {
  // Unsorted on purpose: summarize sorts. 33.4 itself is not over.
  const deltas = [16.7, 33.4, 33.5, 50, 16.6, 100, 16.7, 16.7, 16.7, 16.7];
  const s = summarize(deltas);
  expect(s.n).toBe(10);
  expect(s.over33).toBe(3);
  expect(s.max).toBe(100);
  expect(s.p50).toBe(16.7);
  expect(s.p95).toBe(100);
  expect(s.p99).toBe(100);
});

it("summarize of no frames is an explicit empty result", () => {
  expect(summarize([])).toEqual({ n: 0, p50: null, p95: null, p99: null, max: null, over33: 0 });
});

// A manual animation-frame clock: `frame(t)` runs the queued callbacks at time t.
function fakeFrames() {
  let queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => queue.push(cb));
  vi.spyOn(performance, "now").mockReturnValue(0);
  return (t: number) => {
    const run = queue;
    queue = [];
    for (const cb of run) cb(t);
  };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setVisibility("visible");
});

it("runProbe resolves with no samples when the window ends before a second frame", async () => {
  const frame = fakeFrames();
  const done = runProbe({ warmupMs: 0, windowMs: 10 });
  frame(100);
  const result = await done;
  expect(result.n).toBe(0);
  expect(result.p95).toBeNull();
  expect(result.hidden).toBe(false);
});

it("runProbe marks the run hidden when the page was hidden during the run", async () => {
  const frame = fakeFrames();
  const done = runProbe({ warmupMs: 0, windowMs: 50 });
  frame(0);
  frame(16);
  setVisibility("hidden");
  setVisibility("visible");
  frame(33);
  frame(100);
  const result = await done;
  expect(result.hidden).toBe(true);
  expect(result.n).toBeGreaterThan(0);
});

it("runProbe marks the run hidden when the page is hidden at the start", async () => {
  setVisibility("hidden");
  const frame = fakeFrames();
  const done = runProbe({ warmupMs: 0, windowMs: 10 });
  frame(0);
  frame(100);
  expect((await done).hidden).toBe(true);
});

it("runProbe of a visible run is not hidden", async () => {
  const frame = fakeFrames();
  const done = runProbe({ warmupMs: 0, windowMs: 10 });
  frame(0);
  frame(16);
  frame(100);
  const result = await done;
  expect(result.hidden).toBe(false);
  expect(result.n).toBeGreaterThan(0);
});
