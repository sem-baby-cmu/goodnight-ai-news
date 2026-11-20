// Nearest-rank percentile: the value at rank ceil(p * n) in the sorted list.
export function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(p * s.length) - 1)]!;
}

export function summary(values: number[]) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}
