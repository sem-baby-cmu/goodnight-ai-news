import type { PageScene } from "@storybook/dsl";
import { TEMPLATES } from "@storybook/layout";
import { SceneView } from "@storybook/scene-runtime";
import { useEffect, useState } from "react";
import { SPIKE_TEXTURE_URL } from "./assets";
import { buildSpikePage } from "./pages";
import { ProbeOverlay } from "./ProbeOverlay";
import { type ProbeResult, runProbe } from "./probe";
import { loadSpikeRegistry, spikeResolver } from "./registry";

type Loaded = { page: PageScene } | { error: string };

const PROBE = { warmupMs: 2000, windowMs: 20000 };

// The route component of `/spike/:n`. The stage is `SceneView` only. With
// `?probe=1`, a plain 12 px text line above the stage shows the frame-time
// result when the run ends (S1 measurement, issue #15).
export function SpikePage({ n, probe }: { n: string; probe: boolean }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [result, setResult] = useState<ProbeResult>();

  useEffect(() => {
    setLoaded(undefined);
    setResult(undefined);
    const num = Number(n);
    if (num !== 1 && num !== 2 && num !== 3) {
      setLoaded({ error: `No spike page "${n}". Use 1, 2 or 3.` });
      return;
    }
    let cancelled = false;
    loadSpikeRegistry()
      .then((registry) => {
        if (!cancelled) setLoaded({ page: buildSpikePage(num, { registry, templates: TEMPLATES }) });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [n]);

  const page = loaded && "page" in loaded ? loaded.page : undefined;
  useEffect(() => {
    if (!probe || !page) return;
    let cancelled = false;
    // `SceneView` has painted once the effect of its parent runs; the warm-up
    // adds 2 s before the first frame is recorded.
    runProbe(PROBE).then((r) => {
      if (cancelled) return;
      console.info(JSON.stringify(r));
      setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [probe, page]);

  return (
    <main data-testid="spike-page" style={{ margin: "0 auto", width: "min(100vw, calc(100vh * 4 / 3))" }}>
      {probe && (
        <div data-testid="probe-overlay" style={{ font: "12px/1.4 monospace", padding: 4 }}>
          {result ? <ProbeOverlay result={result} /> : "probe: running (22 s)"}
        </div>
      )}
      {loaded && "error" in loaded && <p style={{ font: "12px/1.4 monospace" }}>{loaded.error}</p>}
      {page && <SceneView page={page} assets={spikeResolver} mode="play" textureUrl={SPIKE_TEXTURE_URL} />}
    </main>
  );
}
