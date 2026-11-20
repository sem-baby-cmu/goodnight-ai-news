import { describe, expect, it } from "vitest";
import { type AssetManifest, AssetManifestSchema, isLayerManifest, manifestFiles, selectPoseEntry } from "./registry";
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

  it("AssetManifestSchema accepts a layer description and rejects an empty one", () => {
    expect(AssetManifestSchema.safeParse({ ...owl, description: "a small owl" }).success).toBe(true);
    expect(AssetManifestSchema.safeParse({ ...owl, description: "" }).success).toBe(false);
    expect(AssetManifestSchema.safeParse(owl).success).toBe(true);
  });

  // A rect with no area gives layout scale Infinity and no issue (#47).
  function withRect(field: "box" | "face", rect: { x: number; y: number; w: number; h: number }) {
    if (!isLayerManifest(owl)) throw new Error("owl is a layer asset");
    const first = { ...owl.poses[0]!, [field]: rect };
    return { ...owl, poses: [first, ...owl.poses.slice(1)] };
  }

  function rectIssuePaths(manifest: unknown): string[] {
    const result = AssetManifestSchema.safeParse(manifest);
    if (result.success) return [];
    // The union reports the issues of the visual branch inside `errors`.
    return result.error.issues.flatMap((issue) =>
      issue.code === "invalid_union"
        ? issue.errors.flat().map((inner) => inner.path.join("."))
        : [issue.path.join(".")],
    );
  }

  it("AssetManifestSchema rejects a box or face with w = 0", () => {
    expect(rectIssuePaths(withRect("box", { x: 0, y: 0, w: 0, h: 10 }))).toContain("poses.0.box.w");
    expect(rectIssuePaths(withRect("face", { x: 0, y: 0, w: 0, h: 4 }))).toContain("poses.0.face.w");
  });

  it("AssetManifestSchema rejects a box or face with h = 0", () => {
    expect(rectIssuePaths(withRect("box", { x: 0, y: 0, w: 100, h: 0 }))).toContain("poses.0.box.h");
    expect(rectIssuePaths(withRect("face", { x: 0, y: 0, w: 4, h: 0 }))).toContain("poses.0.face.h");
  });

  it("AssetManifestSchema rejects a box or face with a negative size", () => {
    expect(rectIssuePaths(withRect("box", { x: 0, y: 0, w: -10, h: 10 }))).toContain("poses.0.box.w");
    expect(rectIssuePaths(withRect("face", { x: 0, y: 0, w: 4, h: -1 }))).toContain("poses.0.face.h");
  });

  it("AssetManifestSchema still accepts a small positive box and face", () => {
    expect(AssetManifestSchema.safeParse(withRect("face", { x: 1, y: 1, w: 0.5, h: 0.5 })).success).toBe(true);
  });

  // A backdrop manifest (ADR 0016, design.md "Data Models").
  function meadow(): Record<string, unknown> {
    return structuredClone(registry().assets.meadow!.manifest) as unknown as Record<string, unknown>;
  }

  // The unchanged manifest parses, so the change alone causes the rejection.
  function rejectsBackdrop(change: Record<string, unknown>): void {
    expect(AssetManifestSchema.safeParse(meadow()).success).toBe(true);
    expect(AssetManifestSchema.safeParse({ ...meadow(), ...change }).success).toBe(false);
  }

  it("AssetManifestSchema accepts the meadow backdrop manifest", () => {
    expect(AssetManifestSchema.safeParse(meadow()).success).toBe(true);
  });

  it("AssetManifestSchema rejects a backdrop with no variant", () => {
    rejectsBackdrop({ variants: [] });
  });

  it("AssetManifestSchema rejects a backdrop with two variants for one sky", () => {
    const variants = [
      { sky: "day", file: "day.svg" },
      { sky: "day", file: "day-2.svg" },
    ];
    rejectsBackdrop({ variants });
  });

  it("AssetManifestSchema rejects a backdrop that is not 2400 by 1200", () => {
    rejectsBackdrop({ size: { width: 1600, height: 1200 } });
  });

  it("AssetManifestSchema rejects a backdrop with an unknown key", () => {
    rejectsBackdrop({ extra: 1 });
  });

  it("AssetManifestSchema rejects a backdrop variant with an unknown sky", () => {
    rejectsBackdrop({ variants: [{ sky: "storm", file: "storm.svg" }] });
  });

  it("manifestFiles returns every variant file of a backdrop", () => {
    expect(manifestFiles(registry().assets.meadow!.manifest)).toEqual(["day.svg", "cloudy.svg", "dusk.svg", "night.svg"]);
  });

  it("isLayerManifest is true only for a character, prop, or scenery manifest", () => {
    const assets = registry().assets;
    expect(isLayerManifest(assets.meadow!.manifest)).toBe(false);
    expect(isLayerManifest(assets.boing!.manifest)).toBe(false);
    expect(isLayerManifest(assets.pip!.manifest)).toBe(true);
  });

  it("selectPoseEntry returns undefined for a backdrop", () => {
    expect(selectPoseEntry(registry().assets.meadow!.manifest)).toBeUndefined();
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
