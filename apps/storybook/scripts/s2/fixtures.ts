// The S2 fixture folder (#26 step 5) and its checks (step 6).
// Page <n> is the 1-based position of the page in the run's outline.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Issue, OutlineSchema, PageSceneSchema, PageTextSchema, type RegistrySnapshot, validateScene } from "@storybook/dsl";
import { TEMPLATES, layoutScene } from "@storybook/layout";
import { type S2Rows, json } from "./rows";

export type Files = Record<string, unknown>;

type OutlineLike = { pages?: Array<{ pageId?: unknown }> } | null;

function pageIds(outline: unknown): string[] {
  const pages = (outline as OutlineLike)?.pages;
  return Array.isArray(pages) ? pages.map((p) => String(p?.pageId)) : [];
}

function stepKind(step: string): string {
  return step.split(":")[0]!;
}

// Maps the rows of one run to the files of its fixture folder. Rows that do not
// describe one run (two revisions for one file, a revision of a call that is
// not in the run, a page outside the outline) are an error, never a choice.
export function fixtureFiles(rows: S2Rows): Files {
  const files: Files = {};
  const put = (file: string, value: unknown, what: string) => {
    if (file in files) throw new Error(`two ${what}`);
    files[file] = value;
  };
  const calls = new Map(rows.calls.map((c) => [c.call_id, c]));
  const outlines = rows.revisions.filter((r) => r.kind === "outline");
  if (outlines.length > 1) throw new Error("two outline revisions");
  const pageNo = new Map(pageIds(json(outlines[0]?.content ?? null)).map((id, i) => [id, i + 1]));
  const pageOf = (pageId: string, what: string) => {
    const n = pageNo.get(pageId);
    if (n === undefined) throw new Error(`${what} for page ${pageId}, which is not in the outline`);
    return n;
  };

  const models: Record<string, string[]> = {};
  for (const c of rows.calls) models[stepKind(c.step)] = [...new Set([...(models[stepKind(c.step)] ?? []), c.model])].sort();
  files["registry.json"] = json(rows.run.registry);
  files["run.json"] = {
    runId: rows.runId,
    storyId: rows.storyId,
    status: rows.run.status,
    createdAt: rows.run.created_at,
    finishedAt: rows.run.finished_at,
    models,
  };

  for (const c of rows.calls) {
    const kind = stepKind(c.step);
    if (kind === "audio") continue; // No audio files in the fixtures.
    if (kind !== "script" && kind !== "scene") throw new Error(`unknown step ${c.step}`);
    const n = kind === "script" ? "script" : `page-${pageOf(c.page_id, "a scene call")}.scene`;
    put(`calls/${n}.${c.purpose}.json`, { result: json(c.result), usage: json(c.usage) }, `${c.purpose} calls of ${n}`);
  }

  for (const r of rows.revisions) {
    const call = calls.get(r.call_id);
    if (!call) throw new Error(`revision ${r.id}: call ${r.call_id} is not a call of this run`);
    const value = { id: r.id, status: r.status, error: json(r.error), content: json(r.content) };
    if (r.kind === "outline") put("revisions/outline.json", value, "outline revisions");
    else if (r.kind === "page_text") {
      const n = pageOf(r.page_id, "a page text");
      put(`revisions/page-${n}.text.json`, value, `page text revisions for page ${n}`);
    } else if (r.kind === "scene") {
      if (call.step !== `scene:${r.page_id}`) throw new Error(`revision ${r.id}: its call is step ${call.step}`);
      const n = pageOf(r.page_id, "a scene");
      put(`revisions/page-${n}.scene.json`, value, `scene revisions for page ${n}`);
    }
  }
  return files;
}

export function writeFixtures(dir: string, files: Files): void {
  for (const [file, value] of Object.entries(files)) {
    const p = path.join(dir, file);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
  }
}

const BASE_FILES = ["registry.json", "run.json", "calls/script.first.json", "revisions/outline.json"];

function read(dir: string, file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
}

function outlinePages(dir: string): string[] {
  return existsSync(path.join(dir, "revisions/outline.json")) ? pageIds(read(dir, "revisions/outline.json").content) : [];
}

// The files that every recorded story must have (s2.test.ts).
export function missingFixtureFiles(dir: string): string[] {
  const pages = outlinePages(dir).flatMap((_, i) => [`revisions/page-${i + 1}.text.json`, `revisions/page-${i + 1}.scene.json`]);
  return [...BASE_FILES, ...pages].filter((file) => !existsSync(path.join(dir, file)));
}

// The scene checks in the order of the workflow scene step: schema, then
// `validateScene`, then layout (implementation decision: a needs_review scene
// can fail at the layout stage only).
function sceneIssues(content: unknown, registry: RegistrySnapshot): Array<Pick<Issue, "code" | "path">> {
  const parsed = PageSceneSchema.safeParse(content);
  if (!parsed.success) return parsed.error.issues.map((i) => ({ code: i.code, path: i.path.join(".") }));
  const ctx = { registry, templates: TEMPLATES };
  const semantic = validateScene(parsed.data, ctx);
  return semantic.length > 0 ? semantic : layoutScene(parsed.data, ctx).issues;
}

// Checks the recorded outputs against the current schemas (RUN-06.S2).
// Returns one line per problem; an empty list means the folder is valid.
export function fixtureProblems(dir: string): string[] {
  const problems: string[] = [];
  const registry = read(dir, "registry.json") as unknown as RegistrySnapshot;
  const outline = read(dir, "revisions/outline.json");
  const parsedOutline = OutlineSchema.safeParse(outline.content);
  if (!parsedOutline.success) problems.push(`revisions/outline.json: ${parsedOutline.error.issues.map((i) => i.message).join("; ")}`);

  outlinePages(dir).forEach((_, i) => {
    const textFile = `revisions/page-${i + 1}.text.json`;
    if (existsSync(path.join(dir, textFile))) {
      const text = PageTextSchema.safeParse(read(dir, textFile).content);
      if (!text.success) problems.push(`${textFile}: ${text.error.issues.map((x) => x.message).join("; ")}`);
    }
    const sceneFile = `revisions/page-${i + 1}.scene.json`;
    if (!existsSync(path.join(dir, sceneFile))) return;
    const scene = read(dir, sceneFile);
    if (scene.status === "ok") {
      const issues = sceneIssues(scene.content, registry);
      if (issues.length > 0) problems.push(`${sceneFile}: ${issues.map((x) => x.code).join(", ")}`);
    } else if (scene.status === "needs_review") {
      // A provider error stores no content: there is nothing to check.
      if (scene.content !== null && sceneIssues(scene.content, registry).length === 0) problems.push(`${sceneFile}: needs_review but no issue`);
    } else problems.push(`${sceneFile}: status ${String(scene.status)}`);
  });
  return problems;
}
