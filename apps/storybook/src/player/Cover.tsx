import type { ReleasePage } from "@storybook/dsl";
import { type AssetResolver, type AssetsSettledReport, SceneView } from "@storybook/scene-runtime";
import { useCallback, useEffect, useState } from "react";

export type CoverData = { page: ReleasePage; resolver: AssetResolver };

type CoverState = "waiting" | "drawn" | "paper";

// The picture window of a book: page 1 as a still scene that fills the
// window (ADR 0017 "Cover"). Paper until every file is loaded; then the
// picture fades in as a whole. A failure keeps the paper with no sign.
export function Cover({ load, width, height }: { load: Promise<CoverData>; width: number; height: number }) {
  const [data, setData] = useState<CoverData | null>(null);
  const [state, setState] = useState<CoverState>("waiting");

  useEffect(() => {
    let live = true;
    load.then(
      (loaded) => {
        if (live) setData(loaded);
      },
      () => {
        if (live) setState("paper");
      },
    );
    return () => {
      live = false;
    };
  }, [load]);

  const onAssetsSettled = useCallback((report: AssetsSettledReport) => {
    setState(report.failed.length === 0 ? "drawn" : "paper");
  }, []);

  return (
    <div
      data-testid="cover-window"
      data-cover={state}
      className="relative overflow-hidden rounded-[6px] bg-paper"
      style={{ width, height }}
    >
      {data ? (
        <div
          data-testid="cover"
          className="absolute inset-0 transition-opacity duration-200 ease-linear motion-reduce:transition-none motion-reduce:duration-0"
          style={{ opacity: state === "drawn" ? 1 : 0 }}
        >
          <SceneView page={data.page.scene} assets={data.resolver} mode="still" fit="cover" onAssetsSettled={onAssetsSettled} />
        </div>
      ) : null}
    </div>
  );
}
