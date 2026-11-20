import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogOverlay, DialogPopup, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { errorOf, type StoryDetailResponse, studioApi } from "./api";
import { NOTICE_BUTTON_EDGE, Notice } from "./Notice";
import { StateChip } from "./StateChip";
import { afterRing, cardClass, cardTitleClass, formatTime, NO_ANSWER, noteClass } from "./ui";

type TakeOffNotice = { title: string; body: string; reload: boolean };
type FocusTo = { target: "row" | "heading" | "reload" };

// The "Releases" card (#23, Exact changes 11; DESIGN.md 13.2). Newest first.
// No control opens a withdrawn release. The take-off is #89 (DESIGN.md 13.2).
export function ReleasesCard({
  story,
  releases,
  onWithdrawn,
  onReload,
}: {
  story: StoryDetailResponse["story"];
  releases: StoryDetailResponse["releases"];
  onWithdrawn: (withdrawnThrough: number) => void;
  onReload: () => Promise<boolean>;
}) {
  const offShelf = story.publishedReleaseId !== null && !story.onShelf;
  // The release on the shelf: the condition of the "On the shelf" chip.
  const shelf = releases.find((r) => !r.withdrawn && r.id === story.publishedReleaseId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TakeOffNotice | null>(null);
  // A new object each time, so the same target runs again.
  const [focusTo, setFocusTo] = useState<FocusTo | null>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  // One place moves the focus for every outcome, after the commit, so the
  // target exists (the dialog has finalFocus={false}).
  useEffect(() => {
    if (focusTo === null) return;
    ({ row: rowRef, heading: headingRef, reload: reloadRef })[focusTo.target].current?.focus();
  }, [focusTo]);

  async function confirm() {
    if (shelf === undefined) return;
    setBusy(true);
    setNotice(null);
    const r = await studioApi.withdraw(story.id, shelf.id);
    if (r.ok) {
      onWithdrawn(r.data.withdrawnThrough);
      setOpen(false);
      setFocusTo({ target: "heading" });
    } else {
      const error = errorOf(r.body);
      if (r.status === 409 && error === "release_moved") {
        setNotice({ title: "Another release was published after you opened this page.", body: "Nothing was changed.", reload: true });
        setFocusTo({ target: "reload" });
      } else if (r.status === 409 && error === "not_published") {
        setNotice({ title: "This story has no release on the shelf.", body: "Nothing was changed.", reload: true });
        setFocusTo({ target: "reload" });
      } else if (r.status === 0) {
        setNotice({ title: NO_ANSWER, body: "It is not known if this book is still on the shelf. Try again.", reload: false });
        setFocusTo({ target: "row" });
      } else {
        // Every other status, a 409 with another error among them, is an HTTP error.
        setNotice({
          title: "The server did not confirm the take-off.",
          body: `It answered with an error (${r.status}). Try again.`,
          reload: false,
        });
        setFocusTo({ target: "row" });
      }
      setOpen(false);
    }
    setBusy(false);
  }

  // A reload that does not load changes nothing (D89-2).
  async function reload() {
    const loaded = await onReload();
    if (loaded) {
      setNotice(null);
      setFocusTo({ target: "heading" });
    }
  }

  return (
    <Card role="region" aria-labelledby="releases-title" className={cn(cardClass, "gap-[6px]")}>
      <h2
        id="releases-title"
        ref={headingRef}
        tabIndex={-1}
        className={cn(cardTitleClass, "self-start rounded-[4px] focus-visible:after:rounded-[9px]", afterRing)}
      >
        Releases
      </h2>
      {notice !== null ? (
        <div className="pt-[6px]">
          <Notice
            tone="bad"
            title={notice.title}
            action={
              notice.reload ? (
                <Button
                  ref={reloadRef}
                  onClick={() => void reload()}
                  className={cn("bg-card font-bold text-teal-text", NOTICE_BUTTON_EDGE.bad)}
                >
                  Load the latest
                </Button>
              ) : undefined
            }
          >
            {notice.body}
          </Notice>
        </div>
      ) : null}
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
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-cream py-2 last:border-0"
            >
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
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  {/* A link with the Soft button look: it navigates (WCAG 4.1.2). */}
                  <Link
                    to="/read/$releaseId"
                    params={{ releaseId: release.id }}
                    aria-label={`Open release ${release.number}`}
                    className={buttonVariants({ variant: "secondary", size: "default" })}
                  >
                    Open
                  </Link>
                  {release.id === shelf?.id ? (
                    <Button variant="secondary" ref={rowRef} onClick={() => setOpen(true)}>
                      Take off the shelf
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // While the request runs, Escape and a click outside do nothing (D89-1).
          if (busy) return;
          setOpen(next);
          if (!next) setFocusTo({ target: "row" });
        }}
      >
        <DialogPortal>
          <DialogOverlay className="bg-ink/40" />
          <DialogPopup
            initialFocus={keepRef}
            finalFocus={false}
            className={cn(cardClass, "max-w-[min(440px,calc(100%-48px))]")}
          >
            <DialogTitle className={cardTitleClass}>Take this book off the shelf?</DialogTitle>
            <DialogDescription>
              Children will no longer see this book on the shelf. Every link to release {shelf?.number} and to its
              earlier releases will show the sleeping book. This has no undo. To put the book back, publish a new
              release.
            </DialogDescription>
            <div className="flex justify-end gap-3 pt-3 pb-1">
              <Button
                variant="secondary"
                ref={keepRef}
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setFocusTo({ target: "row" });
                }}
              >
                Keep on the shelf
              </Button>
              <Button disabled={busy} onClick={() => void confirm()}>
                Take off the shelf
              </Button>
            </div>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </Card>
  );
}
