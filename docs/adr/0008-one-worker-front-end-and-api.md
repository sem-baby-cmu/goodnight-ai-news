# ADR 0008: One Worker serves the front end and the API

- Status: Accepted
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`app/`](../../app/), [`DESIGN.md`](../../DESIGN.md) section 1

## Context

The product needs a landing page, a reader, a reviewer page, and an API. They
read the same D1 and R2 data.

## Decision

One Worker, `goodnight-ai-news`, serves both. The front end is Static Assets
(single-page app). The Worker answers `/health` and `/api/*`; every other path
returns the app. Live at `https://goodnight.ioenv.com` since 2026-11-08.

## Reasons

- One deploy, one domain, no cross-origin setup.
- The API and the stages share the same bindings and types.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Cloudflare Pages for the front end, a Worker for the API | Two deploys and two domains; Cloudflare now points new projects to Workers with Static Assets. |
| One Worker per stage | More deploys and service bindings before the handoffs are proven. Can split later. |

## Consequences

- Reviewer routes go behind Cloudflare Access on the same Worker.
