import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
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
    <Card className={cardClass}>
      <CardTitle className={cardTitleClass}>Releases</CardTitle>
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
            <li
              key={release.id}
              className="flex flex-wrap items-center gap-3 border-b border-cream py-2 last:border-0"
            >
              <div className="mr-auto flex flex-col">
                <span className="text-[16px] font-bold text-ink">Release {release.number}</span>
                <span className={`${noteClass} tabular-nums`}>{formatTime(release.createdAt)}</span>
              </div>
              {release.withdrawn ? (
                <StateChip state="none" label="Off the shelf" />
              ) : release.id === story.publishedReleaseId ? (
                <StateChip state="ok" label="On the shelf" />
              ) : null}
              {release.withdrawn ? null : (
                <Button
                  variant="secondary"
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
