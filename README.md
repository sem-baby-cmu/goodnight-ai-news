# Lullabyte

Interactive bedtime storybooks for children ages 5 to 10, made from real news.

Team project for the CMU MSSM course Software Engineering Management (SEM).
Earlier working name: Goodnight, AI.

## Problem

News is written for adults. Parents of young children want to talk with them
about what happens in the world, but at bedtime they have no time to find the
news and turn it into something a child enjoys.

**Our question.** Can an AI system turn a real news story into an interactive
storybook that a child wants to look at, listen to, and touch?

## Status

- **Current work:** the storybook MVP. Epic:
  [#8](https://github.com/sem-baby-cmu/goodnight-ai-news/issues/8).
- **Decision:** [ADR 0015](docs/adr/0015-storybook-mvp-reset.md) resets the
  project to one TypeScript code base on Cloudflare. The earlier Python
  prototypes are kept in [`modules/`](modules/) as history. New code does not
  depend on them.
- **Kept from earlier work:** the Producer character design and visual style
  ([`modules/material/00_storybook_design/`](modules/material/00_storybook_design/)).
- **Live today:** the earlier Worker in [`app/`](app/) still serves
  <https://goodnight.ioenv.com>. It is replaced when the MVP Worker goes live.

## What the MVP does

```
News text (pasted, or one URL)
   |
   v
StoryRun workflow ..... outline and page text (LLM)
   |                    one scene per page (LLM picks, code places)
   |                    narration audio per page (TTS)
   v
Draft ................. Studio: edit a page, regenerate one page target
   |
   v
Release ............... immutable; the Player reads it
```

A page is layered: a background, characters, and props. Characters move and
react to a tap. All characters come from a versioned registry, so they look
the same on every page.

Out of scope for the MVP: fact-checking, scheduled production, word-level
highlighting, content safety and copyright policy, user accounts, export.

## Design documents

| Document | What it decides |
| :-- | :-- |
| [`docs/specs/storybook-mvp/requirements.md`](docs/specs/storybook-mvp/requirements.md) | MVP scope, user stories, acceptance criteria |
| [`docs/specs/storybook-mvp/design.md`](docs/specs/storybook-mvp/design.md) | Architecture, workflow steps, DSL, data model, error handling, tests |
| [`docs/user-stories/`](docs/user-stories/README.md) | Behaviour as stories and Given / When / Then scenarios; each scenario names its test |
| [`docs/adr/`](docs/adr/README.md) | Architecture decision records; ADR 0015 is the current baseline |
| [`DESIGN.md`](DESIGN.md) | Front-end tokens: palette, type, buttons, motion (its three.js section is superseded by ADR 0015) |
| [`TASTES.md`](TASTES.md) | Aesthetic rules for people and agents |
| [`AGENTS.md`](AGENTS.md) | Rules for everyone who changes this repo |

## Architecture in short

| Need | Cloudflare service |
| :-- | :-- |
| Studio, Player, API, content | One Worker `lullabyte` (Hono API, React in Static Assets) |
| Production steps and retries | Workflows (one instance per run) |
| Registry, stories, revisions, releases | D1 |
| Character assets, audio, releases | R2 |
| Model calls | All through AI Gateway, none through OpenRouter. JSON: `/compat` to Google AI Studio and OpenAI (a local proxy in development). TTS: `google-ai-studio` (Google AI Studio directly in development) |
| Studio protection | Cloudflare Access |

## Repository layout

| Folder | What | State |
| :-- | :-- | :-- |
| `apps/storybook/` | MVP Worker and front end (Studio, Player) | planned (TB0) |
| `packages/` | `dsl`, `scene-runtime`, `layout`, `models` | planned (TB0) |
| `tools/assets/` | Offline asset pipeline and registry seed | planned (S1) |
| `assets/` | Hand-cleaned SVG character sources | planned (S1) |
| [`docs/`](docs/) | Specs, ADRs, course documents | current |
| [`app/`](app/) | Earlier Worker, live at goodnight.ioenv.com | replaced by the MVP |
| [`modules/`](modules/) | Earlier Python prototypes and design material | history; read only |

## Product rules

- No ads, no public chat, no social features.
- No child account. A child's progress stays on the device.
- Only a published release reaches a child.

## Team

| Name | GitHub | Role |
| :-- | :-- | :-- |
| Deokhwa Jeong | [@deokhwajeong](https://github.com/deokhwajeong) | Scrum master |
| Jinyu Liu | [@passos](https://github.com/passos) | Tech lead; owns the MVP |
| Judy Lee | [@judylee-cmu](https://github.com/judylee-cmu) | UI/UX; character design |
| Madhuri Dusad | [@madhuridusad97](https://github.com/madhuridusad97) | Product owner |
| Sally Chou | [@sallychochou](https://github.com/sallychochou) | QA |
