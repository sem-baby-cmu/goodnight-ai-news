# ADR 0012: In news to story, a model chooses from closed lists; code draws and checks

- Status: Proposed (waits for Storyteller, Producer, and Playmate owners, issue [#2](https://github.com/sem-baby-cmu/goodnight-ai-news/issues/2))
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration), after a Codex review
- Detail: [`integration/storytelling.md`](../../integration/storytelling.md)

## Context

The core of the product is turning a news item into a story: structure,
script for two ages, and interactive pictures. Free-form model output can be
wrong, scary, or out of step with its picture. Producer already showed that
drawing Pip in code makes every page safe and consistent by construction.

## Decision

- A model makes creative choices from closed lists: facts, story events,
  words, pose, which prop hides a fun fact.
- Code decides where things are drawn, where a child can tap, whether a quote
  is really in the source, and how long a sentence is.
- A shared story plan sits between the brief and the two scripts, so both ages
  tell the same story.
- Each sentence carries its own tag and claim IDs.
- Scenes are composed from a catalog of named props; the package stores the
  rendered SVG.
- A second-model judge is advisory until a golden set shows it catches faults
  that code checks miss. At most three correction rounds and a cost cap per
  story.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| One model call writes both scripts (prototype) | Two ages drift apart; no structure to check. |
| Model generates images | Pip changes from page to page; unsafe content is possible. |
| Model gives tap coordinates | Targets miss; code knows where each prop is. |
| Port Producer's renderer as is | It ignores pose and prop choices (checked in `producer/scene/card.py`). |
| Store only the scene spec | A later renderer change would change a published story. |
| Judge blocks from day one | Its value is not measured yet. |

## Consequences

- New work: brief, story plan, catalog, composer, object and tap checks.
- `architecture.md` sections 2 to 5 change after the owners agree.
