import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { errorOf, type ReleaseCreated, type StoryDetailResponse, studioApi } from "./api";
import { CrossIcon } from "./icons";
import { Notice } from "./Notice";
import { cardClass, cardTitleClass } from "./ui";

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
  const [failure, setFailure] = useState<string | null>(null);
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
      setFailure("Another publish ran at the same time.");
      onPublished();
      return;
    }
    setFailure(`Publishing failed (${r.status}).`);
  }

  return (
    <Card className={cardClass}>
      <CardTitle className={cardTitleClass}>Publish</CardTitle>
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
            <Notice tone="bad" title={failure}>
              Nothing was published. Try again.
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
