import { describe, expect, it } from "vitest";
import { type SceneDraft, SceneDraftSchema, ScriptDraftSchema, assignSceneIds } from "./draft";
import { PageSceneSchema } from "./schemas";
import { ctx } from "./test/fixtures";
import { validateScene } from "./validate";

function ids(): () => string {
  let n = 0;
  return () => `01900000-0000-7000-8000-${String(++n).padStart(12, "0")}`;
}

function draft(): SceneDraft {
  return {
    templateId: "two-friends",
    sky: "night",
    layers: [
      { kind: "character", ref: "pip", pose: "stand", expression: "happy", slot: "left", flip: true },
      { kind: "prop", ref: "ball", pose: "default", expression: null, slot: "ground-1", flip: false },
    ],
    animations: [{ target: "left", primitive: "float", params: { amplitude: 0.01, period: 3 }, trigger: "loop" }],
    interactions: [
      {
        on: { tap: "left" },
        do: [
          { action: "play_animation", target: "ground-1", primitive: "pop" },
          { action: "play_sfx", sfx: "boing" },
          { action: "show_bubble", target: "left", text: "Look!" },
        ],
      },
    ],
  };
}

describe("draft", () => {
  it("SceneDraftSchema accepts the draft and requires every layer key", () => {
    expect(SceneDraftSchema.safeParse(draft()).success).toBe(true);
    const d = draft() as unknown as { layers: Record<string, unknown>[] };
    delete d.layers[1]!.expression;
    expect(SceneDraftSchema.safeParse(d).success).toBe(false);
  });

  it("ScriptDraftSchema needs 6 to 8 pages", () => {
    const pages = (n: number) => Array.from({ length: n }, (_, i) => ({ beat: `b${i}`, text: `Text ${i}.` }));
    expect(ScriptDraftSchema.safeParse({ title: "T", cast: ["pip"], pages: pages(6) }).success).toBe(true);
    expect(ScriptDraftSchema.safeParse({ title: "T", cast: ["pip"], pages: pages(5) }).success).toBe(false);
    expect(ScriptDraftSchema.safeParse({ title: "T", cast: ["pip"], pages: pages(9) }).success).toBe(false);
  });

  it("assignSceneIds rewrites targets and on.tap from slots", () => {
    const newId = ids();
    const scene = assignSceneIds(draft(), newId);
    const [pip, ball] = scene.layers;
    expect(pip!.instanceId).toBe("01900000-0000-7000-8000-000000000001");
    expect(ball!.instanceId).toBe("01900000-0000-7000-8000-000000000002");
    expect(scene.animations[0]!.target).toBe(pip!.instanceId);
    expect(scene.interactions[0]!.on.tap).toBe(pip!.instanceId);
    expect(scene.interactions[0]!.do[0]).toEqual({ action: "play_animation", target: ball!.instanceId, primitive: "pop" });
    expect(scene.interactions[0]!.do[1]).toEqual({ action: "play_sfx", sfx: "boing" });
    expect(scene.interactions[0]!.do[2]).toEqual({ action: "show_bubble", target: pip!.instanceId, text: "Look!" });
    expect(pip!.flip).toBe(true);
    expect(ball!.flip).toBe(false);
    expect("expression" in ball!).toBe(false);
    expect(pip!.expression).toBe("happy");
    expect(PageSceneSchema.safeParse(scene).success).toBe(true);
  });

  it("assignSceneIds keeps unknown slot target as raw string", () => {
    const d = draft();
    d.animations[0]!.target = "middle";
    const scene = assignSceneIds(d, ids());
    expect(scene.animations[0]!.target).toBe("middle");
    expect(validateScene(scene, ctx())).toContainEqual(
      expect.objectContaining({ code: "unknown_target", path: "animations.0.target" }),
    );
  });
});
