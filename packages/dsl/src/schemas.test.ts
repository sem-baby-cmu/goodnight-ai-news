import { describe, expect, it } from "vitest";
import {
  InteractionSchema,
  LayerSchema,
  OutlineSchema,
  PageSceneSchema,
  PageTextSchema,
  ReleaseManifestSchema,
  ReleasePageSchema,
} from "./schemas";
import { PIP_ID, registry, validScene } from "./test/fixtures";

const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;

function outline(pages: number) {
  return {
    title: "The owl and the moon",
    ageBand: "5-7",
    cast: ["pip", "owl"],
    pages: Array.from({ length: pages }, (_, n) => ({ pageId: id(n + 1), beat: `Beat ${n + 1}` })),
  };
}

describe("schemas", () => {
  it("PageTextSchema rejects 41 words", () => {
    const text = `${Array.from({ length: 41 }, () => "word").join(" ")}.`;
    expect(PageTextSchema.safeParse({ text }).success).toBe(false);
    const forty = `${Array.from({ length: 40 }, () => "word").join(" ")}.`;
    expect(PageTextSchema.safeParse({ text: forty }).success).toBe(true);
  });

  it("PageTextSchema rejects 4 sentences", () => {
    expect(PageTextSchema.safeParse({ text: "One. Two! Three? Four." }).success).toBe(false);
  });

  it("PageTextSchema accepts 3 sentences", () => {
    expect(PageTextSchema.safeParse({ text: "One. Two! Three?" }).success).toBe(true);
  });

  it("PageTextSchema rejects empty text", () => {
    expect(PageTextSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("OutlineSchema rejects 5 and 9 pages", () => {
    expect(OutlineSchema.safeParse(outline(5)).success).toBe(false);
    expect(OutlineSchema.safeParse(outline(9)).success).toBe(false);
    expect(OutlineSchema.safeParse(outline(6)).success).toBe(true);
    expect(OutlineSchema.safeParse(outline(8)).success).toBe(true);
  });

  it("OutlineSchema rejects an upper-case or non-v7 page ID", () => {
    const upper = outline(6);
    upper.pages[0]!.pageId = "01900000-0000-7000-8000-00000000000A";
    expect(OutlineSchema.safeParse(upper).success).toBe(false);
    const v4 = outline(6);
    v4.pages[0]!.pageId = "01900000-0000-4000-8000-000000000001";
    expect(OutlineSchema.safeParse(v4).success).toBe(false);
  });

  it("PageSceneSchema accepts the valid scene and rejects unknown keys", () => {
    expect(PageSceneSchema.safeParse(validScene()).success).toBe(true);
    expect(PageSceneSchema.safeParse({ ...validScene(), extra: 1 }).success).toBe(false);
    expect(PageSceneSchema.safeParse({ ...validScene(), sky: "storm" }).success).toBe(false);
  });

  it("LayerSchema checks at", () => {
    const layer = validScene().layers[0]!;
    expect(LayerSchema.safeParse({ ...layer, at: { x: 1, y: 2, scale: 0.5, z: 3 } }).success).toBe(true);
    expect(LayerSchema.safeParse({ ...layer, at: { x: 1, y: 2, scale: 0, z: 3 } }).success).toBe(false);
    expect(LayerSchema.safeParse({ ...layer, at: { x: 1, y: 2, scale: 1, z: 1.5 } }).success).toBe(false);
  });

  it("play_animation rejects params", () => {
    const tap = { on: { tap: PIP_ID }, do: [{ action: "play_animation", target: PIP_ID, primitive: "pop" }] };
    expect(InteractionSchema.safeParse(tap).success).toBe(true);
    const withParams = {
      on: { tap: PIP_ID },
      do: [{ action: "play_animation", target: PIP_ID, primitive: "pop", params: { scale: 1.1 } }],
    };
    expect(InteractionSchema.safeParse(withParams).success).toBe(false);
  });

  it("ReleasePageSchema requires at on every layer", () => {
    const assets = Object.fromEntries(
      Object.entries(registry().assets).map(([key, a]) => [
        key,
        { renderer: a.renderer, manifest: a.manifest, base: `assets/${key}/v${a.version}/` },
      ]),
    );
    const page = { pageId: id(1), text: "Pip waves.", audio: "audio/p1.mp3", scene: validScene(), assets };
    expect(ReleasePageSchema.safeParse(page).success).toBe(false);

    const placed = validScene();
    placed.layers = placed.layers.map((l, z) => ({ ...l, at: { x: 100, y: 200, scale: 1, z } }));
    expect(ReleasePageSchema.safeParse({ ...page, scene: placed }).success).toBe(true);

    placed.layers[3] = { ...placed.layers[3]! };
    delete placed.layers[3].at;
    expect(ReleasePageSchema.safeParse({ ...page, scene: placed }).success).toBe(false);
  });

  it("ReleaseManifestSchema checks format, version, and number", () => {
    const manifest = {
      format: "storybook-mvp",
      formatVersion: 1,
      storyId: id(1),
      releaseId: id(2),
      number: 1,
      title: "The owl and the moon",
      pages: [{ pageId: id(3), json: `pages/${id(3)}.json` }],
    };
    expect(ReleaseManifestSchema.safeParse(manifest).success).toBe(true);
    expect(ReleaseManifestSchema.safeParse({ ...manifest, formatVersion: 2 }).success).toBe(false);
    expect(ReleaseManifestSchema.safeParse({ ...manifest, number: 0 }).success).toBe(false);
    expect(ReleaseManifestSchema.safeParse({ ...manifest, pages: [] }).success).toBe(false);
  });
});
