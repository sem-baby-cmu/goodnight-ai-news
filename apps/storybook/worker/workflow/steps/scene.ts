import {
  type Issue,
  type Outline,
  type PageScene,
  PageSceneSchema,
  type RegistrySnapshot,
  SceneDraftSchema,
  assignSceneIds,
  buildSceneJsonSchema,
  validateScene,
} from "@storybook/dsl";
import { TEMPLATES, layoutScene } from "@storybook/layout";
import { ModelOutputError } from "@storybook/models";
import { eq } from "drizzle-orm";
import { type HeadKey, type Heads, assetKeysOfScene, getDb, loadStoryHeads, newId, revision } from "../../db";
import { type StoredCall, answerOf, buildSchema, isUnparsed, providerErrorOf, storedCall, unparsedResult } from "../model-call";
import { UNPARSED_PREVIOUS, modelRegistry, repairSuffix, scenePrompt, sceneSummary } from "../prompts";
import { type FaultContext, seams } from "../seams";
import { frozenRegistry } from "./freeze";
import { type PageStepResult, writePageRevision, writeProviderError } from "./page-revision";
import { zodIssues } from "./script";

export type SceneStepResult = PageStepResult;

type Checked = { issues: Issue[]; candidate: unknown; parsed: PageScene | null; laidOut?: PageScene };

// The scene checks, in order, stopping at the first stage with issues
// (implementation decision R23). Scene draft handling is #10's.
function checkScene(result: unknown, registry: RegistrySnapshot): Checked {
  if (isUnparsed(result)) {
    // The candidate keeps the raw output (review item 2).
    const { kind: _kind, ...rest } = result;
    return {
      issues: [{ path: "", code: "model_output_unparsed", message: "The answer was not valid JSON." }],
      candidate: { unparsed: true, ...rest },
      parsed: null,
    };
  }
  const value = answerOf(result);
  const draft = SceneDraftSchema.safeParse(value);
  if (!draft.success) return { issues: zodIssues(draft.error.issues), candidate: value, parsed: null };
  const scene = assignSceneIds(draft.data, newId);
  const fail = (issues: Issue[]): Checked => ({ issues, candidate: scene, parsed: scene });
  const schema = PageSceneSchema.safeParse(scene);
  if (!schema.success) return fail(zodIssues(schema.error.issues));
  const ctx = { registry, templates: TEMPLATES };
  const semantic = validateScene(scene, ctx);
  if (semantic.length > 0) return fail(semantic);
  const placed = layoutScene(scene, ctx);
  if (placed.issues.length > 0) return fail(placed.issues);
  return { issues: [], candidate: placed.scene, parsed: scene, laidOut: placed.scene };
}

function assetVersions(scene: PageScene | null, registry: RegistrySnapshot): Record<string, number> | null {
  if (!scene) return null;
  const versions: Record<string, number> = {};
  for (const key of assetKeysOfScene(scene)) {
    const a = registry.assets[key];
    if (a) versions[key] = a.version;
  }
  return versions;
}

export async function sceneStep(env: Env, runId: string, storyId: string, pageId: string): Promise<SceneStepResult> {
  const db = getDb(env.DB);
  const registry = await frozenRegistry(db, runId);
  // The model sees fewer keys than validation accepts (#84).
  const shown = modelRegistry(registry);
  const client = seams.modelClient(env, { registry });
  const ctx = (purpose: FaultContext["purpose"]): FaultContext => ({ runId, storyId, step: `scene:${pageId}`, pageId, purpose });
  const textKey: HeadKey = `page_text:${pageId}`;
  const sceneKey: HeadKey = `scene:${pageId}`;

  const call = (suffix: string) => async (basis: Heads) => {
    const loaded = await loadStoryHeads(db, storyId);
    const outlineId = loaded?.story.heads.outline;
    const outline = outlineId ? (loaded!.revisions.get(outlineId)?.content as Outline | undefined) : undefined;
    if (!outline) throw new Error("story has no outline head");
    // The earlier pages as story context, not basis (#105).
    const index = outline.pages.findIndex((p) => p.pageId === pageId);
    const earlier = (index < 0 ? [] : outline.pages.slice(0, index)).map((p) => {
      const id = loaded!.story.heads[`scene:${p.pageId}`];
      const r = id === undefined ? undefined : loaded!.revisions.get(id);
      return r && r.status === "ok" && r.content != null ? sceneSummary(r.content as PageScene, shown) : null;
    });
    const [text] = await db.select({ content: revision.content }).from(revision).where(eq(revision.id, basis[textKey]!));
    const prompt = scenePrompt({
      beat: outline.pages.find((p) => p.pageId === pageId)?.beat ?? "",
      pageText: (text!.content as { text: string }).text,
      cast: outline.cast,
      registry: shown,
      templates: TEMPLATES,
      story: { page: index + 1, pages: outline.pages.length, earlier },
    });
    try {
      const r = await client.generateJson({
        model: "scene",
        system: prompt.system,
        user: prompt.user + suffix,
        schema: buildSchema(() => buildSceneJsonSchema({ registry: shown, templates: TEMPLATES })),
      });
      return { result: { kind: "answer" as const, value: r.value }, modelId: r.modelId, usage: r.usage };
    } catch (err) {
      if (err instanceof ModelOutputError) return { result: unparsedResult(err.raw), modelId: err.modelId, usage: err.usage };
      throw err;
    }
  };
  const model = env.MODEL_SCENE ?? "";
  const deps = (purpose: FaultContext["purpose"]) => ({ env, db, ctx: ctx(purpose) });

  const first = await storedCall(deps("first"), { basisKeys: [textKey], targetKeys: [sceneKey], model, call: call("") });
  const firstError = providerErrorOf(first.result);
  if (firstError) return writeProviderError(db, ctx("first"), "scene", first, firstError);
  let last: StoredCall = first;
  let checked = checkScene(first.result, registry);
  if (checked.issues.length > 0) {
    const previous = isUnparsed(first.result) ? UNPARSED_PREVIOUS : answerOf(first.result);
    last = await storedCall(deps("repair"), {
      basisKeys: [textKey],
      targetKeys: [sceneKey],
      basisFrom: first,
      model,
      repairIssues: checked.issues,
      call: call(repairSuffix(previous, checked.issues)),
    });
    const repairError = providerErrorOf(last.result);
    if (repairError) return writeProviderError(db, ctx("repair"), "scene", last, repairError);
    checked = checkScene(last.result, registry);
  }

  const ok = checked.issues.length === 0;
  const status = ok ? "ok" : "needs_review";
  const { revisionId, head } = await writePageRevision(db, ctx(last === first ? "first" : "repair"), {
    kind: "scene",
    call: last,
    status,
    content: ok ? checked.laidOut : checked.candidate,
    r2Key: null,
    assetVersions: assetVersions(checked.parsed, registry),
    error: ok ? null : { issues: checked.issues },
  });
  return { revisionId, status, head };
}
