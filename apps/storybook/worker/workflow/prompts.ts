import type { Issue, LayoutTemplate, RegistrySnapshot } from "@storybook/dsl";

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
    "Keep the facts of the news. Leave out frightening details.",
    "`cast` uses only the listed character keys.",
    "Answer with JSON that matches the schema only.",
  ].join("\n");
  // The registry snapshot has no display names: the key is the readable name.
  const characters = keysOf(input.registry, "character").map((key) => `- ${key}`);
  const user = ["Characters (key):", ...characters, "", "News text:", input.sourceText].join("\n");
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
    "Put a registry key whose kind matches each slot's `accepts` into that slot.",
    "Use only legal pose and expression pairs.",
    "Include at least one character, one animation, and one tap interaction.",
    "Name layers by slot ID: every `target` and `on.tap` is a slot ID.",
    'A `bust` pose goes only into a slot that lists it in `poses`.',
    "Answer with JSON only.",
  ].join("\n");

  const templates = input.templates.flatMap((t) => [
    `Template "${t.id}":`,
    ...t.slots.map(
      (s) => `  - slot "${s.id}" accepts ${s.accepts}` + (s.poses ? `, poses ${JSON.stringify(s.poses)}` : ""),
    ),
  ]);
  const cast = input.cast.flatMap((key) => {
    const m = input.registry.assets[key]?.manifest;
    if (!m || m.kind === "sfx") return [];
    const poses = [...new Set(m.poses.map((p) => p.id))];
    return [
      `- ${key}: poses ${JSON.stringify(poses)}; expressions ${JSON.stringify(m.expressions)}; legal pairs ${JSON.stringify(
        m.legal.map((p) => `${p.pose}/${p.expression}`),
      )}`,
    ];
  });
  // Props, scenery, and sounds, so the model can fill the other slots.
  const others = (["prop", "scenery", "sfx"] as const).map((kind) => `- ${kind}: ${JSON.stringify(keysOf(input.registry, kind))}`);
  const user = [
    "Templates:",
    ...templates,
    "",
    "Cast:",
    ...cast,
    "",
    "Other assets:",
    ...others,
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
