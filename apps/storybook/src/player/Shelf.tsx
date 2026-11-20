import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CoverData } from "./Cover";
import { ArrowLeftIcon, ArrowRightIcon, RoundArrowIcon } from "./icons";
import { loadCover } from "./loadRelease";
import { createReleaseResolver } from "./resolver";
import { ShelfBook } from "./ShelfBook";
import { fetchShelf, type ShelfBook as Book } from "./shelfData";
import { type ShelfLayout, shelfLayout } from "./shelfLayout";
import { DayPicture, Sign } from "./ShelfPictures";
import { WaitingDots } from "./StartGate";

type ShelfState = { kind: "waiting" } | { kind: "books"; books: Book[] } | { kind: "empty" } | { kind: "failed" };

// The wood of one board (16 px): 7 px Light wood, 6 px Wood, 3 px Deep wood.
const BOARD = "linear-gradient(to bottom, var(--wood-light) 0 7px, var(--wood) 7px 13px, var(--wood-deep) 13px 16px)";
const GRAIN = "#A5673D";
const FADE: KeyframeAnimationOptions = { duration: 200, easing: "linear" };

// Two short grain lines on the Wood part of a board.
function BoardGrain() {
  return (
    <svg aria-hidden="true" className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 100 16">
      <line x1="18" y1="10" x2="30" y2="10" stroke={GRAIN} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1="62" y1="9.5" x2="71" y2="9.5" stroke={GRAIN} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// One grain line along a side.
function SideGrain() {
  return (
    <svg aria-hidden="true" className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 16 100">
      <line x1="8" y1="20" x2="8" y2="38" stroke={GRAIN} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// The wooden shelf of the layout (DESIGN.md 12.1): the back, the sides, a
// top board, one board per row of books, and two feet. No text.
function ShelfWood({ layout }: { layout: ShelfLayout }) {
  const { shelf, boards, book } = layout;
  const side = layout.layout === "wide" ? 16 : 12;
  const bodyH = shelf.h - 12;
  const boardTop = (r: number) => 16 + (r + 1) * (book.h + 28) - 16;
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute" style={{ left: side, right: side, top: 0, height: bodyH, background: "#EAD2AB" }} />
      {[0, 1].map((i) => (
        <div
          key={i}
          className="absolute bg-wood"
          style={{ top: 0, height: bodyH, width: side, ...(i === 0 ? { left: 0 } : { right: 0 }) }}
        >
          <SideGrain />
        </div>
      ))}
      <div className="absolute inset-x-0 top-0 h-[16px]" style={{ background: BOARD }}>
        <BoardGrain />
      </div>
      {Array.from({ length: boards }, (_, r) => {
        const lowest = r === boards - 1;
        return (
          <div
            key={r}
            data-testid="shelf-board"
            className="absolute h-[16px]"
            style={{ top: boardTop(r), left: lowest ? 0 : side, right: lowest ? 0 : side, background: BOARD }}
          >
            <BoardGrain />
          </div>
        );
      })}
      <div className="absolute bottom-0 left-[4px] h-[12px] w-[44px] bg-wood-deep" />
      <div className="absolute right-[4px] bottom-0 h-[12px] w-[44px] bg-wood-deep" />
    </div>
  );
}

// The shelf at / (ADR 0017, DESIGN.md 12.1): the ground, the name, the shelf
// with one shelf page of books, the quiet plate of Waiting, Empty and
// Failed, and the two arrows. The shelf sends one request per attempt.
export function Shelf() {
  const mainRef = useRef<HTMLElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const leavingRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  const [state, setState] = useState<ShelfState>({ kind: "waiting" });
  const [attempt, setAttempt] = useState(0);
  const [first, setFirst] = useState(0);
  const [leaving, setLeaving] = useState<{ page: number; books: Book[] } | null>(null);
  const [plateH, setPlateH] = useState(0);

  // One request per attempt: the StrictMode second effect run reuses it.
  const requestRef = useRef<{ attempt: number; promise: Promise<Book[]> } | null>(null);
  // One cover load per book while the shelf is shown.
  const coversRef = useRef(new Map<string, Promise<CoverData>>());
  // The running cross-fade; `fadeId` drops the end of an interrupted one.
  const fadeRef = useRef<Animation[]>([]);
  const fadeId = useRef(0);

  useLayoutEffect(() => {
    mainRef.current?.focus();
  }, []);

  // The viewport (100dvw x 100dvh), read once at mount and on every resize.
  useLayoutEffect(() => {
    const probe = probeRef.current!;
    const read = () =>
      setViewport((v) =>
        v && v.w === probe.clientWidth && v.h === probe.clientHeight ? v : { w: probe.clientWidth, h: probe.clientHeight },
      );
    read();
    const observer = new ResizeObserver(read);
    observer.observe(probe);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    if (requestRef.current?.attempt !== attempt) requestRef.current = { attempt, promise: fetchShelf() };
    requestRef.current.promise.then(
      (books) => {
        if (live) setState(books.length > 0 ? { kind: "books", books } : { kind: "empty" });
      },
      () => {
        if (live) setState({ kind: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const layout = viewport ? shelfLayout(viewport.w, viewport.h) : null;
  const books = state.kind === "books" ? state.books : [];
  const perPage = layout?.perPage ?? 1;
  const page = Math.floor(first / perPage);
  const lastPage = Math.max(0, Math.ceil(books.length / perPage) - 1);
  const shownPage = Math.min(page, lastPage);

  // The cross-fade of a page change: only opacity, 200 ms, linear.
  useLayoutEffect(() => {
    const out = leavingRef.current;
    const into = pageRef.current;
    if (!leaving || !out || !into || typeof out.animate !== "function") {
      if (leaving) setLeaving(null);
      return;
    }
    const id = ++fadeId.current;
    const animations = [
      out.animate([{ opacity: 1 }, { opacity: 0 }], { ...FADE, fill: "forwards" }),
      into.animate([{ opacity: 0 }, { opacity: 1 }], FADE),
    ];
    fadeRef.current = animations;
    Promise.all(animations.map((a) => a.finished)).then(
      () => {
        if (fadeId.current === id) setLeaving(null);
      },
      () => {},
    );
  }, [first, leaving]);

  // The plate height, for its place (it can be higher than the shelf).
  useLayoutEffect(() => {
    const h = plateRef.current?.offsetHeight ?? 0;
    setPlateH((prev) => (prev === h ? prev : h));
  });

  const coverFor = (id: string): Promise<CoverData> => {
    const cache = coversRef.current;
    let load = cache.get(id);
    if (!load) {
      load = loadCover(id).then(({ root, page }) => ({ page, resolver: createReleaseResolver(page, root) }));
      cache.set(id, load);
    }
    return load;
  };

  const turn = (delta: number) => {
    for (const a of fadeRef.current) a.finish();
    fadeRef.current = [];
    setLeaving({ page: shownPage, books: books.slice(shownPage * perPage, shownPage * perPage + perPage) });
    setFirst((shownPage + delta) * perPage);
  };

  const onLookAgain = () => {
    flushSync(() => {
      setState({ kind: "waiting" });
      setAttempt((a) => a + 1);
    });
    mainRef.current?.focus();
  };

  const pageBooks = (l: ShelfLayout, list: Book[]) =>
    list.map((book, i) => (
      <ShelfBook
        key={book.releaseId}
        book={book}
        slot={i}
        at={l.slots[i]!}
        size={l.book}
        window={l.window}
        cover={coverFor(book.releaseId)}
      />
    ));

  let content = null;
  if (layout && viewport) {
    const { shelf } = layout;
    const short = layout.layout === "short";
    const shown = books.slice(shownPage * perPage, shownPage * perPage + perPage);
    const leavingBooks = leaving && leaving.page !== shownPage ? leaving : null;

    let plate = null;
    if (state.kind !== "books") {
      const maxW = short ? Math.min(440, viewport.w - 176 - 24) : Math.min(440, viewport.w - 32);
      const bottom = layout.layout === "narrow" ? viewport.h - 88 : viewport.h;
      const top = plateH <= shelf.h ? shelf.y + (shelf.h - plateH) / 2 : 64 + (bottom - 64 - plateH) / 2;
      const line = cn("leading-[1.3] font-semibold text-ink", short ? "text-[22px]" : "text-[28px]");
      // The sign above the line; in Short, left of it.
      const signed = (kind: "day" | "night", text: string) =>
        short ? (
          <div className="flex flex-row items-center gap-3">
            <Sign kind={kind} />
            <p className={line}>{text}</p>
          </div>
        ) : (
          <>
            <Sign kind={kind} />
            <p className={line}>{text}</p>
          </>
        );
      plate = (
        <div
          ref={plateRef}
          data-testid="shelf-plate"
          className={cn(
            "absolute flex w-max flex-col items-center gap-3 bg-paper shadow-[0_2px_0_var(--edge)]",
            short ? "p-[12px] text-left" : "p-[16px] text-center",
          )}
          style={{ left: shelf.x + shelf.w / 2, top, maxWidth: maxW, translate: "-50% 0" }}
        >
          {state.kind === "waiting" ? <WaitingDots /> : null}
          {state.kind === "empty" ? signed("day", "New stories are coming soon.") : null}
          {state.kind === "failed" ? (
            <>
              {signed("night", "The books are sleeping. Come back soon.")}
              <Button size="child" onClick={onLookAgain}>
                <RoundArrowIcon />
                Look again
              </Button>
            </>
          ) : null}
        </div>
      );
    }

    const arrows = books.length > perPage;
    content = (
      <>
        <div className="absolute" style={{ left: shelf.x, top: shelf.y, width: shelf.w, height: shelf.h }}>
          <ShelfWood layout={layout} />
          {leavingBooks ? (
            <div
              key={`page-${leavingBooks.page}`}
              ref={leavingRef}
              data-testid="shelf-page"
              inert
              aria-hidden="true"
              className="absolute inset-0"
            >
              {pageBooks(layout, leavingBooks.books.slice(0, perPage))}
            </div>
          ) : null}
          {shown.length > 0 ? (
            <div key={`page-${shownPage}`} ref={pageRef} data-testid="shelf-page" className="absolute inset-0">
              {pageBooks(layout, shown)}
            </div>
          ) : null}
        </div>
        {plate}
        {arrows ? (
          <>
            <div className="absolute" style={{ left: layout.previous.x, top: layout.previous.y }}>
              <Button
                variant="round"
                size="child-icon"
                aria-label="Previous books"
                disabled={shownPage === 0}
                focusableWhenDisabled
                onClick={() => turn(-1)}
              >
                <ArrowLeftIcon />
              </Button>
            </div>
            <div className="absolute" style={{ left: layout.next.x, top: layout.next.y }}>
              <Button
                variant="round"
                size="child-icon"
                aria-label="Next books"
                disabled={shownPage === lastPage}
                focusableWhenDisabled
                onClick={() => turn(1)}
              >
                <ArrowRightIcon />
              </Button>
            </div>
          </>
        ) : null}
      </>
    );
  }

  return (
    <main ref={mainRef} tabIndex={-1} data-testid="shelf" className="fixed inset-0 overflow-hidden text-ink">
      <div aria-hidden="true" className="absolute inset-0">
        <DayPicture />
      </div>
      <div
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none invisible fixed top-0 left-0"
        style={{ width: "100dvw", height: "100dvh" }}
      />
      <h1 className="absolute top-[20px] left-[24px] text-[32px] leading-none font-extrabold text-teal-deep">Lullabyte</h1>
      {content}
    </main>
  );
}
