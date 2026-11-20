import type { AssetManifest, Layer, PageScene } from "@storybook/dsl";
import type { Fit } from "./frame";

// One asset as the host resolved it.
export type ResolvedAsset = {
  renderer: "svg-rig" | "svg" | "webp" | "audio";
  manifest: AssetManifest;
};

// Bound to one frozen set of asset versions (a release page, or a frozen
// registry). That is how "key + version" in design section 5 is met: the
// version is fixed by the resolver instance, not passed per call.
export type AssetResolver = {
  get(ref: string): ResolvedAsset | undefined;
  url(ref: string, file: string): string;
  svgText(ref: string, file: string): Promise<string>;
};

export type SceneViewProps = {
  page: PageScene;
  assets: AssetResolver;
  mode: "play" | "edit" | "still";
  onSelectLayer?: (instanceId: string) => void;
  onMoveLayer?: (instanceId: string, at: Layer["at"]) => void;
  // Called synchronously inside the tap handler (iOS audio rule).
  onSfx?: (sfxRef: string) => void;
  // A paper texture tile, repeated over the whole backdrop frame (design 5, DESIGN.md 8).
  textureUrl?: string;
  // When defined, wins over `prefers-reduced-motion`.
  reducedMotion?: boolean;
  // Class names for `.sv-viewport` (#22, #24).
  className?: string;
  // Called when an asset of a layer fails to load (in addition to the warning).
  onAssetError?: (instanceId: string, url: string) => void;
  // default contain. design 5 Fit
  fit?: Fit;
  // Player only; default current. design 5 Page phases
  phase?: ScenePhase;
  // Called once per mount and page when the backdrop and every drawn layer
  // loaded or failed; in play mode only in phase incoming or current.
  // `failed` lists the files that did not load.
  onAssetsSettled?: (report: AssetsSettledReport) => void;
};

export type ScenePhase = "incoming" | "current" | "outgoing";

// `key` is the layer `instanceId`, or "backdrop"; `url` is null when no file
// could be named.
export type AssetFailure = { key: string; ref: string; url: string | null; reason: string };

export type AssetsSettledReport = { failed: AssetFailure[] };

// The pose and expression of one layer. Starts from the layer; changes only
// through tap actions.
export type LayerState = { pose?: string; expression?: string };
