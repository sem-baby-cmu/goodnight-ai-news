// S2 supplement (#26): the issues of every failed attempt of a stored run.
// The workflow stores no issues for an attempt that a repair follows (#64).
// So this script runs each stored `script` and `scene` answer through the same
// checks, in the same order, as `worker/workflow/steps/scene.ts` `checkScene`
// and `steps/script.ts` `checkScript`. It prints only counts, one JSON
// line per rows file (AGENTS.md section 5).
//
//   pnpm --filter @storybook/app exec tsx scripts/s2/analyze.ts .s2/rows-<slug>-<time>.json ...
//
// The rows files are the ones `s2-run.ts` saves before it writes fixtures.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type Issue,
  OutlineSchema,
  PageSceneSchema,
  PageTextSchema,
  type RegistrySnapshot,
  SceneDraftSchema,
  ScriptDraftSchema,
  assignSceneIds,
  scriptTextIssues,
  validateScene,
} from "@storybook/dsl";
import { TEMPLATES, layoutScene } from "@storybook/layout";
import { type S2Rows, json } from "./rows";

type Result = { kind?: unknown; value?: unknown };
type Counts = Record<string, number>;

const issue = (code: string, message = "", where = ""): Issue => ({ path: where, code, message }) as Issue;
const zod = (issues: ReadonlyArray<{ code: string; message: string }>): Issue[] => issues.map((i) => issue(i.code, i.message));
const add = (into: Counts, key: string): void => {
  into[key] = (into[key] ?? 0) + 1;
};

// The IDs only have to be unique inside one scene; they do not change issues.
let seq = 0;
const newId = () => `00000000-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

function notAnswer(result: Result): Issue[] | undefined {
  if (result.kind === "unparsed") return [issue("model_output_unparsed")];
  if (result.kind !== "answer") return [issue(`kind_${String(result.kind)}`)];
  return undefined;
}

function sceneIssues(result: Result, registry: RegistrySnapshot): Issue[] {
  const early = notAnswer(result);
  if (early) return early;
  const draft = SceneDraftSchema.safeParse(result.value);
  if (!draft.success) return zod(draft.error.issues);
  const scene = assignSceneIds(draft.data, newId);
  const schema = PageSceneSchema.safeParse(scene);
  if (!schema.success) return zod(schema.error.issues);
  const ctx = { registry, templates: TEMPLATES };
  const semantic = validateScene(scene, ctx);
  if (semantic.length > 0) return semantic;
  return layoutScene(scene, ctx).issues;
}

function scriptIssues(result: Result, registry: RegistrySnapshot): Issue[] {
  const early = notAnswer(result);
  if (early) return early;
  const value = result.value as { pages?: Array<Record<string, unknown>> } | null;
  const pages = Array.isArray(value?.pages) ? value.pages : undefined;
  const stripped = pages ? { ...value, pages: pages.map(({ pageId: _pageId, ...rest }) => rest) } : value;
  const draft = ScriptDraftSchema.safeParse(stripped);
  if (!draft.success) return zod(draft.error.issues);
  const ids = pages!.map((p) => p.pageId as string);
  const issues: Issue[] = [];
  const outline = OutlineSchema.safeParse({
    title: draft.data.title,
    ageBand: "5-7",
    cast: draft.data.cast,
    pages: draft.data.pages.map((p, i) => ({ pageId: ids[i], beat: p.beat })),
  });
  if (!outline.success) issues.push(...zod(outline.error.issues));
  for (const p of draft.data.pages) {
    const text = PageTextSchema.safeParse({ text: p.text });
    if (!text.success) issues.push(...zod(text.error.issues));
  }
  for (const key of draft.data.cast) if (registry.assets[key]?.kind !== "character") issues.push(issue("unknown_character"));
  issues.push(...scriptTextIssues(draft.data.pages, draft.data.cast));
  return issues;
}

const PRIMITIVE = /Primitive "([^"]+)" does not work on the renderer of "([^"]+)"/;

// A short, text-free label for an issue: the primitive, the asset kind and
// renderer, and where in the scene; or the message of a `custom` issue with its
// numbers removed.
function detailOf(i: Issue, registry: RegistrySnapshot): string {
  const m = PRIMITIVE.exec(i.message);
  if (m) {
    const asset = registry.assets[m[2]!];
    return `${m[1]} on ${String(asset?.kind)}/${String(asset?.renderer)} at ${i.path.split(".")[0]}`;
  }
  return i.code === "custom" ? i.message.replace(/\d+/g, "N") : "";
}

function analyze(rows: S2Rows) {
  const registry = json(rows.run.registry) as RegistrySnapshot;
  const codes: Counts = {};
  const raw: Counts = {};
  const detail: Counts = {};
  const byModel: Record<string, { calls: number; input: number; output: number }> = {};
  const blank = () => ({ first: 0, firstFailed: 0, repair: 0, repairFailed: 0 });
  const attempts = { scene: blank(), script: blank() };
  let audioCalls = 0;
  let audioUsage = 0;
  for (const c of rows.calls) {
    const usage = json(c.usage) as { inputTokens?: number; outputTokens?: number } | null;
    if (c.step.startsWith("audio:")) {
      audioCalls++;
      if (usage) audioUsage++;
      continue;
    }
    const m = (byModel[c.model] ??= { calls: 0, input: 0, output: 0 });
    m.calls++;
    m.input += usage?.inputTokens ?? 0;
    m.output += usage?.outputTokens ?? 0;
    const kind = c.step === "script" ? "script" : "scene";
    const result = (json(c.result) ?? {}) as Result;
    const issues = kind === "script" ? scriptIssues(result, registry) : sceneIssues(result, registry);
    const a = attempts[kind];
    a[c.purpose]++;
    if (issues.length === 0) continue;
    a[c.purpose === "first" ? "firstFailed" : "repairFailed"]++;
    for (const code of new Set(issues.map((i) => i.code))) add(codes, `${kind}:${code}`);
    for (const i of issues) {
      add(raw, `${kind}:${i.code}`);
      const d = detailOf(i, registry);
      if (d) add(detail, d);
    }
  }
  const wallMs = rows.run.finished_at ? Date.parse(rows.run.finished_at) - Date.parse(rows.run.created_at) : null;
  return { wallMs, attempts, byModel, audioCalls, audioUsage, codes, raw, detail };
}

for (const file of process.argv.slice(2)) {
  const rows = JSON.parse(readFileSync(file, "utf8")) as S2Rows;
  console.log(JSON.stringify({ file: path.basename(file), ...analyze(rows) }));
}
