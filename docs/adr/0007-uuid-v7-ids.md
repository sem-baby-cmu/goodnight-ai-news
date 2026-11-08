# ADR 0007: All IDs are UUID version 7

- Status: Accepted
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`integration/story.schema.json`](../../integration/story.schema.json), [`AGENTS.md`](../../AGENTS.md) section 3

## Context

Prototypes used dates (`producer/input/2026-11-07.json`) and slugs
(`story_001`) as IDs. A day can have more than one story, and a story can be
regenerated.

## Decision

Every system ID is a lower case UUID v7, `story_id` included. A date is an
attribute such as `publish_date`. The schema enforces the UUID v7 format.

## Reasons

- Unique across stages and versions without a central counter.
- Time ordered, so sorting by ID is sorting by creation time, and index
  inserts stay local.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Date as the key | Only one story a day; a regeneration collides. |
| Slug (`story_001`) | Needs a counter; not unique across environments. |
| Auto-increment integer | Needs the database to make the ID; clashes between local and remote. |
| UUID v4 | Random order; no time in the ID. |
| ULID | Same idea as UUID v7, but not a standard UUID; tools expect UUIDs. |

## Consequences

- Each owner moves their prototype to UUID v7 IDs (O1). Producer still names
  input files by date; until then a date in a file name is only a label.
