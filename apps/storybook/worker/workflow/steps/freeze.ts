import type { RegistrySnapshot } from "@storybook/dsl";
import { NonRetryableError } from "cloudflare:workflows";
import { and, eq, isNull } from "drizzle-orm";
import { type Db, getDb, loadActiveRegistry, loadStoryHeads, run } from "../../db";

// Freezes the story heads and the active registry on the run row, once. A
// retried `freeze` changes nothing (`registry IS NULL`).
export async function freezeStep(env: Env, runId: string, storyId: string): Promise<{ ok: true }> {
  const db = getDb(env.DB);
  const loaded = await loadStoryHeads(db, storyId);
  if (!loaded) throw new NonRetryableError("story not found");
  const registry = await loadActiveRegistry(db);
  // No script can name a cast without a character; a retry does not help.
  if (!Object.values(registry.assets).some((a) => a.kind === "character")) {
    throw new NonRetryableError("the active registry has no character asset");
  }
  // Every scene must name a backdrop; without one every scene step fails.
  if (!Object.values(registry.assets).some((a) => a.kind === "backdrop")) {
    throw new NonRetryableError("the active registry has no backdrop asset");
  }
  await db
    .update(run)
    .set({ status: "running", basis: loaded.story.heads, registry })
    .where(and(eq(run.id, runId), isNull(run.registry)));
  return { ok: true };
}

// The registry that `freeze` stored. Later steps never read the live table.
export async function frozenRegistry(db: Db, runId: string): Promise<RegistrySnapshot> {
  const [row] = await db.select({ registry: run.registry }).from(run).where(eq(run.id, runId));
  if (!row?.registry) throw new Error("run has no frozen registry");
  return row.registry;
}
