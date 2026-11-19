import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { type ErrorRecord, type RunScope, getDb, markRunFailed } from "../db";
import { audioStep } from "./steps/audio";
import { finishStep, toErrorRecord } from "./steps/finish";
import { freezeStep } from "./steps/freeze";
import { sceneStep } from "./steps/scene";
import { type ScriptStepResult, scriptStep } from "./steps/script";

export type StoryRunParams = { runId: string; storyId: string; scope: RunScope };

// `limit: 2` means 3 tries, as in the design. RUN-05.S6 checks the tries.
export const MODEL_STEP = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
  // Up to 2 model calls of up to 180 s each; the default step timeout is 10 minutes.
  timeout: "10 minutes",
} as const satisfies WorkflowStepConfig;

export const DB_STEP = {
  retries: { limit: 3, delay: "1 second", backoff: "exponential" },
  timeout: "1 minute",
} as const satisfies WorkflowStepConfig;

type WorkflowStepConfig = Parameters<WorkflowStep["do"]>[1] & object;

// freeze, script, scene and audio per page, finish (design "2. StoryRun
// Workflow"). State outside steps comes only from step returns: every entry
// of `errors` is the return value of an `error:*` step.
export class StoryRunWorkflow extends WorkflowEntrypoint<Env, StoryRunParams> {
  async run(event: Readonly<WorkflowEvent<StoryRunParams>>, step: WorkflowStep): Promise<{ status: string }> {
    const { runId, storyId, scope } = event.payload;
    const env = this.env;
    const errors: ErrorRecord[] = [];
    const finish = (failed: boolean) => step.do("finish", DB_STEP, () => finishStep(env, runId, storyId, { failed, errors }));

    // One page target per step. A page failure is recorded and the run goes on.
    const pageTask = async (pageId: string, targets: Array<"scene" | "audio">) => {
      for (const target of targets) {
        const name = `${target}:${pageId}`;
        try {
          const r = await step.do(name, MODEL_STEP, () =>
            target === "scene" ? sceneStep(env, runId, storyId, pageId) : audioStep(env, runId, storyId, pageId),
          );
          const providerError = r.providerError;
          if (providerError) {
            errors.push(
              await step.do(`error:${name}`, DB_STEP, async () => toErrorRecord({ runId, storyId, pageId, step: name, providerError })),
            );
          }
        } catch (err) {
          errors.push(await step.do(`error:${name}`, DB_STEP, async () => toErrorRecord({ runId, storyId, pageId, step: name, err })));
        }
      }
    };

    try {
      try {
        await step.do("freeze", DB_STEP, () => freezeStep(env, runId, storyId));
      } catch (err) {
        errors.push(await step.do("error:freeze", DB_STEP, async () => toErrorRecord({ runId, storyId, pageId: null, step: "freeze", err })));
        return await finish(true);
      }
      if (scope.kind === "full") {
        let script: ScriptStepResult;
        try {
          script = await step.do("script", MODEL_STEP, () => scriptStep(env, runId, storyId));
        } catch (err) {
          errors.push(await step.do("error:script", DB_STEP, async () => toErrorRecord({ runId, storyId, pageId: null, step: "script", err })));
          return await finish(true);
        }
        if (script.status === "invalid") {
          const issues = script.issues;
          errors.push(
            await step.do("error:script", DB_STEP, async () => ({
              ...toErrorRecord({ runId, storyId, pageId: null, step: "script", err: new Error("The script is invalid after one repair.") }),
              issues,
            })),
          );
          return await finish(true);
        }
        if (script.status === "provider_error") {
          const providerError = { status: script.providerStatus, message: script.message };
          errors.push(
            await step.do("error:script", DB_STEP, async () => toErrorRecord({ runId, storyId, pageId: null, step: "script", providerError })),
          );
          return await finish(true);
        }
        // Fixed chunks of 4 pages, so at most 4 pages run at a time.
        for (let i = 0; i < script.pages.length; i += 4) {
          await Promise.all(script.pages.slice(i, i + 4).map((p) => pageTask(p.pageId, ["scene", "audio"])));
        }
      } else {
        await pageTask(scope.pageId, [scope.target]);
      }
      return await finish(false);
    } catch (err) {
      await step.do("fail", DB_STEP, () =>
        markRunFailed(getDb(env.DB), runId, { errors: [...errors, toErrorRecord({ runId, storyId, pageId: null, step: "run", err })] }),
      );
      return { status: "failed" };
    }
  }
}
