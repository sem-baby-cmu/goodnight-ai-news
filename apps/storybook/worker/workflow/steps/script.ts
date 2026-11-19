import { type Issue, OutlineSchema, PageTextSchema, type RegistrySnapshot, ScriptDraftSchema, buildOutlineJsonSchema } from "@storybook/dsl";
import { ModelOutputError } from "@storybook/models";
import { eq } from "drizzle-orm";
import { type HeadKey, type Heads, commitHead, getDb, insertRevisions, newId, revision, story } from "../../db";
import { type StoredCall, isUnparsed, storedCall } from "../model-call";
import { UNPARSED_PREVIOUS, repairSuffix, scriptPrompt } from "../prompts";
import { type FaultContext, seams } from "../seams";
import { frozenRegistry } from "./freeze";

export type ScriptStepResult =
  | { status: "ok"; outlineRevisionId: string; pages: Array<{ pageId: string; textRevisionId: string }> }
  | { status: "invalid"; issues: Issue[] }
  | { status: "provider_error"; providerStatus: number; message: string };

type ValidScript = { title: string; cast: string[]; pages: Array<{ pageId: string; beat: string; text: string }> };

// zod issues as `Issue`: the path joined with ".", the zod code.
export const zodIssues = (issues: ReadonlyArray<{ path: PropertyKey[]; code: string; message: string }>, prefix = ""): Issue[] =>
  issues.map((i) => ({ path: [prefix, ...i.path.map(String)].filter(Boolean).join("."), code: i.code, message: i.message }));

const pagesOf = (value: unknown): Array<Record<string, unknown>> | undefined => {
  const pages = (value as { pages?: unknown } | null)?.pages;
  if (!Array.isArray(pages) || !pages.every((p) => typeof p === "object" && p !== null && !Array.isArray(p))) return undefined;
  return pages as Array<Record<string, unknown>>;
};

// Checks a stored script result in stages, stopping at the first stage with
// issues (implementation decision R24).
function checkScript(value: unknown, registry: RegistrySnapshot): { issues: Issue[]; script?: ValidScript } {
  if (isUnparsed(value)) return { issues: [{ path: "", code: "model_output_unparsed", message: "The answer was not valid JSON." }] };
  // Remove only the code-set `pageId` keys before the draft check.
  const pages = pagesOf(value);
  const draftInput = pages
    ? { ...(value as object), pages: pages.map(({ pageId: _pageId, ...rest }) => rest) }
    : value;
  const draft = ScriptDraftSchema.safeParse(draftInput);
  if (!draft.success) return { issues: zodIssues(draft.error.issues) };

  const ids = pages!.map((p) => p.pageId as string);
  const script: ValidScript = {
    title: draft.data.title,
    cast: draft.data.cast,
    pages: draft.data.pages.map((p, i) => ({ pageId: ids[i]!, beat: p.beat, text: p.text })),
  };
  const issues: Issue[] = [];
  const outline = OutlineSchema.safeParse(outlineContent(script));
  if (!outline.success) issues.push(...zodIssues(outline.error.issues));
  script.pages.forEach((p, i) => {
    const text = PageTextSchema.safeParse({ text: p.text });
    if (!text.success) issues.push(...zodIssues(text.error.issues, `pages.${i}`));
  });
  script.cast.forEach((key, i) => {
    if (registry.assets[key]?.kind !== "character") {
      issues.push({ path: `cast.${i}`, code: "unknown_character", message: `Cast key "${key}" is not a character in the registry.` });
    }
  });
  return issues.length > 0 ? { issues } : { issues, script };
}

const outlineContent = (s: ValidScript) => ({
  title: s.title,
  ageBand: "5-7" as const,
  cast: s.cast,
  pages: s.pages.map(({ pageId, beat }) => ({ pageId, beat })),
});

function providerError(call: StoredCall): ScriptStepResult | undefined {
  const pe = (call.result as { providerError?: { status: number; message: string } } | null)?.providerError;
  return pe ? { status: "provider_error", providerStatus: pe.status, message: pe.message } : undefined;
}

export async function scriptStep(env: Env, runId: string, storyId: string): Promise<ScriptStepResult> {
  const db = getDb(env.DB);
  const registry = await frozenRegistry(db, runId);
  const client = seams.modelClient(env, { registry });
  const ctx = (purpose: FaultContext["purpose"]): FaultContext => ({ runId, storyId, step: "script", pageId: "", purpose });

  const call = (suffix: string) => async (basis: Heads) => {
    const [source] = await db.select({ content: revision.content }).from(revision).where(eq(revision.id, basis.source!));
    const prompt = scriptPrompt({ sourceText: (source!.content as { text: string }).text, registry });
    try {
      const r = await client.generateJson({
        model: "script",
        system: prompt.system,
        user: prompt.user + suffix,
        schema: buildOutlineJsonSchema(registry),
      });
      // Code sets every page ID; the stored result holds them, so a retry
      // sees the same IDs.
      for (const page of pagesOf(r.value) ?? []) page.pageId = newId();
      return { result: r.value, modelId: r.modelId, usage: r.usage };
    } catch (err) {
      if (err instanceof ModelOutputError) return { result: { unparsed: true }, modelId: err.modelId, usage: err.usage };
      throw err;
    }
  };
  const model = env.MODEL_SCRIPT ?? "";
  const deps = (purpose: FaultContext["purpose"]) => ({ env, db, ctx: ctx(purpose) });

  const first = await storedCall(deps("first"), { basisKeys: ["source"], targetKeys: ["outline"], model, call: call("") });
  const firstError = providerError(first);
  if (firstError) return firstError;
  let accepted = first;
  let checked = checkScript(first.result, registry);
  if (!checked.script) {
    const previous = isUnparsed(first.result) ? UNPARSED_PREVIOUS : first.result;
    accepted = await storedCall(deps("repair"), {
      basisKeys: ["source"],
      targetKeys: ["outline"],
      basisFrom: first,
      model,
      call: call(repairSuffix(previous, checked.issues)),
    });
    const repairError = providerError(accepted);
    if (repairError) return repairError;
    checked = checkScript(accepted.result, registry);
  }
  const script = checked.script;
  if (!script) return { status: "invalid", issues: checked.issues };

  const base = { storyId, origin: "ai" as const, callId: accepted.callId, status: "ok" as const, basis: accepted.basis };
  const ids = await insertRevisions(db, [
    { ...base, kind: "outline", pageId: "", content: outlineContent(script) },
    ...script.pages.map((p) => ({ ...base, kind: "page_text" as const, pageId: p.pageId, content: { text: p.text } })),
  ]);
  const outlineRevisionId = ids[0]!;
  const pages = script.pages.map((p, i) => ({ pageId: p.pageId, textRevisionId: ids[i + 1]! }));
  await seams.at("after_revisions", ctx(accepted === first ? "first" : "repair"));

  const moves: Heads = { outline: outlineRevisionId };
  const expected = { outline: accepted.expectedHeads.outline ?? null } as Record<HeadKey, string | null>;
  for (const p of pages) {
    moves[`page_text:${p.pageId}`] = p.textRevisionId;
    // New page IDs: no head yet (amendment R58).
    expected[`page_text:${p.pageId}`] = null;
  }
  const head = await commitHead(db, { storyId, moves, basis: accepted.basis, expected });
  if (head === "superseded") {
    // A retry after a successful move, where an operator later changed a page
    // text: the outline is still this step's, so the run goes on (R58).
    const [row] = await db.select({ heads: story.heads }).from(story).where(eq(story.id, storyId));
    if (row?.heads.outline !== outlineRevisionId) {
      return { status: "invalid", issues: [{ path: "", code: "head_moved", message: "The outline head moved to another revision." }] };
    }
  }
  await db.update(story).set({ title: script.title }).where(eq(story.id, storyId));
  return { status: "ok", outlineRevisionId, pages };
}
