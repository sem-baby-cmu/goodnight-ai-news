import { describe, expect, it } from "vitest";
import { type AssetManifest, AssetManifestSchema, selectPoseEntry } from "./registry";
import { registry } from "./test/fixtures";

const box = { x: 0, y: 0, w: 10, h: 10 };
const foot = { x: 5, y: 10 };
const owl: AssetManifest = {
  kind: "character",
  poses: [
    { id: "perch", file: "perch-calm.webp", foot, box, expression: "calm" },
    { id: "perch", file: "perch-sleepy.webp", foot, box, expression: "sleepy" },
    { id: "fly", file: "fly-calm.webp", foot, box, expression: "calm" },
  ],
  expressions: ["calm", "sleepy"],
  legal: [
    { pose: "perch", expression: "calm" },
    { pose: "perch", expression: "sleepy" },
    { pose: "fly", expression: "calm" },
  ],
  flippable: false,
};

describe("registry", () => {
  it("AssetManifestSchema accepts sfx variant", () => {
    expect(AssetManifestSchema.safeParse({ kind: "sfx", file: "boing.mp3", durationMs: 400 }).success).toBe(true);
  });

  it("AssetManifestSchema accepts every fixture manifest", () => {
    for (const a of Object.values(registry().assets)) {
      expect(AssetManifestSchema.safeParse(a.manifest).success).toBe(true);
    }
  });

  it("AssetManifestSchema rejects a visual asset without poses and unknown keys", () => {
    expect(AssetManifestSchema.safeParse({ ...owl, poses: [] }).success).toBe(false);
    expect(AssetManifestSchema.safeParse({ ...owl, extra: 1 }).success).toBe(false);
    expect(AssetManifestSchema.safeParse({ kind: "sfx", file: "a.mp3", durationMs: 1, poses: [] }).success).toBe(false);
  });

  it("selectPoseEntry picks the entry with pose and expression", () => {
    expect(selectPoseEntry(owl, "perch", "sleepy")?.file).toBe("perch-sleepy.webp");
  });

  it("selectPoseEntry falls back to the first entry with the pose", () => {
    expect(selectPoseEntry(owl, "perch", "angry")?.file).toBe("perch-calm.webp");
    expect(selectPoseEntry(owl, "fly")?.file).toBe("fly-calm.webp");
  });

  it("selectPoseEntry with no pose returns the first entry", () => {
    expect(selectPoseEntry(owl)?.file).toBe("perch-calm.webp");
  });

  it("selectPoseEntry returns undefined when no entry matches", () => {
    expect(selectPoseEntry(owl, "dive")).toBeUndefined();
    expect(selectPoseEntry({ kind: "sfx", file: "a.mp3", durationMs: 1 }, "perch")).toBeUndefined();
  });
});
