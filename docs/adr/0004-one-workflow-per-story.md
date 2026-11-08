# ADR 0004: One Cloudflare Workflow instance per story

- Status: Proposed (Integration accepts; team review pending)
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration), after a Codex review
- Detail: [`integration/architecture.md`](../../integration/architecture.md) D3, D5, D8, sections 2 and 10

## Context

After Scout, each story goes through Storyteller, a review, Producer,
Playmate, a package step, and a parent review. Steps can fail, and reviews can
wait for days.

## Decision

- Selecting a news item creates one Workflow instance. Its ID is the story ID.
- Each stage is one Workflow step. Steps pass artifact IDs, not content.
- Gates B and C are `step.waitForEvent` with a 14 day timeout.
- First release: no Queues and no KV. Producer and Playmate run one after the
  other.

## Reasons

- The platform retries and checkpoints each step. A crash resumes at the
  failed step.
- A waiting instance does not count toward the concurrency limit.
- The `waitForEvent` timeout is configurable. Retention of 7 to 30 days on
  Paid applies to finished instances, not to waiting ones (checked in the
  documentation).

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Five queue consumers in a chain (revision 1) | The Codex review found four P0 faults: a retry can strand a half-done stage, the package step had no coordinator for its two inputs, a D1 write and a queue send can split, and stale marking races running jobs. Fixing them needs an outbox, job leases, a fan-in coordinator, and fencing. |
| One cron run for the whole chain | See ADR 0003. |
| Workflow plus queues between stages | Two ways to order work; more code and more failure modes. |
| Status in KV | KV is eventually consistent and has no transactions. A D1 column is enough. |

## Consequences

- One orchestration mechanism to learn and test.
- Running Producer and Playmate in parallel is a later change.
- Open: who reviews and how fast (O3); what happens at timeout (O4).
