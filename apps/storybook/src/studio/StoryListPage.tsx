import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type StoryListResponse, studioApi } from "./api";
import { NewStoryForm } from "./NewStoryForm";
import { Notice } from "./Notice";
import { StateChip } from "./StateChip";
import { cardClass, cardTitleClass, formatTime, linkClass, NO_ANSWER, quietClass } from "./ui";

type Story = StoryListResponse["stories"][number];
type Load = { kind: "loading" } | { kind: "error"; status: number } | { kind: "ok"; stories: Story[] };

const headClass = "h-auto px-3 pb-2 text-[14px] font-bold text-ink-3";
const cellClass = "px-3 py-1 text-[16px]";

// The stories list at /studio (#23, Exact changes 10; DESIGN.md 13.1). The
// two cards share the row by a flex rule (board 12): "New story" grows 1 and
// stops at 440 px, "Stories" grows 2.
export function StoryListPage() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [fetches, setFetches] = useState(0);

  // A fetch that fails keeps the rows already on screen.
  useEffect(() => {
    let active = true;
    void studioApi.listStories().then((r) => {
      if (!active) return;
      setLoad((prev) =>
        r.ok ? { kind: "ok", stories: r.data.stories } : prev.kind === "ok" ? prev : { kind: "error", status: r.status },
      );
    });
    return () => {
      active = false;
    };
  }, [fetches]);

  return (
    <div className="flex flex-col gap-[22px] lg:flex-row lg:items-start">
      <NewStoryForm onNoAnswer={() => setFetches((n) => n + 1)} />
      <Card role="region" aria-labelledby="stories-title" className={cn(cardClass, "min-w-0 lg:flex-[2_1_0]")}>
        <h2 id="stories-title" className={cardTitleClass}>
          Stories
        </h2>
        {load.kind === "loading" ? (
          <p role="status" className={quietClass}>
            Loading the stories.
          </p>
        ) : null}
        {load.kind === "error" ? (
          load.status === 0 ? (
            <Notice tone="bad" title={NO_ANSWER}>
              Reload to try again.
            </Notice>
          ) : (
            <Notice tone="bad" title={`Could not load the stories (${load.status}).`} />
          )
        ) : null}
        {load.kind === "ok" && load.stories.length === 0 ? <p className={quietClass}>No stories yet.</p> : null}
        {load.kind === "ok" && load.stories.length > 0 ? (
          <Table>
            <TableHeader className="[&_tr]:border-b [&_tr]:border-cream">
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Title</TableHead>
                <TableHead className={headClass}>Release</TableHead>
                <TableHead className={headClass}>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {load.stories.map((story) => (
                <TableRow key={story.id} className="border-b border-cream last:border-0 hover:bg-paper">
                  <TableCell className={cn(cellClass, "whitespace-normal")}>
                    <Link to="/studio/stories/$storyId" params={{ storyId: story.id }} className={linkClass}>
                      {story.title ?? "Untitled"}
                    </Link>
                  </TableCell>
                  <TableCell className={cellClass}>
                    <ReleaseCell story={story} />
                  </TableCell>
                  <TableCell className={cn(cellClass, "text-ink-2 tabular-nums")}>{formatTime(story.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Card>
    </div>
  );
}

// "None" for no release; else the release number, with "Off the shelf" when
// `onShelf` is false (EDT-05.S5, EDT-05.S7). A pointer whose release has no
// number (a broken pointer) shows "None" too.
function ReleaseCell({ story }: { story: Story }) {
  if (story.publishedReleaseId === null || story.publishedReleaseNumber === null) {
    return <span className="text-ink-3">None</span>;
  }
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      Release {story.publishedReleaseNumber}
      {story.onShelf ? null : <StateChip state="none" label="Off the shelf" />}
    </span>
  );
}
