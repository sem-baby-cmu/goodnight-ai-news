import { type HistoryState, Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { Cover, type CoverData } from "./Cover";
import type { ShelfBook as Book } from "./shelfData";

// The cloth, its hard edge, and the tilt of a book, by place in reading
// order on a shelf page (DESIGN.md 12.1, approved shelf mock of #77).
const CLOTH = ["var(--coral)", "var(--cobalt)", "var(--sun)", "#3B4F7D", "#6E9F45", "var(--teal)"];
const CLOTH_EDGE = ["#9E4D38", "#183A96", "#B98630", "#28375C", "#4F7A30", "#137A70"];
const TILT = [-1.2, 0.8, -0.5, 0.9, -0.8, 1.1];

// The history state of a book link: BookRoute focuses Home on its first
// screen when it is set (DESIGN.md 14). The router adds optional keys to
// `HistoryState`, so a plain `{ fromShelf: true }` fails the weak type
// check; the intersection type makes the key known.
export const FROM_SHELF: HistoryState & { fromShelf: true } = { fromShelf: true };

type ShelfBookProps = {
  book: Book;
  // The place in reading order on the shelf page (0 to 5).
  slot: number;
  // The top left of the book, relative to the shelf box.
  at: { x: number; y: number };
  size: { w: number; h: number };
  window: { w: number; h: number };
  cover: Promise<CoverData>;
};

// One book on the shelf. The whole book is the link (content, not a
// control). Focus ring, from the book outward: 3 px Card, 3 px Ink, 3 px
// Sun yellow (P77-4 (a)).
export function ShelfBook({ book, slot, at, size, window, cover }: ShelfBookProps) {
  const s = size.w / 180;
  const place = slot % CLOTH.length;
  const style = {
    left: at.x,
    top: at.y,
    width: size.w,
    height: size.h,
    rotate: `${TILT[place]}deg`,
    "--book-edge": CLOTH_EDGE[place],
  } as CSSProperties;
  return (
    <Link
      to="/read/$releaseId"
      params={{ releaseId: book.releaseId }}
      state={FROM_SHELF}
      aria-label={"Open the book: " + book.title}
      className="absolute block origin-bottom rounded-[6px_13px_13px_6px] [box-shadow:0_4px_0_var(--book-edge)] transition-transform duration-160 hover:-translate-y-[6px] active:-translate-y-[2px] active:scale-[0.97] motion-reduce:transition-none focus-visible:z-1 focus-visible:outline-solid focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink focus-visible:[box-shadow:0_0_0_3px_var(--card),0_4px_0_var(--book-edge)] focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:-inset-[9px] focus-visible:after:rounded-[15px_22px_22px_15px] focus-visible:after:border-3 focus-visible:after:border-sun"
      style={style}
    >
      {/* Page edges on the open side, behind the cover and under the
          focus outline of the link (the link is a stacking context). */}
      <span
        aria-hidden="true"
        className="absolute -z-1 rounded-r-[4px]"
        style={{
          right: -5 * s,
          top: 9 * s,
          bottom: 5 * s,
          width: 9 * s,
          background: "repeating-linear-gradient(to bottom, var(--paper) 0 3px, var(--edge) 3px 4px)",
        }}
      />
      {/* The cover: cloth, spine strip, title plate, and picture window. */}
      <span
        className="absolute inset-0 block overflow-hidden rounded-[6px_13px_13px_6px]"
        style={{ background: CLOTH[place] }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-0 block border-r-2 border-paper/28 bg-ink/20"
          style={{ width: 13 * s }}
        />
        <span
          className="absolute flex h-[52px] items-center justify-center rounded-[8px] bg-paper px-[8px] py-[6px] text-center shadow-[0_2px_0_var(--edge)]"
          style={{ left: 21 * s, top: 8 * s, width: window.w }}
        >
          <span className="line-clamp-2 text-[18px] leading-[1.1] font-bold text-ink">{book.title}</span>
        </span>
        <span className="absolute block" style={{ left: 21 * s, top: 14 * s + 54 }}>
          <Cover load={cover} width={window.w} height={window.h} />
        </span>
      </span>
    </Link>
  );
}
