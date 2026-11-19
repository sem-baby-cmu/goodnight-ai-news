import type { AssetManifest, RegistrySnapshot } from "@storybook/dsl";
import type { AssetResolver } from "@storybook/scene-runtime";
import { SPIKE_ASSETS, SPIKE_ASSETS_BASE } from "./assets";

type AssetJson = { kind: RegistrySnapshot["assets"][string]["kind"]; renderer: RegistrySnapshot["assets"][string]["renderer"]; version: number; manifest: AssetManifest };

let loaded: RegistrySnapshot | undefined;

const folder = (ref: string, version: number) => `${SPIKE_ASSETS_BASE}/${ref}/v${version}`;

// Reads `/spike-assets/<key>/v<n>/asset.json` for the 5 spike assets. The
// registry entry is `{ kind, renderer, version, manifest }` of that file;
// `key` and `name` are not part of it.
export async function loadSpikeRegistry(): Promise<RegistrySnapshot> {
  if (loaded) return loaded;
  const assets: RegistrySnapshot["assets"] = {};
  await Promise.all(
    Object.entries(SPIKE_ASSETS).map(async ([ref, version]) => {
      const url = `${folder(ref, version)}/asset.json`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`spike asset ${ref}: ${url} answered ${response.status}`);
      const { kind, renderer, version: v, manifest } = (await response.json()) as AssetJson;
      assets[ref] = { kind, renderer, version: v, manifest };
    }),
  );
  loaded = { assets };
  return loaded;
}

// Bound to the registry that `loadSpikeRegistry` returned, so call that first.
export const spikeResolver: AssetResolver = {
  get(ref) {
    const asset = loaded?.assets[ref];
    return asset && (asset.renderer === "svg-rig" || asset.renderer === "svg" || asset.renderer === "webp" || asset.renderer === "audio")
      ? { renderer: asset.renderer, manifest: asset.manifest }
      : undefined;
  },
  url(ref, file) {
    const version = loaded?.assets[ref]?.version;
    if (version === undefined) throw new Error(`spike asset "${ref}" is not loaded`);
    return `${folder(ref, version)}/${file}`;
  },
  async svgText(ref, file) {
    const url = this.url(ref, file);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.text();
  },
};
