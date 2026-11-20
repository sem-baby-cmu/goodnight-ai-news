// Class names that several Studio parts share (DESIGN.md 4 and 6). The
// shadcn components get their look here, at the use site (#23, Exact changes 1).

// Card: Card fill, radius 24 px, hard edge, no border, padding 20 px.
export const cardClass =
  "gap-4 rounded-[24px] bg-card p-5 text-[16px] font-medium text-ink shadow-[0_3px_0_var(--edge)] ring-0";

// Card title: 20 px, 800.
export const cardTitleClass = "text-[20px] leading-tight font-extrabold text-ink";

// Note: 14 px, 500, Soft ink.
export const noteClass = "text-[14px] font-medium text-ink-3";

// Link look: Teal text, underline on hover, offset 3 px, at least 44 px high,
// and the two focus rings of DESIGN.md 14.
export const linkClass =
  "inline-flex min-h-11 items-center font-bold text-teal-text underline-offset-3 hover:underline rounded-[4px] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-solid focus-visible:outline-ink focus-visible:shadow-[0_0_0_9px_var(--sun)]";

// Field: Paper fill, 2 px border, radius 14 px, padding 8 px 12 px, at least 44 px high.
// Focus: the Ink outline 3 px away, and the Sun ring as a 3 px shadow in the
// gap (an <input> or <textarea> has no ::after for the ring of `Button`).
export const fieldClass =
  "min-h-11 rounded-[14px] border-2 border-field-border bg-paper px-3 py-2 text-[16px] font-medium text-ink shadow-none focus-visible:border-field-border focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-solid focus-visible:outline-ink focus-visible:shadow-[0_0_0_3px_var(--sun)] md:text-[16px]";

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
