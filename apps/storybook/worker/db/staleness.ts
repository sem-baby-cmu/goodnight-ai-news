import type { PageScene } from "@storybook/dsl";
import type { HeadKey, Heads, RevisionStatus } from "./schema";

// A head is stale when one of its basis entries is not the current head for
// that key (design "Staleness").
export function isStale(basis: Heads, heads: Heads): boolean {
  return (Object.keys(basis) as HeadKey[]).some((key) => basis[key] !== heads[key]);
}

type Target = "page_text" | "scene" | "audio";
type Reason = "missing" | "needs_review" | "stale";

export type PageState = {
  pageId: string;
  number: number;
  state: "ok" | Reason;
  problems: Array<{ target: Target; reason: Reason }>;
};

const TARGETS: readonly Target[] = ["page_text", "scene", "audio"];
const PRECEDENCE: readonly Reason[] = ["missing", "needs_review", "stale"];

export function pageStates(input: {
  pageIds: string[];
  heads: Heads;
  revisions: ReadonlyMap<string, { id: string; status: RevisionStatus; basis: Heads }>;
}): PageState[] {
  return input.pageIds.map((pageId, i) => {
    const problems: PageState["problems"] = [];
    for (const target of TARGETS) {
      const id = input.heads[`${target}:${pageId}`];
      if (id === undefined) {
        problems.push({ target, reason: "missing" });
        continue;
      }
      const rev = input.revisions.get(id);
      // A head always points at a revision that is not superseded.
      if (!rev || rev.status === "superseded") throw new Error("head revision missing or superseded");
      if (rev.status === "needs_review") problems.push({ target, reason: "needs_review" });
      else if (isStale(rev.basis, input.heads)) problems.push({ target, reason: "stale" });
    }
    const state = PRECEDENCE.find((reason) => problems.some((p) => p.reason === reason)) ?? "ok";
    return { pageId, number: i + 1, state, problems };
  });
}

// Every asset key that a scene uses: layer refs and play_sfx sounds.
export function assetKeysOfScene(scene: PageScene): string[] {
  const keys = new Set(scene.layers.map((l) => l.ref));
  for (const t of scene.interactions) {
    for (const a of t.do) if (a.action === "play_sfx") keys.add(a.sfx);
  }
  return [...keys].sort();
}
