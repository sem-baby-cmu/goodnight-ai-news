// Class names that several Studio parts share (DESIGN.md 4 and 6). The
// shadcn components get their look here, at the use site (#23, Exact changes 1).

// Card: Card fill, radius 24 px, hard edge, no border, padding 20 px, 12 px between parts.
export const cardClass =
  "gap-3 rounded-[24px] bg-card p-5 text-[16px] font-medium text-ink shadow-[0_3px_0_var(--edge)] ring-0";

// Card and section title: 20 px, 800, line height 1.2.
export const cardTitleClass = "text-[20px] leading-[1.2] font-extrabold text-ink";

// Note: 14 px, 500, Soft ink.
export const noteClass = "text-[14px] font-medium text-ink-3";

// A quiet sentence (loading, empty): one sentence in Soft ink, 16 px / 1.5.
export const quietClass = "text-[16px] leading-[1.5] font-medium text-ink-3";

// The two focus rings of DESIGN.md 14 on an element that can have ::after:
// the Ink outline 3 px away, and a 3 px Sun ring directly outside it.
export const afterRing =
  "relative focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-solid focus-visible:outline-ink focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:-inset-[9px] focus-visible:after:border-3 focus-visible:after:border-sun";

// Link look: Teal text, underline on hover, offset 3 px, at least 44 px high.
export const linkClass = `inline-flex min-h-11 items-center font-bold text-teal-text underline-offset-3 hover:underline rounded-[4px] focus-visible:after:rounded-[9px] ${afterRing}`;

// Field: Paper fill, 2 px border, radius 14 px, padding 8 px 12 px, at least 44 px high.
// Focus: the Ink outline 3 px away; an <input> or <textarea> has no ::after,
// so a Card shadow keeps the 3 px gap and a Sun shadow is the ring outside
// the outline (the outline is painted over the shadow).
export const fieldClass =
  "min-h-11 rounded-[14px] border-2 border-field-border bg-paper px-3 py-2 text-[16px] font-medium text-ink shadow-none focus-visible:border-field-border focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-solid focus-visible:outline-ink focus-visible:shadow-[0_0_0_3px_var(--card),0_0_0_9px_var(--sun)] md:text-[16px]";

const TIME = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

// A failure message: the first sentence is the title, the rest the body.
// Status 0 is no answer: never "(0)".
export type Failure = { title: string; body?: string };

export const NO_ANSWER = "No answer came from the server.";
