# ADR 0014: three.js for the background layer only; Pip stays SVG

- Status: Accepted for `app/`; proposed to Producer (issue [#3](https://github.com/sem-baby-cmu/goodnight-ai-news/issues/3))
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`DESIGN.md`](../../DESIGN.md) section 11

## Context

Child pages should feel alive and have depth. three.js can give depth, but
Pip is one SVG component today, which keeps Pip the same on every page.

## Decision

- three.js draws only the background: night sky depth, parallax, slow stars,
  soft particles.
- Pip and the scene foreground stay SVG, animated with CSS.
- three.js loads on child pages only, never on the landing page.
- With reduced motion, the sky is still. Without WebGL, the SVG sky is shown.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Whole scene in three.js, 3D Pip | Needs a 3D model of Pip; loses the "same Pip everywhere" guarantee. |
| No three.js | Less depth on child pages. |
| three.js on every page | Extra download for parents who only need the landing page. |

## Consequences

- Not measured yet: bundle size and phone performance.
