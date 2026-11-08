# ADR 0010: Back end is TypeScript, Hono, D1, and Drizzle

- Status: Accepted
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`app/worker/`](../../app/worker/)

## Context

The prototypes are Python. The production code runs on Workers and talks to
D1, R2, and Workflows.

## Decision

TypeScript on Workers. Hono for routes. D1 for data. Drizzle for the schema
and migrations (`app/worker/db/schema.ts`, `app/migrations/`). Each owner
ports the logic of their own stage to TypeScript.

## Reasons

- TypeScript has first-class Workers types (`wrangler types`) and runs every
  Workers feature.
- Hono is small and made for Workers.
- Drizzle gives typed queries and plain SQL migrations that
  `wrangler d1 migrations apply` runs.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Python Workers (Pyodide) | Playwright, Pillow, and ffmpeg do not run; fewer libraries. |
| Raw SQL with no ORM | No types between the schema and the code. |
| Prisma | Heavier on Workers; Drizzle fits D1 migrations directly. |
| itty-router or no router | Hono has middleware and typed bindings we need. |

## Consequences

- The Python prototypes stay as feasibility evidence; they are not deployed.
