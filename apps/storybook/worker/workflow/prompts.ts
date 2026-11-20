import {
  type AssetManifest,
  type Issue,
  type LayoutTemplate,
  type PageScene,
  type PrimitiveId,
  type RegistrySnapshot,
  isLayerManifest,
  PRIMITIVE_IDS,
  PRIMITIVES,
  primitiveAllows,
  SCRIPT_TEXT_LIMITS,
} from "@storybook/dsl";
import { TEMPLATE_DESCRIPTIONS } from "@storybook/layout";

// Prompts for the script and scene steps (#18, Exact changes 10). Never log a
// prompt or an output.

export const UNPARSED_PREVIOUS = "(the answer was not valid JSON)";

const keysOf = (registry: RegistrySnapshot, kind: string) =>
  Object.keys(registry.assets)
    .filter((key) => registry.assets[key]!.kind === kind)
    .sort();

// Keys that the models do not see until an indoor backdrop exists (ADR 0016; #84).
// Validation still uses the whole frozen registry.
export const HIDDEN_FROM_MODEL: readonly string[] = ["door", "window"];

// The registry that prompts and model JSON schemas use (#84).
export function modelRegistry(registry: RegistrySnapshot): RegistrySnapshot {
  return { assets: Object.fromEntries(Object.entries(registry.assets).filter(([key]) => !HIDDEN_FROM_MODEL.includes(key))) };
}

export type SceneSummary = { templateId: string; sky: string; scenery: string[] };

export function sceneSummary(scene: PageScene, shown: RegistrySnapshot): SceneSummary {
  return {
    templateId: scene.templateId,
    sky: scene.sky,
    scenery: [...new Set(scene.layers.filter((l) => l.kind === "scenery" && shown.assets[l.ref] !== undefined).map((l) => l.ref))].sort(),
  };
}

const PROMPT_PRIMITIVE_KIND: Partial<Record<PrimitiveId, string>> = { sway: "scenery" }; // Prompt rule (#84); validation allows sway on every layer.

export function scriptPrompt(input: { sourceText: string; registry: RegistrySnapshot }): { system: string; user: string } {
  const system = [
    "You write a short picture story for a child aged 5 to 7, from a news text.",
    "Write 6 to 8 pages.",
    "Each page has 1 to 3 sentences and at most 40 words.",
    `Each sentence has at most ${SCRIPT_TEXT_LIMITS.maxWordsPerSentence} words.`,
    "Keep the one or two main facts of the news: what happened and what is new.",
    "Tell them as something the cast do in their own world. The world is outdoors: no page is inside a building or in space.",
    "Leave out personal names, dates, and money. Leave out frightening details.",
    `Use at most ${SCRIPT_TEXT_LIMITS.maxNames} real-world names in the whole story. Code counts each capitalised word inside a sentence that is not a cast key as part of a real-world name, for example a place, a group, a project, a day, or a month.`,
    "Every page names a cast member who does something.",
    "Write only actions and things that the lists below can show: an action is one of the character's poses, and a thing is a prop or scenery key.",
    "A pose that is a view (front, three-quarter, side, back, bust) means that the character stands.",
    "The last page is slow and calm, and the cast get ready for sleep.",
    "`cast` uses only the listed character keys.",
    "Answer with JSON that matches the schema only.",
  ].join("\n");
  // The registry snapshot has no display names: the key is the readable name.
  const characters = keysOf(input.registry, "character").map((key) => {
    const m = input.registry.assets[key]!.manifest;
    if (!isLayerManifest(m)) return `- ${key}: no poses`;
    const poses = [...new Set(m.poses.map((p) => p.id))].sort();
    return `- ${key}: ${poses.join(", ")}`;
  });
  const props = keysOf(input.registry, "prop").map((key) => `- ${key}`);
  const scenery = keysOf(input.registry, "scenery").map((key) => `- ${key}`);
  const user = [
    "Characters (key: poses):",
    ...characters,
    "",
    "Props (key):",
    ...props,
    "",
    "Scenery (key):",
    ...scenery,
    "",
    "News text:",
    input.sourceText,
  ].join("\n");
  return { system, user };
}

export function scenePrompt(input: {
  beat: string;
  pageText: string;
  cast: string[];
  registry: RegistrySnapshot;
  templates: LayoutTemplate[];
  story: { page: number; pages: number; earlier: Array<SceneSummary | null> };
}): { system: string; user: string } {
  const system = [
    "You choose the picture for one page of a children's story.",
    "Choose one `templateId`.",
    "Choose one `backdrop` and a `sky` that the backdrop has.",
    "Put a registry key whose kind matches each slot's `accepts` into that slot.",
    "Use only legal pose and expression pairs.",
    "Include at least one character, one animation, and one tap interaction.",
    'Use a primitive (in `animations` or in a `play_animation` action) only on a layer whose asset its line under "Animations" names; "all" means every asset.',
    "Name layers by slot ID: every `target` and `on.tap` is a slot ID.",
    'A `bust` pose goes only into a slot that lists it in `poses`.',
    "Each template and each asset has a description. Choose the template and the assets whose descriptions fit the page text. Do not use an asset for a thing that its description does not name.",
    "Give every character layer a tap: an interaction whose `on.tap` is that character's slot.",
    'Choose each character\'s expression from the feeling words of the page text (for example "sad", "surprised", "worried"), from its legal pairs. Use `happy` only when the text is happy, has no feeling word, or no legal pair has that feeling.',
    "Never use `set_expression` with the expression that its target layer already has.",
    'Do not use the template of the page just before this one (the last line under "Story so far"). Do not use exactly the same set of scenery keys as that page either.',
    "Keep the sky of the page just before this one. Change the sky only when the page text gives a reason: a time of day, the weather, or the cast getting ready for sleep.",
    'On the last page ("This page: N of N"), choose `dusk` or `night` when the backdrop has one, even when the page text gives no reason for a change.',
    "A bubble (`show_bubble` text) is a short line that the character says: 2 to 6 words, at most 40 characters.",
    'A bubble ends with ".", "!", or "?". Use only English letters, digits, spaces, and plain ASCII punctuation: no long dashes, no ellipsis character, no curly quotes.',
    "A bubble does not repeat the page text.",
    "Answer with JSON only.",
  ].join("\n");

  const templates = input.templates.flatMap((t) => [
    `Template "${t.id}": ${TEMPLATE_DESCRIPTIONS[t.id] ?? "no description"}`,
    ...t.slots.map(
      (s) => `  - slot "${s.id}" accepts ${s.accepts}` + (s.poses ? `, poses ${JSON.stringify(s.poses)}` : ""),
    ),
  ]);
  // Each backdrop with its description and its sky palettes (ADR 0016 section 1).
  const backdrops = Object.keys(input.registry.assets)
    .sort()
    .flatMap((key) => {
      const a = input.registry.assets[key]!;
      if (a.kind !== "backdrop" || a.manifest.kind !== "backdrop") return [];
      const skies = a.manifest.variants.map((v) => v.sky);
      return [`- ${key}: ${JSON.stringify(a.manifest.description)}; skies ${JSON.stringify(skies)}`];
    });
  const describe = (m: AssetManifest) => (isLayerManifest(m) && m.description !== undefined ? JSON.stringify(m.description) : "no description");
  const cast = input.cast.flatMap((key) => {
    const m = input.registry.assets[key]?.manifest;
    // A cast key that is not a visual asset stays visible to the model (review item 3).
    if (!m || !isLayerManifest(m)) return [`- ${key}: unknown`];
    const poses = [...new Set(m.poses.map((p) => p.id))];
    return [
      `- ${key}: ${describe(m)}; poses ${JSON.stringify(poses)}; expressions ${JSON.stringify(m.expressions)}; legal pairs ${JSON.stringify(
        m.legal.map((p) => `${p.pose}/${p.expression}`),
      )}`,
    ];
  });
  // Props, scenery, and sounds, so the model can fill the other slots.
  const others = [
    ...(["prop", "scenery"] as const).flatMap((kind) =>
      keysOf(input.registry, kind).map((key) => `- ${key} (${kind}): ${describe(input.registry.assets[key]!.manifest)}`),
    ),
    `- sfx: ${JSON.stringify(keysOf(input.registry, "sfx"))}`,
  ];
  // Each primitive with the layer assets that it works on (#63).
  const layerKeys = Object.keys(input.registry.assets)
    .filter((key) => isLayerManifest(input.registry.assets[key]!.manifest))
    .sort();
  // `sway` lists scenery keys only (#84, PROMPT_PRIMITIVE_KIND).
  const animations = PRIMITIVE_IDS.map((id) => {
    const kind = PROMPT_PRIMITIVE_KIND[id];
    if (PRIMITIVES[id].renderers === "all" && kind === undefined) return `- ${id}: all`;
    const keys = layerKeys.filter(
      (key) =>
        primitiveAllows(id, input.registry.assets[key]!.renderer) && (kind === undefined || input.registry.assets[key]!.kind === kind),
    );
    return `- ${id}: ${JSON.stringify(keys)}`;
  });
  // The earlier pages of the story (#105); no `Page <n>.` marker here.
  const { story } = input;
  const earlier =
    story.earlier.length === 0
      ? ["- none"]
      : story.earlier.map((s, k) => (s ? `- page ${k + 1}: ${s.templateId}, ${s.sky}, ${JSON.stringify(s.scenery)}` : `- page ${k + 1}: no scene`));
  const user = [
    "Templates:",
    ...templates,
    "",
    "Backdrops:",
    ...backdrops,
    "",
    "Cast:",
    ...cast,
    "",
    "Other assets:",
    ...others,
    "",
    "Animations (primitive: the assets it works on):",
    ...animations,
    "",
    "Story so far (page: template, sky, scenery keys):",
    ...earlier,
    `This page: ${story.page} of ${story.pages}`,
    "",
    "Beat:",
    input.beat,
    "",
    "Page text:",
    input.pageText,
  ].join("\n");
  return { system, user };
}

export function repairSuffix(previous: unknown, issues: Issue[]): string {
  return (
    "\n\nYour previous answer:\n" +
    JSON.stringify(previous) +
    "\n\nFix these problems and answer again:\n" +
    issues.map((i) => `- ${i.path}: ${i.message}`).join("\n")
  );
}
