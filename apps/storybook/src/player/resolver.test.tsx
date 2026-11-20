import type { ReleasePage } from "@storybook/dsl";
import { expect, it } from "vitest";
import { createReleaseResolver } from "./resolver";
import { FIXTURE_FILES, FIXTURE_ROOT, PAGE_IDS } from "./testStubs";

const page1 = JSON.parse(FIXTURE_FILES[`pages/${PAGE_IDS[0]}.json`]!) as ReleasePage;

it("url joins root, base and file", () => {
  const resolver = createReleaseResolver(page1, FIXTURE_ROOT);
  expect(resolver.url("pip", "stand.svg")).toBe(`${FIXTURE_ROOT}assets/pip/v1/stand.svg`);
  expect(resolver.url("meadow", "day.svg")).toBe(`${FIXTURE_ROOT}assets/meadow/v1/day.svg`);
  expect(resolver.get("pip")).toEqual({ renderer: "svg-rig", manifest: page1.assets.pip!.manifest });
  expect(resolver.get("nobody")).toBeUndefined();
});

it("svgText fetches a URL once, and again after a failure", async () => {
  // A root of its own: the cache is shared by every resolver of the module.
  const root = "/content/releases/resolver-test/";
  const url = `${root}assets/pip/v1/stand.svg`;
  const answers: (() => Promise<Response>)[] = [
    () => Promise.resolve(new Response("", { status: 404 })),
    () => Promise.reject(new TypeError("network")),
    () => Promise.resolve(new Response("<svg/>", { status: 200 })),
  ];
  const calls: string[] = [];
  const fetchImpl = ((input: RequestInfo | URL) => {
    calls.push(String(input));
    return answers[calls.length - 1]!();
  }) as typeof fetch;
  const resolver = createReleaseResolver(page1, root, fetchImpl);

  await expect(resolver.svgText("pip", "stand.svg")).rejects.toBeTruthy();
  await expect(resolver.svgText("pip", "stand.svg")).rejects.toBeTruthy();
  expect(await resolver.svgText("pip", "stand.svg")).toBe("<svg/>");
  expect(await resolver.svgText("pip", "stand.svg")).toBe("<svg/>");
  // Another resolver of the same URL uses the same entry.
  expect(await createReleaseResolver(page1, root, fetchImpl).svgText("pip", "stand.svg")).toBe("<svg/>");
  expect(calls).toEqual([url, url, url]);
});
