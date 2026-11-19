import { env } from "cloudflare:workers";
import { TEMPLATES } from "@storybook/layout";
import { describe, expect, it } from "vitest";
import { getDb, loadActiveRegistry } from "../db";
import { seedRegistry } from "../test/fixtures";
import { repairSuffix, scenePrompt, scriptPrompt } from "./prompts";

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
