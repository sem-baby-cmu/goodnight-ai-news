# ADR 0003: Cron starts Scout only; Scout output is a buffer in D1

- Status: Proposed (Integration accepts; team review pending)
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`integration/architecture.md`](../../integration/architecture.md) D2, section 2

## Context

The first draft started every stage from one daily cron run. A failure at any
stage restarted the whole chain, and no one could look at the news before a
story was written.

## Decision

The daily cron starts the Scout job only. Scout writes `news_item` rows to D1
with status `new` and stops. A story starts only when a news item is selected
at Gate A.

## Reasons

- The rows are a buffer. A person (or a rule) can review, reject, or re-run
  Scout without touching any story.
- A cron run has 15 minutes and no checkpoints. A failure late in a full chain
  loses all earlier work.
- Scout can fail on a bad day without blocking stories already in progress.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| One cron run for every stage | No checkpoint, no review point, 15 minute ceiling. |
| Scout sends each item straight to Storyteller | Couples the stages; no chance to pick or fix the news first. |
| Scout output in a queue | On Free a message lives 24 hours; a waiting review would lose it. D1 rows do not expire. |

## Consequences

- Open: does a person pick every day, or a rule with a human override (O2)?
