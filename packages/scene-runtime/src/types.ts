import type { AssetManifest, Layer, PageScene } from "@storybook/dsl";

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
  mode: "play" | "edit";
  onSelectLayer?: (instanceId: string) => void;
  onMoveLayer?: (instanceId: string, at: Layer["at"]) => void;
  // Called synchronously inside the tap handler (iOS audio rule).
  onSfx?: (sfxRef: string) => void;
  // Paper texture over the whole stage (implementation decision R22).
  textureUrl?: string;
  // When defined, wins over `prefers-reduced-motion`.
  reducedMotion?: boolean;
  // Class names for `.sv-viewport` (#22, #24).
  className?: string;
  // Called when an asset of a layer fails to load (in addition to the warning).
  onAssetError?: (instanceId: string, url: string) => void;
};

// The pose and expression of one layer. Starts from the layer; changes only
// through tap actions.
export type LayerState = { pose?: string; expression?: string };
