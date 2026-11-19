import { describe, expect, it } from "vitest";
import { buildOutlineJsonSchema, buildSceneJsonSchema } from "./json-schema";
import type { RegistrySnapshot } from "./registry";
import { ctx, registry, soloCenter, twoFriends } from "./test/fixtures";

type Node = Record<string, unknown>;

function walk(node: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
  } else if (node !== null && typeof node === "object") {
    visit(node as Node);
    for (const value of Object.values(node)) walk(value, visit);
  }
}

// Every schema node found under a property with this name.
function propertyNodes(schema: unknown, name: string): Node[] {
  const found: Node[] = [];
  walk(schema, (n) => {
    const props = n.properties as Record<string, Node> | undefined;
    if (props && n.type === "object" && name in props) found.push(props[name]!);
  });
  return found;
}

// The allowed values of one node: `enum`, `const`, or the members of `anyOf`.
function allowed(node: Node): unknown[] {
  if (Array.isArray(node.enum)) return node.enum;
  if ("const" in node) return [node.const];
  if (node.type === "null") return [null];
  if (Array.isArray(node.anyOf)) return (node.anyOf as Node[]).flatMap(allowed);
  return ["<any>"];
}

function enumsOf(schema: unknown, name: string): unknown[][] {
  return propertyNodes(schema, name).map(allowed);
}

const sorted = (values: unknown[]) =>
  [...values].sort((a, b) => String(a).localeCompare(String(b)));

describe("json-schema", () => {
  it("buildSceneJsonSchema is strict", () => {
    const schema = buildSceneJsonSchema(ctx());
    expect(JSON.stringify(schema)).not.toContain("$ref");
    let objects = 0;
    walk(schema, (n) => {
      if (n.type !== "object") return;
      objects++;
      expect(n.additionalProperties).toBe(false);
      expect(sorted((n.required as string[]) ?? [])).toEqual(sorted(Object.keys((n.properties as Node) ?? {})));
    });
    expect(objects).toBeGreaterThan(5);
  });

  it("buildOutlineJsonSchema is strict", () => {
    const schema = buildOutlineJsonSchema(registry());
    expect(JSON.stringify(schema)).not.toContain("$ref");
    walk(schema, (n) => {
      if (n.type !== "object") return;
      expect(n.additionalProperties).toBe(false);
      expect(sorted((n.required as string[]) ?? [])).toEqual(sorted(Object.keys((n.properties as Node) ?? {})));
    });
  });

  it("RUN-03.S2 buildSceneJsonSchema enums come from registry", () => {
    const schema = buildSceneJsonSchema(ctx());
    const poses = ["bust", "default", "front", "perch", "stand", "wave"];
    const slots = ["ground-1", "left", "right", "sky-1"];

    expect(enumsOf(schema, "templateId")).toEqual([["two-friends"]]);
    expect(enumsOf(schema, "ref")).toEqual([["ball", "owl", "pip", "tree"]]);
    expect(enumsOf(schema, "sfx")).toEqual([["boing"]]);
    expect(enumsOf(schema, "sky")).toEqual([["day", "cloudy", "dusk", "night"]]);
    expect(enumsOf(schema, "slot")).toEqual([slots]);
    expect(enumsOf(schema, "tap")).toEqual([slots]);
    const targets = enumsOf(schema, "target");
    expect(targets.length).toBeGreaterThan(1);
    for (const t of targets) expect(t).toEqual(slots);

    const poseEnums = enumsOf(schema, "pose");
    expect(poseEnums.length).toBe(2); // the layer and the set_pose action
    for (const p of poseEnums) expect(p).toEqual(poses);

    const expressionEnums = enumsOf(schema, "expression");
    expect(expressionEnums.length).toBe(2); // the layer and the set_expression action
    expect(expressionEnums).toContainEqual(["calm", "happy", "sad", null]);
    expect(expressionEnums).toContainEqual(["calm", "happy", "sad"]);

    for (const p of enumsOf(schema, "primitive")) {
      expect(sorted(p)).toEqual(["blink", "bounce", "fade-in", "float", "pop", "sway", "wave"]);
    }

    // A second registry with one more asset: the schema follows the registry it gets.
    const bigger: RegistrySnapshot = registry();
    bigger.assets.fox = { ...bigger.assets.owl!, version: 3 };
    const schema2 = buildSceneJsonSchema({ registry: bigger, templates: [twoFriends(), soloCenter()] });
    expect(enumsOf(schema2, "ref")).toEqual([["ball", "fox", "owl", "pip", "tree"]]);
    expect(enumsOf(schema2, "templateId")).toEqual([["solo-center", "two-friends"]]);
    expect(enumsOf(schema2, "slot")).toEqual([["bust", ...slots]]);
  });

  it("buildSceneJsonSchema omits play_sfx without sfx assets", () => {
    const reg = registry();
    delete reg.assets.boing;
    const schema = buildSceneJsonSchema({ registry: reg, templates: [twoFriends()] });
    const actions = enumsOf(schema, "action").flat();
    expect(actions).not.toContain("play_sfx");
    expect(sorted(actions)).toEqual(["play_animation", "set_expression", "set_pose", "show_bubble"]);
    expect(enumsOf(schema, "sfx")).toEqual([]);
  });

  it("buildSceneJsonSchema bounds animation params", () => {
    const schema = buildSceneJsonSchema(ctx());
    const amplitude = propertyNodes(schema, "amplitude");
    expect(amplitude).toEqual([expect.objectContaining({ minimum: 0.005, maximum: 0.03 })]);
    const counts = propertyNodes(schema, "count");
    for (const c of counts) expect(c).toEqual(expect.objectContaining({ type: "integer", minimum: 1, maximum: 3 }));
  });

  it("buildOutlineJsonSchema cast enum is characters only", () => {
    const schema = buildOutlineJsonSchema(registry());
    const cast = propertyNodes(schema, "cast");
    expect(cast).toHaveLength(1);
    expect((cast[0]!.items as Node).enum).toEqual(["owl", "pip"]);
    const pages = propertyNodes(schema, "pages")[0]!;
    expect(pages).toEqual(expect.objectContaining({ minItems: 6, maxItems: 8 }));
  });

  it("buildOutlineJsonSchema throws without characters", () => {
    const reg = registry();
    delete reg.assets.pip;
    delete reg.assets.owl;
    expect(() => buildOutlineJsonSchema(reg)).toThrow("registry has no character assets");
  });
});
