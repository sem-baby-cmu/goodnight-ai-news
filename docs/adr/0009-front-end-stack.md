# ADR 0009: Front end is React 19, shadcn (Base UI), Tailwind v4, TanStack Router

- Status: Accepted
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`DESIGN.md`](../../DESIGN.md)

## Context

The team wanted a soft, hand-painted look and first asked for the `ghibli-ui`
component library on top of TanStack, Base UI, and Tailwind.

## Decision

React 19, Vite with the Cloudflare plugin, TanStack Router, shadcn with the
Base UI base, Tailwind CSS v4. The look comes from our own tokens and CSS in
`DESIGN.md`. English only.

## Reasons

`ghibli-ui` 0.1.0 does not work with React 19 (checked in its package):

- its bundle contains the React 18 JSX runtime and uses a React 18 internal
  API in 2 places;
- it lists `react ^18.2` as a dependency, not a peer;
- it ships no TypeScript types.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| `ghibli-ui` on React 19 | Breaks at run time; no types. |
| Stay on React 18 for `ghibli-ui` | Ties the whole app to an old React for one young library. |
| Plain shadcn look | Does not give the product's warm, painted character. |
| Bilingual UI (English and Chinese) | Not a product requirement. It came from a style reference by mistake and was removed. |

## Consequences

- A style reference image is used for look only. It is not a requirement and
  is not stored in the repository.
- Child pages follow the pre-reader rules in `DESIGN.md` section 10.
