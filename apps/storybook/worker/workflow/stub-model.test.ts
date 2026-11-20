import { env } from "cloudflare:workers";
import { type RegistrySnapshot, assignSceneIds, validateScene } from "@storybook/dsl";
import { TEMPLATES } from "@storybook/layout";
import { describe, expect, it } from "vitest";
import { getDb, loadActiveRegistry } from "../db";
import { newId } from "../db/ids";
import { seedRegistry } from "../test/fixtures";
import { stubScene } from "./stub-model";

async function registry(): Promise<RegistrySnapshot> {
  await seedRegistry(env);
  return loadActiveRegistry(getDb(env.DB));
}

describe("stubScene", () => {
  it("uses the first variant of the first backdrop key in sorted order", async () => {
    const r = await registry();
    const scene = stubScene(r);
    // meadow sorts before riverbank; its first variant is day.
    expect([scene.backdrop, scene.sky]).toEqual(["meadow", "day"]);
    expect(validateScene(assignSceneIds(scene, newId), { registry: r, templates: TEMPLATES })).toEqual([]);
  });

  it("works with a backdrop that has no day variant", async () => {
    const r = await registry();
    delete r.assets.meadow;
    const riverbank = r.assets.riverbank!;
    if (riverbank.manifest.kind !== "backdrop") throw new Error("riverbank is not a backdrop");
    r.assets.riverbank = { ...riverbank, manifest: { ...riverbank.manifest, variants: [{ sky: "night", file: "night.webp" }] } };
    const scene = stubScene(r);
    expect([scene.backdrop, scene.sky]).toEqual(["riverbank", "night"]);
    expect(validateScene(assignSceneIds(scene, newId), { registry: r, templates: TEMPLATES })).toEqual([]);
  });
});
