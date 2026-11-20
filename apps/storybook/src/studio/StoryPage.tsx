import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { errorOf, type RegistryResponse, type RunResponse, type StoryDetailResponse, studioApi } from "./api";
import { BackIcon } from "./icons";
import { NOTICE_BUTTON_EDGE, Notice } from "./Notice";
import { PageCard } from "./PageCard";
import { PublishPanel } from "./PublishPanel";
import { ReleasesCard } from "./ReleasesCard";
import { RUN_STATUS_CHIP, StateChip } from "./StateChip";
import { cardClass, cardTitleClass, linkClass, noteClass } from "./ui";
import { useRunPoll } from "./useRunPoll";

type Load = { kind: "loading" } | { kind: "error"; status: number } | { kind: "ok"; data: StoryDetailResponse };
type Pages = StoryDetailResponse["pages"];

const ACTIVE = new Set(["queued", "running"]);

function sourceOf(source: StoryDetailResponse["source"]): { url: string | null; truncated: boolean } {
  const c = source.content;
  if (typeof c !== "object" || c === null) return { url: null, truncated: false };
  const url = "url" in c && typeof c.url === "string" && c.url !== "" ? c.url : null;
  const truncated = "truncated" in c && c.truncated === true;
  return { url, truncated };
}

// The story view at /studio/stories/$storyId (#23, Exact changes 11;
// DESIGN.md 13.2). `runId` is the run to poll from the search params.
export function StoryPage({ storyId, runId }: { storyId: string; runId: string | undefined }) {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // undefined while it loads; null when it did not load. Fetched once.
  const [registry, setRegistry] = useState<RegistryResponse | null | undefined>(undefined);
  const [runFailure, setRunFailure] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const request = useRef(0);

  const refetch = useCallback(() => {
    const n = ++request.current;
    void studioApi.getStory(storyId).then((r) => {
      if (n !== request.current) return;
      // A failed refetch keeps the story that is shown.
      setLoad((prev) => (r.ok ? { kind: "ok", data: r.data } : prev.kind === "ok" ? prev : { kind: "error", status: r.status }));
    });
  }, [storyId]);

  useEffect(() => {
    refetch();
    return () => {
      request.current += 1;
    };
  }, [refetch]);

  useEffect(() => {
    let active = true;
    void studioApi.getRegistry().then((r) => {
      if (active) setRegistry(r.ok ? r.data : null);
    });
    return () => {
      active = false;
    };
  }, []);

  // The run to poll: `runId`, else the latest run while it is queued or
  // running. Once chosen, it stays, so the Run card keeps its last answer.
  const data = load.kind === "ok" ? load.data : undefined;
  const wanted =
    runId ?? (data?.latestRun && ACTIVE.has(data.latestRun.status) ? data.latestRun.id : undefined);
  const [followed, setFollowed] = useState<string | undefined>(undefined);
  if (wanted !== undefined && wanted !== followed) setFollowed(wanted);
  const { latest, lost } = useRunPoll(runId ?? followed, refetch);

  async function startAgain() {
    setStarting(true);
    setRunFailure(null);
    const r = await studioApi.startRun(storyId, { kind: "full" });
    setStarting(false);
    if (r.ok) {
      // The view stays mounted (keyed by storyId): fetch the story again, so
      // `latestRun` is the new run and the failed notice goes away.
      void navigate({ to: "/studio/stories/$storyId", params: { storyId }, search: { runId: r.data.runId } });
      refetch();
      return;
    }
    const error = errorOf(r.body);
    const body = r.body as { runId?: unknown };
    if (r.status === 409 && error === "run_active" && typeof body.runId === "string") {
      void navigate({ to: "/studio/stories/$storyId", params: { storyId }, search: { runId: body.runId } });
      refetch();
      return;
    }
    if (r.status === 409 && error === "full_run_not_allowed") {
      setRunFailure("A full run is not allowed for this story.");
      return;
    }
    if (r.status === 503) {
      setRunFailure("Could not start the run. Nothing was changed. Try again.");
      refetch();
      return;
    }
    setRunFailure(`Could not start the run (${r.status}). Nothing was changed. Try again.`);
  }

  if (load.kind === "error") {
    return (
      <Notice
        tone="bad"
        alone
        title={load.status === 404 ? "Story not found." : `Could not load the story (${load.status}).`}
      />
    );
  }
  if (data === undefined || registry === undefined) return <p className={noteClass}>Loading the story.</p>;

  const { story, source, pages, releases, latestRun } = data;
  const { url, truncated } = sourceOf(source);
  const sorted = [...pages].sort((a, b) => a.number - b.number);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Back to stories"
          nativeButton={false}
          render={<Link to="/studio" />}
        >
          <BackIcon />
        </Button>
        <h1 className="text-[28px] leading-tight font-extrabold text-ink">{story.title ?? "Untitled"}</h1>
        {latestRun !== null ? <StateChip {...RUN_STATUS_CHIP[latestRun.status]} /> : null}
        {url !== null ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "ml-auto")}>
            Source article
          </a>
        ) : null}
      </div>
      {truncated ? (
        <Notice tone="work" alone title="The text had more than 2,000 words.">
          Only the first 2,000 were used.
        </Notice>
      ) : null}
      <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className={cardClass}>
          <CardTitle className={cardTitleClass}>Pages</CardTitle>
          {sorted.length === 0 ? (
            <p className={noteClass}>No pages yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
              {sorted.map((page) => (
                <PageCard key={page.pageId} page={page} registry={registry} />
              ))}
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-[22px]">
          <Card className={cardClass}>
            <CardTitle className={cardTitleClass}>Run</CardTitle>
            {latest !== undefined ? <RunSteps steps={latest.steps} /> : <p className={noteClass}>No run is in progress.</p>}
            {lost ? (
              <Notice tone="bad" title="Lost contact with the run.">
                Reload to try again.
              </Notice>
            ) : null}
            {latestRun?.status === "failed" ? (
              <Notice
                tone="bad"
                title="The run failed."
                action={
                  data.heads.outline === undefined ? (
                    <Button
                      disabled={starting}
                      onClick={() => void startAgain()}
                      className={cn("bg-card font-bold text-teal-text", NOTICE_BUTTON_EDGE.bad)}
                    >
                      Start again
                    </Button>
                  ) : undefined
                }
              >
                {failedLines(latestRun.error, pages).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                {data.heads.outline !== undefined ? <p>Open a page to make its scene or audio again.</p> : null}
              </Notice>
            ) : null}
            {runFailure !== null ? <Notice tone="bad" title={runFailure} /> : null}
          </Card>
          <PublishPanel storyId={story.id} pages={pages} releases={releases} onPublished={refetch} />
          <ReleasesCard story={story} releases={releases} />
        </div>
      </div>
    </div>
  );
}

// One line for each error record of a failed run (DESIGN.md 13.2 "A failed run").
function failedLines(error: unknown, pages: Pages): string[] {
  if (typeof error !== "object" || error === null || !("errors" in error) || !Array.isArray(error.errors)) return [];
  return error.errors.flatMap((record: unknown) => {
    if (typeof record !== "object" || record === null) return [];
    const { step, message } = record as { step?: unknown; message?: unknown };
    if (typeof step !== "string") return [];
    const [kind, pageId] = step.split(":");
    const text = typeof message === "string" ? message : "";
    const page = pageId === undefined ? undefined : pages.find((p) => p.pageId === pageId);
    return [page === undefined ? `${kind}: ${text}` : `${kind}, page ${page.number}: ${text}`];
  });
}

const KINDS = ["script", "scene", "audio"] as const;

const CELL: Record<RunResponse["steps"][number]["state"], string> = {
  done: "bg-teal",
  pending: "bg-dot-ahead border-2 border-ink-3",
  failed: "bg-[var(--bad-chip)]",
};

function Cell({ state }: { state: RunResponse["steps"][number]["state"] }) {
  return <span className={cn("inline-block h-3 w-5 rounded-full", CELL[state])} />;
}

// The "Run" card rows (D23-12, D23-21): one row for each step kind in `steps`.
function RunSteps({ steps }: { steps: RunResponse["steps"] }) {
  const rows = KINDS.flatMap((kind) => {
    const own = steps.filter((s) => s.step === kind || s.step.startsWith(`${kind}:`));
    return own.length === 0 ? [] : [{ kind, own }];
  });
  return (
    <div className="flex flex-col gap-3">
      {rows.map(({ kind, own }) => {
        const done = own.filter((s) => s.state === "done").length;
        const failed = own.filter((s) => s.state === "failed").length;
        const note = `${done} of ${own.length} done${failed > 0 ? `, ${failed} failed` : ""}`;
        return (
          <div
            key={kind}
            role="group"
            aria-label={`${kind}: ${done} of ${own.length} done, ${failed} failed`}
            className="flex flex-wrap items-center gap-3"
          >
            <span className="w-14 text-[16px] font-bold">{kind}</span>
            <span className="flex flex-wrap gap-1">
              {own.map((s) => (
                <Cell key={s.step} state={s.state} />
              ))}
            </span>
            <span className={cn(noteClass, "tabular-nums")}>{note}</span>
          </div>
        );
      })}
      <div className={cn(noteClass, "flex flex-wrap items-center gap-3")}>
        <span className="inline-flex items-center gap-1">
          <Cell state="done" />
          done
        </span>
        <span className="inline-flex items-center gap-1">
          <Cell state="pending" />
          waiting
        </span>
        <span className="inline-flex items-center gap-1">
          <Cell state="failed" />
          failed
        </span>
      </div>
    </div>
  );
}
