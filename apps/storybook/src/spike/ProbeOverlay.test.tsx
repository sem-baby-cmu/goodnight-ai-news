import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ProbeOverlay } from "./ProbeOverlay";
import type { ProbeResult } from "./probe";

afterEach(cleanup);

const base: ProbeResult = {
  n: 1200,
  p50: 16.7,
  p95: 20.1,
  p99: 30,
  max: 41,
  over33: 2,
  assetLoadMs: 800,
  ua: "test",
  dpr: 3,
  screen: "390x844",
  hidden: false,
};

it("overlay shows a numeric p95 for a valid run", () => {
  render(<ProbeOverlay result={base} />);
  expect(screen.getByTestId("probe-p95").getAttribute("data-value")).toBe("20.1");
  expect(screen.queryByText(/no frames/)).toBeNull();
  expect(screen.queryByText(/invalid/)).toBeNull();
});

it("overlay says no frames and has no p95 value when the run has no samples", () => {
  render(<ProbeOverlay result={{ ...base, n: 0, p50: null, p95: null, p99: null, max: null, over33: 0 }} />);
  expect(screen.getByText(/no frames/)).toBeTruthy();
  expect(screen.queryByTestId("probe-p95")).toBeNull();
});

it("overlay marks a run invalid when the page was hidden", () => {
  render(<ProbeOverlay result={{ ...base, hidden: true }} />);
  expect(screen.getByText(/invalid.*hidden/i)).toBeTruthy();
  // The p95 stays visible, but the smoke test must not read an invalid run as valid.
  expect(screen.getByTestId("probe-overlay-state").getAttribute("data-valid")).toBe("false");
});
