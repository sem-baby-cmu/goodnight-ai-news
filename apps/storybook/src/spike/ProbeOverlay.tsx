import type { ProbeResult } from "./probe";

const fixed = (value: number | null) => (value === null ? "-" : value.toFixed(1));

// The result line of the probe: plain 12 px text (issue #15). A run with no
// frames shows "no frames" and no `probe-p95`. A run during which the page was
// hidden shows "invalid (page was hidden)" and `data-valid="false"`.
export function ProbeOverlay({ result }: { result: ProbeResult }) {
  const json = JSON.stringify(result);
  const valid = !result.hidden && result.n > 0;
  return (
    <span data-testid="probe-overlay-state" data-valid={valid ? "true" : "false"}>
      {result.n === 0 ? (
        "no frames"
      ) : (
        <span data-testid="probe-p95" data-value={result.p95 ?? undefined}>
          p95 {fixed(result.p95)} ms
        </span>
      )}
      {result.hidden && " · invalid (page was hidden during the run)"}
      {` · p50 ${fixed(result.p50)} · p99 ${fixed(result.p99)} · max ${fixed(result.max)} · over33 ${result.over33} · n ${result.n} · load ${fixed(result.assetLoadMs)} ms · dpr ${result.dpr} · ${result.screen} `}
      <button type="button" style={{ font: "inherit" }} onClick={() => void navigator.clipboard?.writeText(json)}>
        Copy result
      </button>
    </span>
  );
}
