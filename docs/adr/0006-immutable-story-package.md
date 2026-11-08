# ADR 0006: The front end reads one immutable story package

- Status: Proposed (Integration accepts; team review pending)
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`integration/architecture.md`](../../integration/architecture.md) D6, section 4

## Context

The reader needs the full story: text for two ages, scenes, narration and
word timings, quiz, and word card. These come from different stages.

## Decision

A package step builds one `story_package` row: a versioned manifest with the
text, quiz, and word card, and R2 keys for audio and images. A parent approves
it at Gate C. Publishing points the story at that package ID. A published
package never changes.

## Reasons

- The reader loads one object.
- What the parent approved is exactly what the child sees.
- A fix makes a new package version; the old one stays for audit.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Reader joins the latest artifacts itself | A new artifact could reach a child without approval. |
| Editable package | The approved and the shown story could differ. |
| Whole package as one R2 file | No status, no query; D1 holds the manifest, R2 holds media. |

## Consequences

- [ADR 0012](0012-models-choose-code-draws.md) adds rendered SVG to the
  package, so a later renderer change cannot change a published story.
