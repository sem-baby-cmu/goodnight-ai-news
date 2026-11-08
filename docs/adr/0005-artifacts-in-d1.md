# ADR 0005: Every stage output is a versioned artifact row in D1

- Status: Proposed (Integration accepts; team review pending)
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`integration/architecture.md`](../../integration/architecture.md) D4, sections 3 and 5

## Context

Each stage must be reviewable, fixable by a person, and re-runnable without
re-running the stages before it. The Storyteller and Producer should not be
tightly coupled.

## Decision

- Each stage writes one new `artifact` row. A row never changes; a change is a
  new version.
- A row records its inputs, prompt version, model, cost, check results, and
  author (`model` or `human`).
- A `generation_id` makes a platform retry return the same row. A deliberate
  regeneration gets a new `generation_id` and a new version.
- Large files go to R2. A D1 row holds JSON and R2 keys (2 MB row limit).
- Stages share only the schema, never code or internal state.

## Reasons

- Review, edit, and "regenerate from stage X" all work on rows.
- D1 rows do not expire; Workflow state does.
- A person's edit is a new version, so the model output and the fix can be
  compared later.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Pass content inside Workflow state | Expires; cannot be reviewed or edited outside the run. |
| JSON files in R2 only | No query, no unique rules, no status column. |
| Overwrite the row on change | Loses history and the diff between model and person. |
| Unique on `(stage, input_hash)` (revision 1) | Blocks a deliberate regeneration with the same inputs. |

## Consequences

- Five tables: `news_item`, `story`, `artifact`, `review`, `story_package`.
  They are live in the remote D1 since 2026-11-08 (`app/migrations/0000_init.sql`).
