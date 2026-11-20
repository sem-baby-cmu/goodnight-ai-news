import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type StoryListResponse, studioApi } from "./api";
import { NewStoryForm } from "./NewStoryForm";
import { Notice } from "./Notice";
import { StateChip } from "./StateChip";
import { cardClass, cardTitleClass, formatTime, linkClass, noteClass } from "./ui";

type Story = StoryListResponse["stories"][number];
type Load = { kind: "loading" } | { kind: "error"; status: number } | { kind: "ok"; stories: Story[] };

const headClass = "h-auto px-3 pb-2 text-[14px] font-bold text-ink-3";
const cellClass = "px-3 py-1 text-[16px]";

// The stories list at /studio (#23, Exact changes 10; DESIGN.md 13.1).
export function StoryListPage() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void studioApi.listStories().then((r) => {
      if (!active) return;
      setLoad(r.ok ? { kind: "ok", stories: r.data.stories } : { kind: "error", status: r.status });
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid items-start gap-[22px] lg:grid-cols-[440px_minmax(0,1fr)]">
      <NewStoryForm />
      <Card className={cardClass}>
        <CardTitle className={cardTitleClass}>Stories</CardTitle>
        {load.kind === "loading" ? <p className={noteClass}>Loading the stories.</p> : null}
        {load.kind === "error" ? <Notice tone="bad" title={`Could not load the stories (${load.status}).`} /> : null}
        {load.kind === "ok" && load.stories.length === 0 ? <p className={noteClass}>No stories yet.</p> : null}
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
                  <TableCell className={cellClass}>
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
