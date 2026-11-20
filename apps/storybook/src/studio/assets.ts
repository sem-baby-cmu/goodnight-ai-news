import type { AssetResolver } from "@storybook/scene-runtime";
import type { RegistryResponse } from "./api";

type Entry = RegistryResponse["assets"][number];

// The entry of `ref` when the version that the scene records is the active
// one (or the scene records none). A recorded version that is not active
// resolves to nothing: the Studio never draws the active version in its place.
function entryOf(registry: RegistryResponse, versions: Record<string, number> | null, ref: string): Entry | undefined {
  const entry = registry.assets.find((a) => a.key === ref);
  if (entry === undefined) return undefined;
  const recorded = versions?.[ref];
  if (recorded !== undefined && recorded !== entry.version) return undefined;
  return entry;
}

// An `AssetResolver` over the active registry, bound to the asset versions of
// one scene revision (#23, Exact changes 7).
export function studioAssetResolver(registry: RegistryResponse, versions: Record<string, number> | null): AssetResolver {
  const url = (ref: string, file: string): string => {
    const entry = entryOf(registry, versions, ref);
    if (entry === undefined) throw new Error(`The asset ${ref} is not in the registry at the recorded version.`);
    return entry.base + file;
  };
  return {
    get(ref) {
      const entry = entryOf(registry, versions, ref);
      return entry === undefined ? undefined : { renderer: entry.renderer, manifest: entry.manifest };
    },
    url,
    async svgText(ref, file) {
      const res = await fetch(url(ref, file));
      if (!res.ok) throw new Error(`The file ${file} of ${ref} answered ${res.status}.`);
      return res.text();
    },
  };
}

// One entry for each recorded key whose active version differs or is absent.
export function versionMismatches(
  registry: RegistryResponse,
  versions: Record<string, number> | null,
): Array<{ key: string; recorded: number; active: number | null }> {
  return Object.entries(versions ?? {}).flatMap(([key, recorded]) => {
    const active = registry.assets.find((a) => a.key === key)?.version ?? null;
    return active === recorded ? [] : [{ key, recorded, active }];
  });
}
