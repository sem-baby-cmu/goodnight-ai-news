import {
  type Issue,
  type LayoutTemplate,
  type RegistrySnapshot,
  isLayerManifest,
  PRIMITIVE_IDS,
  PRIMITIVES,
  primitiveAllows,
  SCRIPT_TEXT_LIMITS,
} from "@storybook/dsl";

// Prompts for the script and scene steps (#18, Exact changes 10). Never log a
// prompt or an output.

export const UNPARSED_PREVIOUS = "(the answer was not valid JSON)";

const keysOf = (registry: RegistrySnapshot, kind: string) =>
  Object.keys(registry.assets)
    .filter((key) => registry.assets[key]!.kind === kind)
    .sort();

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
    "A bubble (`show_bubble` text) is a short line that the character says: 2 to 6 words, at most 40 characters.",
    'A bubble ends with ".", "!", or "?". Use only English letters, digits, spaces, and plain ASCII punctuation: no long dashes, no ellipsis character, no curly quotes.',
    "A bubble does not repeat the page text.",
    "Answer with JSON only.",
  ].join("\n");

  const templates = input.templates.flatMap((t) => [
    `Template "${t.id}":`,
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
  const cast = input.cast.flatMap((key) => {
    const m = input.registry.assets[key]?.manifest;
    // A cast key that is not a visual asset stays visible to the model (review item 3).
    if (!m || !isLayerManifest(m)) return [`- ${key}: unknown`];
    const poses = [...new Set(m.poses.map((p) => p.id))];
    return [
      `- ${key}: poses ${JSON.stringify(poses)}; expressions ${JSON.stringify(m.expressions)}; legal pairs ${JSON.stringify(
        m.legal.map((p) => `${p.pose}/${p.expression}`),
      )}`,
    ];
  });
  // Props, scenery, and sounds, so the model can fill the other slots.
  const others = (["prop", "scenery", "sfx"] as const).map((kind) => `- ${kind}: ${JSON.stringify(keysOf(input.registry, kind))}`);
  // Each primitive with the layer assets that it works on (#63).
  const layerKeys = Object.keys(input.registry.assets)
    .filter((key) => isLayerManifest(input.registry.assets[key]!.manifest))
    .sort();
  const animations = PRIMITIVE_IDS.map((id) =>
    PRIMITIVES[id].renderers === "all"
      ? `- ${id}: all`
      : `- ${id}: ${JSON.stringify(layerKeys.filter((key) => primitiveAllows(id, input.registry.assets[key]!.renderer)))}`,
  );
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
