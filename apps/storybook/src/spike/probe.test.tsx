import { expect, it } from "vitest";
import { percentile, summarize } from "./probe";

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
