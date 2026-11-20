import { afterEach, expect, it, vi } from "vitest";
import { studioAssetResolver, versionMismatches } from "./assets";
import { registryFixture, stubFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("studioAssetResolver resolves a key whose recorded version is active", () => {
  const registry = registryFixture();
  const resolver = studioAssetResolver(registry, { fox: 1, meadow: 1 });
  expect(resolver.get("fox")).toEqual({ renderer: "svg-rig", manifest: registry.assets[0].manifest });
  expect(resolver.url("fox", "stand.svg")).toBe("/api/studio/files/assets/fox/1/stand.svg");
  expect(resolver.get("meadow")?.renderer).toBe("webp");
});

it("studioAssetResolver resolves no key that is unknown or recorded at another version", () => {
  const resolver = studioAssetResolver(registryFixture({ meadow: 2 }), { fox: 1, meadow: 1 });
  expect(resolver.get("meadow")).toBeUndefined();
  expect(() => resolver.url("meadow", "day.webp")).toThrow();
  expect(resolver.get("owl")).toBeUndefined();
  expect(() => resolver.url("owl", "a.svg")).toThrow();
});

it("studioAssetResolver with no recorded versions uses the active entries", () => {
  const resolver = studioAssetResolver(registryFixture({ meadow: 2 }), null);
  expect(resolver.get("meadow")?.renderer).toBe("webp");
  expect(resolver.url("meadow", "day.webp")).toBe("/api/studio/files/assets/meadow/2/day.webp");
});

it("studioAssetResolver svgText fetches the file and throws on an error status", async () => {
  const { calls } = stubFetch((call) =>
    call.path.endsWith("/stand.svg") ? { status: 200, body: "<svg/>" } : { status: 404, body: null },
  );
  const resolver = studioAssetResolver(registryFixture(), { fox: 1, meadow: 1 });
  // The stub sends JSON, so the SVG text arrives as a JSON string.
  expect(await resolver.svgText("fox", "stand.svg")).toBe(JSON.stringify("<svg/>"));
  expect(calls[0].path).toBe("/api/studio/files/assets/fox/1/stand.svg");
  await expect(resolver.svgText("fox", "missing.svg")).rejects.toThrow();
});

it("versionMismatches lists each recorded key whose active version differs or is absent", () => {
  const registry = registryFixture({ meadow: 2 });
  expect(versionMismatches(registry, { fox: 1, meadow: 1, owl: 3 })).toEqual([
    { key: "meadow", recorded: 1, active: 2 },
    { key: "owl", recorded: 3, active: null },
  ]);
  expect(versionMismatches(registry, { fox: 1, meadow: 2 })).toEqual([]);
  expect(versionMismatches(registry, null)).toEqual([]);
});
