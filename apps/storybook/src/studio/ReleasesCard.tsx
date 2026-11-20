import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StoryDetailResponse } from "./api";
import { Notice } from "./Notice";
import { StateChip } from "./StateChip";
import { cardClass, cardTitleClass, formatTime, noteClass } from "./ui";

// The "Releases" card (#23, Exact changes 11; DESIGN.md 13.2). Newest first.
// No control opens a withdrawn release. The take-off action is a separate
// issue (D23-17).
export function ReleasesCard({
  story,
  releases,
}: {
  story: StoryDetailResponse["story"];
  releases: StoryDetailResponse["releases"];
}) {
  const offShelf = story.publishedReleaseId !== null && !story.onShelf;
  return (
    <Card role="region" aria-labelledby="releases-title" className={cn(cardClass, "gap-[6px]")}>
      <h2 id="releases-title" className={cardTitleClass}>
        Releases
      </h2>
      {offShelf ? (
        <Notice tone="work" title="This book is off the shelf.">
          Publish a new release to put it back.
        </Notice>
      ) : null}
      {releases.length === 0 ? (
        <p className="text-ink-3">None</p>
      ) : (
        <ul className="flex flex-col">
          {[...releases].reverse().map((release) => (
            <li key={release.id} className="flex items-center gap-3 border-b border-cream py-2 last:border-0">
              <div className="mr-auto flex min-w-0 flex-col items-start gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[16px] font-bold text-ink">Release {release.number}</span>
                  <span className={cn(noteClass, "tabular-nums")}>{formatTime(release.createdAt)}</span>
                </div>
                {release.withdrawn ? (
                  <StateChip state="none" label="Off the shelf" />
                ) : release.id === story.publishedReleaseId ? (
                  <StateChip state="ok" label="On the shelf" />
                ) : null}
              </div>
              {release.withdrawn ? null : (
                <Button
                  variant="secondary"
                  aria-label={`Open release ${release.number}`}
                  nativeButton={false}
                  render={<Link to="/read/$releaseId" params={{ releaseId: release.id }} />}
                >
                  Open
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
