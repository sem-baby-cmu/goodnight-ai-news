import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { errorOf, type RegistryResponse, type RunResponse, type StoryDetailResponse, studioApi } from "./api";
import { BackIcon } from "./icons";
import { NOTICE_BUTTON_EDGE, Notice } from "./Notice";
import { PageCard } from "./PageCard";
import { PublishPanel } from "./PublishPanel";
import { ReleasesCard } from "./ReleasesCard";
import { RUN_STATUS_CHIP, StateChip } from "./StateChip";
import { cardClass, cardTitleClass, type Failure, linkClass, NO_ANSWER, noteClass, quietClass } from "./ui";
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

// The way out of every state of the story view (board 13, item 3). A link
// with the Soft icon button look: it navigates (WCAG 4.1.2).
function BackButton() {
  return (
    <Link to="/studio" aria-label="Back to stories" className={buttonVariants({ variant: "secondary", size: "icon" })}>
      <BackIcon />
    </Link>
  );
}

// The story view at /studio/stories/$storyId (#23, Exact changes 11;
// DESIGN.md 13.2; board 13). `runId` is the run to poll from the search params.
// Top to bottom: title row, cut notice, the Run card at full width, then
// "Pages" and a 360 px side column (Publish, Releases).
export function StoryPage({ storyId, runId }: { storyId: string; runId: string | undefined }) {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // undefined while it loads; null when it did not load. Fetched once.
  const [registry, setRegistry] = useState<RegistryResponse | null | undefined>(undefined);
  const [runFailure, setRunFailure] = useState<Failure | null>(null);
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
  const pollId = runId ?? followed;
  const { latest, lost } = useRunPoll(pollId, refetch);

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
      setRunFailure({ title: "A full run is not allowed for this story." });
      return;
    }
    if (r.status === 503) {
      setRunFailure({ title: "Could not start the run.", body: "Nothing was changed. Try again." });
      refetch();
      return;
    }
    if (r.status === 0) {
      setRunFailure({ title: NO_ANSWER, body: "It is not known if the run started. Try again." });
      return;
    }
    setRunFailure({ title: `Could not start the run (${r.status}).`, body: "Nothing was changed. Try again." });
  }

  if (load.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-[22px]">
        <BackButton />
        {load.status === 0 ? (
          <Notice tone="bad" alone title={NO_ANSWER}>
            Reload to try again.
          </Notice>
        ) : (
          <Notice
            tone="bad"
            alone
            title={load.status === 404 ? "Story not found." : `Could not load the story (${load.status}).`}
          />
        )}
      </div>
    );
  }
  if (data === undefined || registry === undefined) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <BackButton />
        <p role="status" className={quietClass}>
          Loading the story.
        </p>
      </div>
    );
  }

  const { story, source, pages, releases, latestRun } = data;
  const { url, truncated } = sourceOf(source);
  const sorted = [...pages].sort((a, b) => a.number - b.number);
  // The polled answer is newer than the story fetch when it is the same run.
  const runStatus =
    latestRun === null ? null : latest !== undefined && latest.run.id === latestRun.id ? latest.run.status : latestRun.status;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center gap-3">
        <BackButton />
        <h1 className="text-[28px] leading-[1.2] font-extrabold text-ink">{story.title ?? "Untitled"}</h1>
        {runStatus !== null ? <StateChip {...RUN_STATUS_CHIP[runStatus]} /> : null}
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
      <Card role="region" aria-labelledby="run-title" className={cardClass}>
        <div className="flex flex-wrap items-center gap-4">
          <h2 id="run-title" className={cardTitleClass}>
            Run
          </h2>
          {latest !== undefined ? <Legend /> : null}
        </div>
        {pollId === undefined ? <p className={quietClass}>No run is in progress.</p> : null}
        {pollId !== undefined && latest === undefined && !lost ? (
          <p role="status" className={quietClass}>
            Loading the run.
          </p>
        ) : null}
        {latest !== undefined ? <RunSteps steps={latest.steps} /> : null}
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
        {runFailure !== null ? (
          <Notice tone="bad" title={runFailure.title}>
            {runFailure.body}
          </Notice>
        ) : null}
      </Card>
      <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="pages-title" className="flex min-w-0 flex-col gap-3">
          <h2 id="pages-title" className={cardTitleClass}>
            Pages
          </h2>
          {sorted.length === 0 ? (
            <p className={quietClass}>No pages yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
              {sorted.map((page) => (
                <PageCard key={page.pageId} page={page} registry={registry} />
              ))}
            </div>
          )}
        </section>
        <div className="flex min-w-0 flex-col gap-[22px]">
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

type StepState = RunResponse["steps"][number]["state"];

const CELL: Record<StepState, string> = {
  done: "bg-teal",
  pending: "bg-dot-ahead border-2 border-ink-3",
  failed: "bg-[var(--bad-chip)]",
};

// A run cell: 12 px high, fully round. In a row it shares the width (6 to 40 px).
function Cell({ state, className }: { state: StepState; className?: string }) {
  return <span className={cn("inline-block h-3 rounded-full", CELL[state], className)} />;
}

// The words of the cell colours, in the head row of the card.
function Legend() {
  return (
    <div className={cn(noteClass, "ml-auto flex flex-wrap items-center gap-4")}>
      {(
        [
          ["done", "done"],
          ["pending", "waiting"],
          ["failed", "failed"],
        ] as const
      ).map(([state, word]) => (
        <span key={state} className="inline-flex items-center gap-1">
          <Cell state={state} className="w-5" />
          {word}
        </span>
      ))}
    </div>
  );
}

// The "Run" card rows (D23-12, D23-21): one row for each step kind in
// `steps`, as cells, name, note (board 13).
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
        return (
          <div
            key={kind}
            role="group"
            aria-label={`${kind}: ${done} of ${own.length} done, ${failed} failed`}
            className="grid grid-cols-[minmax(0,348px)_64px_minmax(0,1fr)] items-center gap-x-4"
          >
            <span className="flex gap-1">
              {own.map((s) => (
                <Cell key={s.step} state={s.state} className="min-w-[6px] max-w-[40px] flex-[1_1_0]" />
              ))}
            </span>
            <span className="text-[16px] font-bold">{kind}</span>
            <span className={cn(noteClass, "tabular-nums")}>
              {`${done} of ${own.length} done`}
              {failed > 0 ? <span className="font-bold text-[var(--bad-chip)]">{`, ${failed} failed`}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
