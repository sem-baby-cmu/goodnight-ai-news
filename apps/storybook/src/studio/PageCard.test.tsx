import type { SceneViewProps } from "@storybook/scene-runtime";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageCard } from "./PageCard";
import { pageFixture, registryFixture, revisionFixture, SCENE_VERSIONS, sceneFixture } from "./fixtures";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);

// Every SceneView render, with its props.
const sceneViews = vi.hoisted(() => ({ calls: [] as SceneViewProps[] }));

vi.mock("@storybook/scene-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@storybook/scene-runtime")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    SceneView: (props: SceneViewProps) => {
      sceneViews.calls.push(props);
      return createElement("div", { "data-testid": "scene-view" });
    },
  };
});

beforeEach(() => {
  sceneViews.calls.length = 0;
});

it("PageCard puts the preview in a 1002 / 610 box with an absolute inset 0 wrapper", () => {
  render(<PageCard page={pageFixture(1)} registry={registryFixture()} />);
  const views = screen.getAllByTestId("scene-view");
  expect(views).toHaveLength(1);

  // SceneView sits directly in the wrapper, and the wrapper directly in the box.
  const wrapper = views[0].parentElement as HTMLElement;
  expect(wrapper.style.position).toBe("absolute");
  expect(wrapper.style.inset).toBe("0px");
  const box = wrapper.parentElement as HTMLElement;
  expect(box.style.position).toBe("relative");
  expect(box.style.aspectRatio.replace(/\s+/g, "")).toBe("1002/610");
  expect(box.style.borderRadius).toBe("10px");
  expect(box.style.overflow).toBe("hidden");

  expect(sceneViews.calls.length).toBeGreaterThan(0);
  for (const props of sceneViews.calls) {
    expect(props.mode).toBe("still");
    // Default fit (contain).
    expect(props.fit).toBeUndefined();
    expect(props.page).toEqual(sceneFixture());
  }
});

it("EDT-01.S5 PageCard shows a Text, Scene and Audio chip with the state of each target", () => {
  const page = pageFixture(2, {
    state: "stale",
    problems: [
      { target: "scene", reason: "stale" },
      { target: "audio", reason: "needs_review" },
    ],
  });
  render(<PageCard page={page} registry={registryFixture()} />);
  expect(screen.getByText("Text ok")).toBeTruthy();
  expect(screen.getByText("Scene stale")).toBeTruthy();
  expect(screen.getByText("Audio needs review")).toBeTruthy();
  expect(screen.queryByText("Scene ok")).toBeNull();
  expect(screen.queryByText("Audio ok")).toBeNull();
});

it("EDT-04.S2 PageCard shows the Scene missing chip for a page whose scene problem is missing", () => {
  const page = pageFixture(3, { state: "missing", problems: [{ target: "scene", reason: "missing" }], scene: null });
  render(<PageCard page={page} registry={registryFixture()} />);
  expect(screen.getByText("Scene missing")).toBeTruthy();
  expect(screen.queryByText("Scene ok")).toBeNull();
  expect(screen.getByText("Text ok")).toBeTruthy();
  expect(screen.getByText("Audio ok")).toBeTruthy();
  expect(screen.queryAllByTestId("scene-view")).toHaveLength(0);
});

it("PageCard lists needs_review issues as path, code, message", () => {
  const page = pageFixture(1, {
    state: "needs_review",
    problems: [{ target: "scene", reason: "needs_review" }],
  });
  page.scene = revisionFixture("scene", {
    pageId: page.pageId,
    status: "needs_review",
    content: sceneFixture(),
    assetVersions: { ...SCENE_VERSIONS },
    error: {
      issues: [
        { path: "layers.0.ref", code: "unknown_asset", message: "No active asset fox2." },
        { path: "interactions", code: "too_small", message: "A page needs one tap." },
      ],
    },
  });
  render(<PageCard page={page} registry={registryFixture()} />);
  expect(screen.getByText("layers.0.ref unknown_asset No active asset fox2.")).toBeTruthy();
  expect(screen.getByText("interactions too_small A page needs one tap.")).toBeTruthy();
});

it("PageCard shows provider error: <message> for a needs_review target with content null", () => {
  const page = pageFixture(1, {
    state: "needs_review",
    problems: [{ target: "audio", reason: "needs_review" }],
  });
  page.audio = revisionFixture("audio", {
    pageId: page.pageId,
    status: "needs_review",
    content: null,
    error: { providerStatus: 400, message: "The voice is not available." },
  });
  render(<PageCard page={page} registry={registryFixture()} />);
  expect(screen.getByText("provider error: The voice is not available.")).toBeTruthy();
});

it("PageCard shows No preview for a scene with a layer without at", () => {
  const scene = sceneFixture();
  const [placed] = scene.layers;
  const unplaced = { instanceId: placed.instanceId, kind: placed.kind, ref: placed.ref, slot: placed.slot };
  const page = pageFixture(1);
  page.scene = revisionFixture("scene", {
    pageId: page.pageId,
    content: { ...scene, layers: [unplaced] },
    assetVersions: { ...SCENE_VERSIONS },
  });
  render(<PageCard page={page} registry={registryFixture()} />);
  expect(screen.getByText("No preview for this scene.")).toBeTruthy();
  expect(screen.queryAllByTestId("scene-view")).toHaveLength(0);
  expect(sceneViews.calls).toHaveLength(0);
});

it("PageCard shows the version note and resolves no asset when the scene records a backdrop version that is not active", () => {
  // The scene records meadow v1; the active meadow is v2.
  render(<PageCard page={pageFixture(1)} registry={registryFixture({ meadow: 2 })} />);
  expect(screen.getByText("meadow: the scene uses v1, the registry has v2.")).toBeTruthy();

  expect(sceneViews.calls.length).toBeGreaterThan(0);
  for (const props of sceneViews.calls) {
    expect(props.assets.get("meadow")).toBeUndefined();
    expect(() => props.assets.url("meadow", "day.webp")).toThrow();
    // The key whose version matches still resolves.
    expect(props.assets.get("fox")?.renderer).toBe("svg-rig");
  }
});

it("PageCard names a recorded asset that has no active version", () => {
  const page = pageFixture(1);
  page.scene = revisionFixture("scene", {
    pageId: page.pageId,
    content: sceneFixture(),
    assetVersions: { ...SCENE_VERSIONS, owl: 3 },
  });
  render(<PageCard page={page} registry={registryFixture()} />);
  expect(screen.getByText("owl: the scene uses v3, the registry has no active version.")).toBeTruthy();
});

it("PageCard shows No preview: the registry did not load. without a registry", () => {
  render(<PageCard page={pageFixture(1)} registry={null} />);
  expect(screen.getByText("No preview: the registry did not load.")).toBeTruthy();
  expect(screen.queryAllByTestId("scene-view")).toHaveLength(0);
});

it("PageCard shows the page text, or No text", () => {
  const page = pageFixture(4);
  render(<PageCard page={page} registry={registryFixture()} />);
  expect(screen.getByText("The fox sees page 4.")).toBeTruthy();
  cleanup();

  render(<PageCard page={pageFixture(5, { text: null })} registry={registryFixture()} />);
  expect(screen.getByText("No text")).toBeTruthy();
});

it("PageCard shows one review block per target, with the target name and its own lines", () => {
  const page = pageFixture(1, {
    state: "needs_review",
    problems: [
      { target: "scene", reason: "needs_review" },
      { target: "audio", reason: "needs_review" },
    ],
  });
  page.scene = revisionFixture("scene", {
    pageId: page.pageId,
    status: "needs_review",
    content: sceneFixture(),
    assetVersions: { ...SCENE_VERSIONS },
    error: { issues: [{ path: "layers.0.ref", code: "unknown_asset", message: "No active asset fox2." }] },
  });
  page.audio = revisionFixture("audio", {
    pageId: page.pageId,
    status: "needs_review",
    content: null,
    error: { providerStatus: 400, message: "The voice is not available." },
  });
  render(<PageCard page={page} registry={registryFixture()} />);

  const sceneBlock = screen.getByText("Scene").parentElement as HTMLElement;
  const audioBlock = screen.getByText("Audio").parentElement as HTMLElement;
  expect(sceneBlock).not.toBe(audioBlock);
  expect(sceneBlock.textContent).toContain("layers.0.ref unknown_asset No active asset fox2.");
  expect(sceneBlock.textContent).not.toContain("provider error");
  expect(audioBlock.textContent).toContain("provider error: The voice is not available.");
  expect(audioBlock.textContent).not.toContain("unknown_asset");
  expect(screen.queryByText("Text")).toBeNull();
});
