# TASTES.md

Short aesthetic rules for people and agents. The values are in
[`DESIGN.md`](DESIGN.md); where this file and `DESIGN.md` disagree,
`DESIGN.md` wins.

## REJECT
- Never ship a template-default look: stock shadcn gray, stock blue buttons, purple gradients.
- Never use a blurred shadow. A hard edge (`0 <n>px 0`, no blur) is the only shadow (`DESIGN.md` section 4).
- Never show anything frightening, sharp, or harshly contrasted to a child.
- Never use photos of children or stock photos.
- Never use fast, flashing, or spinning motion; bedtime pace is slow and soft.
- Never use red for text, errors, or a failure state on a child screen; a child never sees a red X.
- Never put text or controls over the picture on a child screen, except a speech bubble.
- Never make a child read to get anywhere.

## REQUIRE
- Use shadcn Base UI components; give character through tokens (`DESIGN.md`).
- Use the paper-craft look of the approved boards: cream paper, teal, hand-cut cut-outs, painted backdrops.
- Use one typeface, Baloo 2, in sentence case; no upper-case labels, no italics.
- Use fully round buttons and chips; other radii from `DESIGN.md` section 4.
- Ensure 4.5:1 contrast for body text, 3:1 for large text, icons, and marks; `44px` Studio targets; `64px` child targets (a stage layer near the edge is cut, `DESIGN.md` section 12.3).
- Show a mock and get approval before any visual change ships.

## WHEN AMBIGUOUS
- Choose calm and warm over busy or bright; it is read at bedtime.
- Orient toward: paper-craft picture books (texture, cut shapes), the approved boards (layout), Producer's Pip scenes (character).
