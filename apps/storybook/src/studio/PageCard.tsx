import { PageSceneSchema } from "@storybook/dsl";
import { SceneView } from "@storybook/scene-runtime";
import { useMemo } from "react";
import type { RegistryResponse, StoryDetailResponse } from "./api";
import { studioAssetResolver, versionMismatches } from "./assets";
import { PAGE_STATE_CHIP, StateChip } from "./StateChip";
import { noteClass } from "./ui";

type Page = StoryDetailResponse["pages"][number];
type Revision = NonNullable<Page["text"]>;

const TARGETS = [
  { target: "page_text", name: "Text", head: "text" },
  { target: "scene", name: "Scene", head: "scene" },
  { target: "audio", name: "Audio", head: "audio" },
] as const;

function textOf(revision: Revision | null): string | null {
  const content = revision?.content;
  if (typeof content === "object" && content !== null && "text" in content && typeof content.text === "string") {
    return content.text;
  }
  return null;
}

// The lines of a `needs_review` head: the provider error when it has no
// content (implementation decision R26), else each issue as written.
function reviewLines(revision: Revision | null): string[] {
  if (revision === null || revision.status !== "needs_review") return [];
  const error = revision.error;
  if (typeof error !== "object" || error === null) return [];
  if (revision.content === null) {
    return "message" in error && typeof error.message === "string" ? [`provider error: ${error.message}`] : [];
  }
  if (!("issues" in error) || !Array.isArray(error.issues)) return [];
  return error.issues.flatMap((issue: unknown) => {
    if (typeof issue !== "object" || issue === null) return [];
    const { path, code, message } = issue as { path?: unknown; code?: unknown; message?: unknown };
    return [[path, code, message].filter((part) => typeof part === "string" && part !== "").join(" ")];
  });
}

// One page of the story view (#23, Exact changes 12). `registry` is null when
// the registry did not load. No link and no hover lift (D23-14).
export function PageCard({ page, registry }: { page: Page; registry: RegistryResponse | null }) {
  const scene = page.scene;
  const sceneId = scene?.id;
  const versions = scene?.assetVersions ?? null;

  // Keyed by the scene revision and the registry: SceneView resets its layer
  // states when the page object changes, and a refetch gives new objects.
  const preview = useMemo(() => {
    if (scene === null) return null;
    const parsed = PageSceneSchema.safeParse(scene.content);
    if (!parsed.success || parsed.data.layers.some((layer) => layer.at === undefined)) return null;
    return parsed.data;
  }, [sceneId]);
  const resolver = useMemo(
    () => (registry === null ? null : studioAssetResolver(registry, versions)),
    [sceneId, registry],
  );
  const mismatches = useMemo(
    () => (registry === null ? [] : versionMismatches(registry, versions)),
    [sceneId, registry],
  );

  const text = textOf(page.text);
  const lines = TARGETS.flatMap(({ head }) => reviewLines(page[head]));

  return (
    <article className="flex flex-col gap-3 rounded-[18px] bg-card p-3 shadow-[0_3px_0_var(--edge)]">
      <div style={{ position: "relative", aspectRatio: "1002 / 610", borderRadius: "10px", overflow: "hidden" }} className="bg-paper">
        {resolver !== null && preview !== null ? (
          <div style={{ position: "absolute", inset: 0 }}>
            <SceneView page={preview} assets={resolver} mode="still" />
          </div>
        ) : (
          <p className="absolute inset-0 grid place-items-center p-3 text-center text-[14px] font-medium text-ink-2">
            {registry === null ? "No preview: the registry did not load." : "No preview for this scene."}
          </p>
        )}
        <span className="absolute top-2 left-2 rounded-full bg-card px-[10px] pt-[6px] pb-[5px] text-[14px] leading-none font-bold text-ink tabular-nums shadow-[0_2px_0_var(--edge)]">
          {page.number}
        </span>
      </div>
      {mismatches.map((m) => (
        <p key={m.key} className={noteClass}>
          {`${m.key}: the scene uses v${m.recorded}, the registry has ${m.active === null ? "no active version" : `v${m.active}`}.`}
        </p>
      ))}
      <p className="line-clamp-3 text-[14px] font-medium text-ink">{text ?? "No text"}</p>
      <div className="flex flex-wrap gap-2">
        {TARGETS.map(({ target, name }) => {
          const reason = page.problems.find((p) => p.target === target)?.reason ?? "ok";
          const chip = PAGE_STATE_CHIP[reason];
          return <StateChip key={target} state={chip.state} label={`${name} ${chip.word}`} />;
        })}
      </div>
      {lines.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {lines.map((line, i) => (
            <li key={i} className={noteClass}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
