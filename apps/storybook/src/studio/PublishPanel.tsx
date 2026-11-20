import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { errorOf, type ReleaseCreated, type StoryDetailResponse, studioApi } from "./api";
import { CrossIcon } from "./icons";
import { Notice } from "./Notice";
import { cardClass, cardTitleClass, type Failure, NO_ANSWER } from "./ui";

type Pages = StoryDetailResponse["pages"];

const LABEL = { page_text: "text", scene: "scene", audio: "audio" } as const;

// The client list of blocking pages, in the words of `publish.ts`. It only
// disables the button: the server decides (Key invariants).
function blockingRows(pages: Pages): string[] {
  if (pages.length === 0) return ["missing outline"];
  return pages.flatMap((page) => {
    if (page.state === "ok") return [];
    if (page.problems.length === 0) return [`page ${page.number}: ${page.state}`];
    return page.problems.map((p) => `page ${page.number}: ${p.reason} ${LABEL[p.target]}`);
  });
}

type Done = { release: ReleaseCreated; noTexture: boolean };

// The "Publish" card (#23, Exact changes 13; DESIGN.md 13.2). The Done form
// exists only after a 201 in this view, never on load.
export function PublishPanel({
  storyId,
  pages,
  releases,
  onPublished,
}: {
  storyId: string;
  pages: Pages;
  releases: StoryDetailResponse["releases"];
  onPublished: () => void;
}) {
  const [serverRows, setServerRows] = useState<string[] | null>(null);
  const [seenPages, setSeenPages] = useState(pages);
  const [done, setDone] = useState<Done | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  // New pages (a refetch) replace the server list of an earlier answer.
  if (seenPages !== pages) {
    setSeenPages(pages);
    setServerRows(null);
  }

  const rows = serverRows ?? blockingRows(pages);
  const next = releases.reduce((max, r) => Math.max(max, r.number), 0) + 1;

  async function publish() {
    setBusy(true);
    setFailure(null);
    const r = await studioApi.publish(storyId);
    setBusy(false);
    if (r.ok) {
      const data = r.data;
      setDone({ release: data, noTexture: "texture" in data && data.texture === null });
      onPublished();
      return;
    }
    const error = errorOf(r.body);
    if (r.status === 409 && error === "publish_blocked") {
      const blocking = (r.body as { blocking?: Array<{ message?: unknown }> }).blocking ?? [];
      setServerRows(blocking.map((b) => (typeof b.message === "string" ? b.message : "")).filter(Boolean));
      return;
    }
    if (r.status === 409 && error === "publish_conflict") {
      setFailure({ title: "Another publish ran at the same time.", body: "Nothing was published. Try again." });
      onPublished();
      return;
    }
    if (r.status === 0) {
      // No answer: the release can exist (publish makes it in its last batch),
      // so the story is fetched again and a second click is not offered as safe.
      setFailure({
        title: NO_ANSWER,
        body: "It is not known if the release was published. Check the Releases card before you try again.",
      });
      onPublished();
      return;
    }
    setFailure({ title: `Publishing failed (${r.status}).`, body: "Nothing was published. Try again." });
  }

  return (
    <Card role="region" aria-labelledby="publish-title" className={cn(cardClass, "gap-[14px]")}>
      <h2 id="publish-title" className={cardTitleClass}>
        Publish
      </h2>
      {done !== null ? (
        <>
          <Notice
            tone="ok"
            title={`Release ${done.release.number} published.`}
            action={
              <Button variant="secondary" nativeButton={false} render={<a href={done.release.playerUrl} />}>
                Open release {done.release.number} in the Player
              </Button>
            }
          />
          {done.noTexture ? <Notice tone="work" title="Published without the paper texture" /> : null}
        </>
      ) : (
        <>
          {rows.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-[14px] bg-[var(--bad)] px-3 py-2 text-[16px] font-semibold text-[var(--bad-notice)] [&_svg]:size-5"
                >
                  <CrossIcon />
                  {row}
                </li>
              ))}
            </ul>
          ) : (
            <p>All pages are ready.</p>
          )}
          {failure !== null ? (
            <Notice tone="bad" title={failure.title}>
              {failure.body}
            </Notice>
          ) : null}
          <div className="flex justify-end">
            <Button size="lg" disabled={rows.length > 0 || busy} onClick={() => void publish()}>
              Publish release {next}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
