# ADR 0001: Record architecture decisions

- Status: Accepted
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)

## Context

Five people build five components that must fit together. Design choices were
made in chat, in issues, and inside long design documents. A new reader could
not see what was decided, why, or what else was considered.

## Decision

Keep one short file per architecture decision in `docs/adr/`. Each file has a
status, the reason, the options we rejected, and the consequences. The design
documents (`integration/architecture.md`, `integration/storytelling.md`,
`DESIGN.md`) keep the detail; an ADR links to them.

A decision is never edited away. To change it, write a new ADR and mark the
old one "Superseded by ADR NNNN".

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Keep decisions only in the design documents | The reasons and rejected options get lost when a document is revised. |
| Keep decisions in GitHub issues | Issues close and are hard to search from the code. |
| No record | The course asks for documented steps and discoveries. |

## Consequences

- Each new architecture decision adds one file and one line in `README.md` of
  this folder.
- Statuses: Proposed, Accepted, Superseded. "Proposed" means the team has not
  agreed yet.
