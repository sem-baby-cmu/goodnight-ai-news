import { describe, expect, it } from "vitest";
import type { PageScene } from "./schemas";
import { BALL_ID, NEW_ID, OWL_ID, PIP_ID, ctx, soloCenter, twoFriends, validScene } from "./test/fixtures";
import { type Issue, validateScene } from "./validate";

type Ctx = ReturnType<typeof ctx>;

// Change a fresh valid scene, then validate it.
function check(change: (s: PageScene) => void, c: Ctx = ctx()): Issue[] {
  const scene = validScene();
  change(scene);
  return validateScene(scene, c);
}

function expectIssue(issues: Issue[], code: string, path?: string): void {
  const want = path === undefined ? { code } : { code, path };
  expect(issues).toContainEqual(expect.objectContaining(want));
}

// Loose access for changes that the type of PageScene does not allow.
function raw(value: unknown): Record<string, any> {
  return value as Record<string, any>;
}

const pip = (s: PageScene) => s.layers[0]!;
const owl = (s: PageScene) => s.layers[1]!;
const ball = (s: PageScene) => s.layers[2]!;
const actions = (s: PageScene) => s.interactions[0]!.do;

describe("validateScene", () => {
  it("valid scene has no issues", () => {
    expect(validateScene(validScene(), ctx())).toEqual([]);
  });

  it("every issue message is one sentence that does not quote narration", () => {
    const issues = check((s) => {
      raw(actions(s)[2]).target = NEW_ID;
      pip(s).pose = "fly";
    });
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.message).toMatch(/^[A-Z].*\.$/);
      expect(issue.message).not.toContain("Hello, friend!");
    }
    const bubble = check((s) => {
      raw(actions(s)[2]).text = "Hello\u2014friend " + "a".repeat(40);
    });
    expect(bubble.map((i) => i.code)).toEqual(["bubble_too_long", "bubble_no_end_mark", "bubble_not_ascii"]);
    for (const issue of bubble) {
      expect(issue.message).toMatch(/^[A-Z].*\.$/);
      expect(issue.message).not.toContain("Hello");
    }
  });

  // Schema checks (zod).

  it("schema: rejects non-object", () => {
    expectIssue(validateScene(42, ctx()), "schema");
  });

  it("schema: rejects param out of bounds", () => {
    const issues = check((s) => {
      raw(s.animations[0]).params.amplitude = 0.5;
    });
    expect(issues).toEqual([expect.objectContaining({ code: "schema", path: "animations.0.params.amplitude" })]);
  });

  it("schema: rejects non-integer count", () => {
    const issues = check((s) => {
      s.animations[0] = { target: PIP_ID, primitive: "bounce", params: { height: 0.03, count: 1.5 }, trigger: "enter" };
    });
    expectIssue(issues, "schema");
  });

  it("schema: rejects unknown primitive", () => {
    expectIssue(
      check((s) => {
        raw(s.animations[0]).primitive = "spin";
      }),
      "schema",
    );
  });

  // Bubble checks (#82): they report and never change the text.

  const bubble = (text: string) => check((s) => void (raw(actions(s)[2]).text = text));
  const BUBBLE_PATH = "interactions.0.do.2.text";

  it("RUN-03.S10 a bubble over 40 characters fails validation", () => {
    expect(bubble("a".repeat(39) + ".")).toEqual([]);
    expect(bubble("a".repeat(40) + ".")).toEqual([
      expect.objectContaining({ code: "bubble_too_long", path: BUBBLE_PATH }),
    ]);
  });

  it("RUN-03.S17 a bubble text without an end mark fails validation", () => {
    for (const text of ["Hello, friend", "Hello, friend! "]) {
      expect(bubble(text)).toEqual([expect.objectContaining({ code: "bubble_no_end_mark", path: BUBBLE_PATH })]);
    }
    expect(bubble("Is it you?")).toEqual([]);
  });

  it("RUN-03.S18 a bubble text outside printable ASCII fails validation", () => {
    const issues = bubble("Hello\u2014friend!");
    expect(issues).toEqual([expect.objectContaining({ code: "bubble_not_ascii", path: BUBBLE_PATH })]);
    expect(issues[0]!.message).toContain("U+2014");
    expect(issues[0]!.message).not.toContain("Hello");
    expect(bubble("Hi, friend!")).toEqual([]);
  });

  it("bubble checks report every failing rule", () => {
    expect(bubble("a".repeat(61)).map((i) => i.code)).toEqual(["bubble_too_long", "bubble_no_end_mark"]);
  });

  it("schema: requires one layer, animation, interaction", () => {
    expectIssue(check((s) => void (s.layers = [])), "schema", "layers");
    expectIssue(check((s) => void (s.animations = [])), "schema", "animations");
    expectIssue(check((s) => void (s.interactions = [])), "schema", "interactions");
  });

  // Semantic checks, in the order of the table in #10.

  it("unknown template", () => {
    expectIssue(check((s) => void (s.templateId = "nope")), "unknown_template", "templateId");
  });

  it("unknown template skips the slot checks", () => {
    expect(check((s) => void (s.templateId = "nope"))).toEqual([
      expect.objectContaining({ code: "unknown_template", path: "templateId" }),
    ]);
  });

  it("unknown slot", () => {
    expectIssue(check((s) => void (pip(s).slot = "middle")), "unknown_slot", "layers.0.slot");
  });

  it("duplicate slot", () => {
    expectIssue(check((s) => void (owl(s).slot = "left")), "duplicate_slot", "layers.1.slot");
  });

  it("duplicate instanceId", () => {
    expectIssue(check((s) => void (owl(s).instanceId = PIP_ID)), "duplicate_instance_id", "layers.1.instanceId");
  });

  it("unknown asset", () => {
    expectIssue(check((s) => void (owl(s).ref = "dragon")), "unknown_asset", "layers.1.ref");
  });

  it("layer kind must match asset kind", () => {
    const issues = check((s) => {
      pip(s).kind = "prop";
    });
    expectIssue(issues, "asset_kind_mismatch", "layers.0.kind");
  });

  // Backdrop checks (ADR 0016 section 1).

  it("RUN-03.S15 a backdrop without a variant for the sky fails validation", () => {
    const dusk = check((s) => {
      s.backdrop = "pond";
      s.sky = "dusk";
    });
    expect(dusk).toHaveLength(1);
    expect(dusk[0]).toMatchObject({ path: "sky", code: "backdrop_sky_mismatch" });
    const night = check((s) => {
      s.backdrop = "pond";
      s.sky = "night";
    });
    expect(night).toEqual([]);
  });

  it("schema: a scene without backdrop fails", () => {
    expectIssue(check((s) => void delete raw(s).backdrop), "schema", "backdrop");
  });

  it("backdrop: an unknown asset fails", () => {
    expectIssue(check((s) => void (s.backdrop = "ghost")), "unknown_asset", "backdrop");
  });

  it("backdrop: an asset that is not a backdrop fails, with no sky check", () => {
    const issues = check((s) => void (s.backdrop = "tree"));
    expectIssue(issues, "asset_kind_mismatch", "backdrop");
    expect(issues.map((i) => i.code)).not.toContain("backdrop_sky_mismatch");
  });

  it("a layer that references a backdrop fails with asset_kind_mismatch", () => {
    const issues = check((s) => void (s.layers[3]!.ref = "meadow"));
    expectIssue(issues, "asset_kind_mismatch", "layers.3.kind");
  });

  it("a layer whose asset has a backdrop manifest fails with asset_kind_mismatch", () => {
    // The registry kind says scenery, but the manifest is a backdrop: the two disagree.
    const c = ctx();
    c.registry.assets.tree = { ...c.registry.assets.tree!, manifest: c.registry.assets.meadow!.manifest };
    const issues = check(() => {}, c);
    expectIssue(issues, "asset_kind_mismatch", "layers.3.kind");
  });

  it("RUN-03.S5 layer kind must match slot accepts", () => {
    const issues = check((s) => {
      ball(s).slot = "left";
      pip(s).slot = "ground-1";
    });
    expectIssue(issues, "slot_kind_mismatch", "layers.2.slot");
  });

  it("RUN-03.S19 a key that a slot does not list fails validation", () => {
    // The fixture scene has `tree` in sky-1 (layers.3); sky-1 lists only `sun` (#131).
    const c = ctx();
    c.templates[0]!.slots.find((slot) => slot.id === "sky-1")!.refs = ["sun"];
    c.registry.assets.sun = structuredClone(c.registry.assets.tree!);
    const tree = check(() => {}, c);
    expectIssue(tree, "slot_ref_mismatch", "layers.3.ref");
    expect(tree).toEqual([
      expect.objectContaining({ code: "slot_ref_mismatch", path: "layers.3.ref", message: 'Asset "tree" is not allowed in slot "sky-1".' }),
    ]);
    expect(check((s) => void (s.layers[3]!.ref = "sun"), c)).toEqual([]);
    // A slot without `refs` accepts every key of its kind.
    expect(validateScene(validScene(), ctx())).toEqual([]);
  });

  it("a bust pose outside a bust slot fails", () => {
    const c = ctx();
    c.templates = [twoFriends(), soloCenter()];
    const issues = check((s) => void (pip(s).pose = "bust"), c);
    expect(issues).toEqual([expect.objectContaining({ code: "slot_pose_mismatch", path: "layers.0.pose" })]);
  });

  it("a full-body pose in a bust slot fails", () => {
    const c = ctx();
    c.templates = [twoFriends(), soloCenter()];
    const issues = check((s) => {
      s.templateId = "solo-center";
      s.layers = [{ ...pip(s), slot: "bust", pose: "front" }];
      actions(s)[4] = { action: "set_pose", target: PIP_ID, pose: "bust" };
    }, c);
    expect(issues).toEqual([expect.objectContaining({ code: "slot_pose_mismatch", path: "layers.0.pose" })]);
  });

  it("a bust pose in a bust slot passes", () => {
    const c = ctx();
    c.templates = [twoFriends(), soloCenter()];
    const issues = check((s) => {
      s.templateId = "solo-center";
      s.layers = [{ ...pip(s), slot: "bust", pose: "bust" }];
      actions(s)[4] = { action: "set_pose", target: PIP_ID, pose: "bust" };
    }, c);
    expect(issues).toEqual([]);
  });

  it("set_pose to a bust pose outside a bust slot fails", () => {
    const c = ctx();
    c.templates = [twoFriends(), soloCenter()];
    const issues = check((s) => {
      actions(s)[4] = { action: "set_pose", target: PIP_ID, pose: "bust" };
    }, c);
    expect(issues).toEqual([expect.objectContaining({ code: "slot_pose_mismatch", path: "interactions.0.do.4.pose" })]);
  });

  it("set_pose to a full-body pose in a bust slot fails", () => {
    const c = ctx();
    c.templates = [twoFriends(), soloCenter()];
    const issues = check((s) => {
      s.templateId = "solo-center";
      s.layers = [{ ...pip(s), slot: "bust", pose: "bust" }];
      actions(s)[4] = { action: "set_pose", target: PIP_ID, pose: "front" };
    }, c);
    expect(issues).toEqual([expect.objectContaining({ code: "slot_pose_mismatch", path: "interactions.0.do.4.pose" })]);
  });

  it("slot pose check needs a pose: a missing pose gives only missing_pose", () => {
    const c = ctx();
    c.templates = [twoFriends(), soloCenter()];
    const issues = check((s) => {
      s.templateId = "solo-center";
      s.layers = [{ ...pip(s), slot: "bust" }];
      delete s.layers[0]!.pose;
      actions(s)[4] = { action: "set_pose", target: PIP_ID, pose: "bust" };
    }, c);
    expect(issues).toEqual([expect.objectContaining({ code: "missing_pose", path: "layers.0.pose" })]);
  });

  it("slot pose check needs a known slot: an unknown slot gives only unknown_slot", () => {
    const c = ctx();
    c.templates = [twoFriends(), soloCenter()];
    const issues = check((s) => {
      pip(s).pose = "bust";
      pip(s).slot = "middle";
    }, c);
    expect(issues).toEqual([expect.objectContaining({ code: "unknown_slot", path: "layers.0.slot" })]);
  });

  it("pose required", () => {
    expectIssue(check((s) => void delete pip(s).pose), "missing_pose", "layers.0.pose");
  });

  it("unknown pose", () => {
    expectIssue(check((s) => void (pip(s).pose = "fly")), "unknown_pose", "layers.0.pose");
  });

  it("unknown expression", () => {
    expectIssue(check((s) => void (pip(s).expression = "angry")), "unknown_expression", "layers.0.expression");
  });

  it("character needs expression", () => {
    expectIssue(check((s) => void delete pip(s).expression), "missing_expression", "layers.0.expression");
  });

  it("prop has no expression", () => {
    expectIssue(check((s) => void (ball(s).expression = "happy")), "unexpected_expression", "layers.2.expression");
  });

  it("RUN-03.S4 pose and expression pair must be legal", () => {
    const issues = check((s) => {
      pip(s).pose = "wave";
      pip(s).expression = "sad";
    });
    expectIssue(issues, "illegal_pair", "layers.0");
  });

  it("RUN-03.S6 flip only on flippable assets", () => {
    expectIssue(check((s) => void (owl(s).flip = true)), "flip_not_allowed", "layers.1.flip");
  });

  it("flip allowed on flippable asset", () => {
    expect(check((s) => void (pip(s).flip = true))).toEqual([]);
  });

  it("page needs a character layer", () => {
    const issues = check((s) => {
      s.layers = s.layers.filter((l) => l.kind !== "character");
      s.animations = [{ target: BALL_ID, primitive: "pop", params: { scale: 1.1 }, trigger: "enter" }];
      s.interactions = [{ on: { tap: BALL_ID }, do: [{ action: "play_sfx", sfx: "boing" }] }];
    });
    expect(issues).toEqual([expect.objectContaining({ code: "min_character", path: "layers" })]);
  });

  it("loop on a one-shot primitive is not allowed", () => {
    const issues = check((s) => {
      s.animations[0] = { target: PIP_ID, primitive: "bounce", params: { height: 0.03, count: 1 }, trigger: "loop" };
    });
    expectIssue(issues, "loop_not_allowed", "animations.0.trigger");
  });

  it("RUN-03.S8 a target must name a layer, for an animation and for an action", () => {
    expect(check((s) => void (s.animations[0]!.target = NEW_ID))).toEqual([
      expect.objectContaining({ code: "unknown_target", path: "animations.0.target" }),
    ]);
    expect(check((s) => void (raw(actions(s)[3]).target = NEW_ID))).toEqual([
      expect.objectContaining({ code: "unknown_target", path: "interactions.0.do.3.target" }),
    ]);
  });

  it("RUN-03.S7 blink or wave needs svg-rig, as an animation and as a play_animation action", () => {
    const animation = check((s) => {
      s.animations[0] = { target: OWL_ID, primitive: "blink", params: { interval: 4 }, trigger: "loop" };
    });
    expect(animation).toEqual([expect.objectContaining({ code: "primitive_renderer", path: "animations.0.primitive" })]);
    const action = check((s) => {
      actions(s)[0] = { action: "play_animation", target: OWL_ID, primitive: "wave" };
    });
    expect(action).toEqual([
      expect.objectContaining({ code: "primitive_renderer", path: "interactions.0.do.0.primitive" }),
    ]);
  });

  it("blink allowed on svg-rig", () => {
    const issues = check((s) => {
      s.animations[0] = { target: PIP_ID, primitive: "blink", params: { interval: 4 }, trigger: "loop" };
    });
    expect(issues).toEqual([]);
  });

  it("tap target must exist", () => {
    expectIssue(
      check((s) => void (s.interactions[0]!.on.tap = NEW_ID)),
      "unknown_target",
      "interactions.0.on.tap",
    );
  });

  it("play_animation target must exist", () => {
    expectIssue(
      check((s) => void (raw(actions(s)[0]).target = NEW_ID)),
      "unknown_target",
      "interactions.0.do.0.target",
    );
  });

  it("RUN-03.S9 play_sfx needs an sfx asset", () => {
    expectIssue(check((s) => void (raw(actions(s)[1]).sfx = "pip")), "unknown_sfx", "interactions.0.do.1.sfx");
    expectIssue(check((s) => void (raw(actions(s)[1]).sfx = "zzz")), "unknown_sfx", "interactions.0.do.1.sfx");
  });

  it("show_bubble target must exist", () => {
    expectIssue(
      check((s) => void (raw(actions(s)[2]).target = NEW_ID)),
      "unknown_target",
      "interactions.0.do.2.target",
    );
  });

  it("set_expression needs a character", () => {
    expectIssue(
      check((s) => void (raw(actions(s)[3]).target = BALL_ID)),
      "action_needs_character",
      "interactions.0.do.3.target",
    );
  });

  it("RUN-03.S11 a tap that makes an illegal pair fails, for set_expression and for set_pose", () => {
    // (current pose wave, new expression sad); the set_pose action is removed.
    const setExpression = check((s) => {
      pip(s).pose = "wave";
      actions(s).splice(4, 1);
      actions(s)[3] = { action: "set_expression", target: PIP_ID, expression: "sad" };
    });
    expect(setExpression).toEqual([expect.objectContaining({ code: "illegal_pair", path: "interactions.0.do.3" })]);
    // (new pose wave, current expression sad).
    const setPose = check((s) => {
      pip(s).expression = "sad";
      actions(s)[4] = { action: "set_pose", target: PIP_ID, pose: "wave" };
    });
    expect(setPose).toEqual([expect.objectContaining({ code: "illegal_pair", path: "interactions.0.do.4" })]);
  });

  it("set_pose legal pair passes", () => {
    const issues = check((s) => {
      pip(s).expression = "happy";
      actions(s)[4] = { action: "set_pose", target: PIP_ID, pose: "wave" };
    });
    expect(issues).toEqual([]);
  });
});
