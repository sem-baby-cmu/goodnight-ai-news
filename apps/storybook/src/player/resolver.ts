import type { ReleasePage } from "@storybook/dsl";
import type { AssetResolver } from "@storybook/scene-runtime";

// One request per SVG URL for all pages of all books in this tab. A failed
// request is removed, so a later call tries again.
const svgCache = new Map<string, Promise<string>>();

// The resolver of one release page. Build it once per page and keep it:
// a new resolver makes the runtime load every SVG again.
export function createReleaseResolver(page: ReleasePage, root: string, fetchImpl: typeof fetch = fetch): AssetResolver {
  const url = (ref: string, file: string) => root + (page.assets[ref]?.base ?? "") + file;
  return {
    get(ref) {
      const asset = page.assets[ref];
      return asset ? { renderer: asset.renderer, manifest: asset.manifest } : undefined;
    },
    url,
    svgText(ref, file) {
      const target = url(ref, file);
      const cached = svgCache.get(target);
      if (cached) return cached;
      const text = fetchImpl(target).then((response) => {
        if (!response.ok) throw new Error(`${target}: status ${response.status}`);
        return response.text();
      });
      svgCache.set(target, text);
      text.catch(() => svgCache.delete(target));
      return text;
    },
  };
}
