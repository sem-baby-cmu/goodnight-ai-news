import { env } from "cloudflare:workers";
import { buildSceneJsonSchema } from "@storybook/dsl";
import { TEMPLATES } from "@storybook/layout";
import { describe, expect, it } from "vitest";
import { getDb, loadActiveRegistry } from "../db";
import { seedRegistry } from "../test/fixtures";
import { repairSuffix, scenePrompt, scriptPrompt } from "./prompts";

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

  it("scenePrompt lists a missing cast key as unknown", async () => {
    await seedRegistry(env);
    const registry = await loadActiveRegistry(getDb(env.DB));
    const { user } = scenePrompt({ beat: "b", pageText: "Page 1. Hi.", cast: ["test-bunny", "ghost-key"], registry, templates: TEMPLATES });
    expect(user).toContain("- ghost-key: unknown");
    expect(user).toMatch(/- test-bunny: poses/);
  });

  it("scriptPrompt states the reader age, the page count, and the cast rule", () => {
    const registry = { assets: {} };
    const { system, user } = scriptPrompt({ sourceText: "A short news text.", registry });
    expect(system).toMatch(/5 to 7/);
    expect(system).toMatch(/6 to 8 pages/);
    expect(system).toMatch(/40 words/);
    expect(user).toContain("A short news text.");
  });

  it("repairSuffix lists the previous answer and every issue", () => {
    const suffix = repairSuffix({ a: 1 }, [{ path: "interactions", code: "too_small", message: "Too small" }]);
    expect(suffix).toBe('\n\nYour previous answer:\n{"a":1}\n\nFix these problems and answer again:\n- interactions: Too small');
  });
});
