import { env } from "cloudflare:workers";
import { buildSceneJsonSchema } from "@storybook/dsl";
import type { PageScene, RegistrySnapshot } from "@storybook/dsl";
import { TEMPLATE_DESCRIPTIONS, TEMPLATES } from "@storybook/layout";
import { describe, expect, it } from "vitest";
import { getDb, loadActiveRegistry } from "../db";
import { seedRegistry } from "../test/fixtures";
import { modelRegistry, repairSuffix, scenePrompt, sceneSummary, scriptPrompt } from "./prompts";

// The `enum` values of every schema node under a property with this name.
function enumsOf(schema: unknown, name: string): unknown[][] {
  const found: unknown[][] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    const props = n.properties as Record<string, Record<string, unknown>> | undefined;
    if (props && name in props && Array.isArray(props[name]!.enum)) found.push(props[name]!.enum as unknown[]);
    for (const value of Object.values(n)) walk(value);
  };
  walk(schema);
  return found;
}

describe("prompts", () => {
  it("scenePrompt lists every template id and the page text", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const pageText = "Page 2. The bunny jumps over a puddle.";
    const { system, user } = scenePrompt({ beat: "The bunny plays.", pageText, cast: ["test-bunny"], registry, templates: TEMPLATES });
    for (const t of TEMPLATES) {
      expect(user).toContain(t.id);
      for (const slot of t.slots) expect(user).toContain(slot.id);
    }
    expect(user).toContain(pageText);
    expect(user).toContain("The bunny plays.");
    // The `bust` slot of `solo-center` lists its poses (R35).
    const solo = user.slice(user.indexOf("solo-center"));
    expect(solo).toMatch(/slot "bust" accepts character, poses \["bust"\]/);
    expect(user).toMatch(/test-bunny/);
    expect(system).toMatch(/bust/);
    expect(system).toMatch(/JSON/);
  });

  it("RUN-03.S16 the model picks the backdrop from the frozen registry", async () => {
    await seedRegistry(env);
    // The registry that `freeze` stores.
    const registry = await loadActiveRegistry(getDb(env.DB));
    const schema = buildSceneJsonSchema({ registry, templates: TEMPLATES });
    expect(enumsOf(schema, "backdrop")).toEqual([["meadow", "riverbank"]]);
    const refs = enumsOf(schema, "ref").flat();
    expect(refs).toContain("test-bear");
    expect(refs).not.toContain("meadow");
    expect(refs).not.toContain("riverbank");
    const { user } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["test-bunny"], registry, templates: TEMPLATES });
    expect(user).toContain('- meadow: "an open meadow with soft hills"; skies ["day","cloudy","dusk","night"]');
    expect(user).toContain('- riverbank: "a grassy bank by a wide, slow river"; skies ["day","dusk","night"]');
  });

  it("scenePrompt states the bubble rule", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const { system } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["test-bunny"], registry, templates: TEMPLATES });
    expect(system).toContain("2 to 6 words");
    expect(system).toContain("at most 40 characters");
    expect(system).toContain("does not repeat the page text");
  });

  it("scenePrompt lists the assets each primitive works on", () => {
    const layer = (kind: "character" | "scenery") => ({
      kind,
      poses: [{ id: "stand", file: "stand.webp", foot: { x: 0, y: 0 }, box: { x: 0, y: 0, w: 1, h: 1 } }],
      expressions: [],
      legal: [],
      flippable: false,
    });
    const registry: RegistrySnapshot = {
      assets: {
        bear: { kind: "character", renderer: "webp", version: 1, manifest: layer("character") },
        pip: { kind: "character", renderer: "svg-rig", version: 1, manifest: layer("character") },
        ada: { kind: "character", renderer: "svg-rig", version: 1, manifest: layer("character") },
        tree: { kind: "scenery", renderer: "webp", version: 1, manifest: layer("scenery") },
        chime: { kind: "sfx", renderer: "audio", version: 1, manifest: { kind: "sfx", file: "chime.mp3", durationMs: 300 } },
      },
    };
    const { user } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["bear"], registry, templates: TEMPLATES });
    expect(user).toContain(
      [
        "Animations (primitive: the assets it works on):",
        "- float: all",
        '- sway: ["tree"]',
        "- bounce: all",
        "- pop: all",
        "- fade-in: all",
        '- blink: ["ada","pip"]',
        '- wave: ["ada","pip"]',
      ].join("\n"),
    );
  });

  it("scenePrompt gives an empty list for a primitive that no asset can play", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const { user } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["test-bunny"], registry, templates: TEMPLATES });
    expect(user).toContain("- blink: []\n- wave: []");
  });

  it("scenePrompt states the primitive rule", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const { system } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["test-bunny"], registry, templates: TEMPLATES });
    expect(system).toContain('only on a layer whose asset its line under "Animations" names');
    expect(system.split("\n").at(-1)).toBe("Answer with JSON only.");
  });

  it("scenePrompt lists a missing cast key as unknown", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const { user } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["test-bunny", "ghost-key"], registry, templates: TEMPLATES });
    expect(user).toContain("- ghost-key: unknown");
    expect(user).toMatch(/- test-bunny: no description; poses/);
  });

  it("scenePrompt gives each template its description", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const { user } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["test-bunny"], registry, templates: TEMPLATES });
    for (const t of TEMPLATES) expect(user).toContain(`Template "${t.id}": ${TEMPLATE_DESCRIPTIONS[t.id]}`);
  });

  it("scenePrompt gives each layer asset its description", () => {
    const layer = (kind: "character" | "prop" | "scenery", description?: string) => ({
      kind,
      ...(description === undefined ? {} : { description }),
      poses: [{ id: "stand", file: "stand.webp", foot: { x: 0, y: 0 }, box: { x: 0, y: 0, w: 1, h: 1 } }],
      expressions: [],
      legal: [],
      flippable: false,
    });
    const registry = {
      assets: {
        bear: { kind: "character", renderer: "webp", version: 1, manifest: layer("character", "a brown bear") },
        ball: { kind: "prop", renderer: "webp", version: 1, manifest: layer("prop", "a red ball") },
        tree: { kind: "scenery", renderer: "webp", version: 1, manifest: layer("scenery", "a tall tree") },
        nodesc: { kind: "scenery", renderer: "webp", version: 1, manifest: layer("scenery") },
        chime: { kind: "sfx", renderer: "audio", version: 1, manifest: { kind: "sfx", file: "chime.mp3", durationMs: 300 } },
      },
    } as RegistrySnapshot;
    const { user } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["bear"], registry, templates: TEMPLATES });
    expect(user).toContain('- bear: "a brown bear"; poses ["stand"]; expressions []; legal pairs []');
    expect(user).toContain(
      'Other assets:\n- ball (prop): "a red ball"\n- nodesc (scenery): no description\n- tree (scenery): "a tall tree"\n- sfx: ["chime"]',
    );
  });

  it("scenePrompt states the tap and expression rules", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const { system } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["test-bunny"], registry, templates: TEMPLATES });
    expect(system).toContain("whose descriptions fit the page text");
    expect(system).toContain("Give every character layer a tap");
    expect(system).toContain("from the feeling words of the page text");
    expect(system).toContain("Never use `set_expression` with the expression that its target layer already has.");
    expect(system.split("\n").at(-1)).toBe("Answer with JSON only.");
  });

  it("the models do not see door and window", () => {
    // The scene schema needs a non-empty list of expressions and of backdrops (draft.ts `oneOf`).
    const layer = (kind: "character" | "scenery", expressions: string[] = []) => ({
      kind,
      poses: [{ id: "stand", file: "stand.webp", foot: { x: 0, y: 0 }, box: { x: 0, y: 0, w: 1, h: 1 } }],
      expressions,
      legal: [],
      flippable: false,
    });
    const r: RegistrySnapshot = {
      assets: {
        bear: { kind: "character", renderer: "webp", version: 1, manifest: layer("character", ["happy"]) },
        tree: { kind: "scenery", renderer: "webp", version: 1, manifest: layer("scenery") },
        door: { kind: "scenery", renderer: "webp", version: 1, manifest: layer("scenery") },
        window: { kind: "scenery", renderer: "webp", version: 1, manifest: layer("scenery") },
        chime: { kind: "sfx", renderer: "audio", version: 1, manifest: { kind: "sfx", file: "chime.mp3", durationMs: 300 } },
      },
    };
    expect(Object.keys(modelRegistry(r).assets).sort()).toEqual(["bear", "chime", "tree"]);
    expect(Object.keys(r.assets)).toHaveLength(5);
    const { user } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["bear"], registry: modelRegistry(r), templates: TEMPLATES });
    expect(user).not.toMatch(/\b(door|window)\b/);
    expect(user).toContain('- sway: ["tree"]');
    // `r` stays at the 5 keys of the section; the schema call adds one backdrop, which it requires.
    const meadow = {
      kind: "backdrop" as const,
      renderer: "svg" as const,
      version: 1,
      manifest: { kind: "backdrop" as const, description: "a meadow", size: { width: 2400 as const, height: 1200 as const }, variants: [{ sky: "day" as const, file: "day.svg" }] },
    };
    const forSchema: RegistrySnapshot = { assets: { ...modelRegistry(r).assets, meadow } };
    expect(enumsOf(buildSceneJsonSchema({ registry: forSchema, templates: TEMPLATES }), "ref")).toEqual([["bear", "tree"]]);
  });

  it("scenePrompt gives the story so far", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const input = {
      beat: "b",
      pageText: "Page 3. Hi.",
      cast: ["test-bunny"],
      registry,
      templates: TEMPLATES,
      story: { page: 3, pages: 7, earlier: [{ templateId: "solo-center", sky: "day", scenery: ["tree"] }, null] },
    } as Parameters<typeof scenePrompt>[0];
    expect(scenePrompt(input).user).toContain(
      'Story so far (page: template, sky, scenery keys):\n- page 1: solo-center, day, ["tree"]\n- page 2: no scene\nThis page: 3 of 7\n\nBeat:',
    );
    const first = { ...input, story: { page: 1, pages: 7, earlier: [] } } as Parameters<typeof scenePrompt>[0];
    expect(scenePrompt(first).user).toContain("Story so far (page: template, sky, scenery keys):\n- none\nThis page: 1 of 7\n\nBeat:");
  });

  it("sceneSummary gives the template, the sky, and the sorted unique scenery keys that the model sees", () => {
    const shown = { assets: { tree: {}, bush: {} } } as unknown as RegistrySnapshot;
    const scene = {
      templateId: "big-sky",
      sky: "dusk",
      layers: [
        { kind: "scenery", ref: "tree" },
        { kind: "character", ref: "bear" },
        { kind: "scenery", ref: "bush" },
        { kind: "scenery", ref: "tree" },
        { kind: "scenery", ref: "door" },
      ],
    } as PageScene;
    expect(sceneSummary(scene, shown)).toEqual({ templateId: "big-sky", sky: "dusk", scenery: ["bush", "tree"] });
  });

  it("scenePrompt states the neighbour, sky, and last-page rules", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const input = {
      beat: "b",
      pageText: "Page 1. Hi.",
      cast: ["test-bunny"],
      registry,
      templates: TEMPLATES,
      story: { page: 1, pages: 1, earlier: [] },
    } as Parameters<typeof scenePrompt>[0];
    const { system } = scenePrompt(input);
    expect(system).toContain("Do not use the template of the page just before this one");
    expect(system).toContain("Change the sky only when the page text gives a reason");
    expect(system).toContain("choose `dusk` or `night`");
    expect(system.split("\n").at(-1)).toBe("Answer with JSON only.");
  });

  it("scriptPrompt states the reader age, the page count, and the cast rule", () => {
    const registry = { assets: {} };
    const { system, user } = scriptPrompt({ sourceText: "A short news text.", registry });
    expect(system).toMatch(/5 to 7/);
    expect(system).toMatch(/6 to 8 pages/);
    expect(system).toMatch(/40 words/);
    expect(user).toContain("A short news text.");
  });

  it("scriptPrompt gives the poses, props, and scenery, and the script rules", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const { system, user } = scriptPrompt({ sourceText: "A short news text.", registry });
    expect(user).toContain("Characters (key: poses):\n- test-bear: stand, wave\n- test-bunny: stand, wave");
    expect(user).toContain("Props (key):\n- test-ball");
    expect(user).toContain("Scenery (key):\n- test-tree");
    expect(system).toContain("at most 12 words");
    expect(system).toContain("at most 2 real-world names");
    expect(system).toContain("Leave out personal names, dates, and money.");
    expect(system).toContain("outdoors");
    expect(system).toContain("The last page");
    expect(system).not.toContain("Keep the facts of the news");
  });

  it("repairSuffix lists the previous answer and every issue", () => {
    const suffix = repairSuffix({ a: 1 }, [{ path: "interactions", code: "too_small", message: "Too small" }]);
    expect(suffix).toBe('\n\nYour previous answer:\n{"a":1}\n\nFix these problems and answer again:\n- interactions: Too small');
  });
});
