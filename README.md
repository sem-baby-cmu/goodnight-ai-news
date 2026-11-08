# Lullabyte

One bedtime story a day, made from that day's real AI news, for children ages 5 to 10.

Team project for the CMU MSSM course Software Engineering Management (SEM).
Earlier working name: Goodnight, AI.

## Problem

AI news is written for adults and mixes hype with fact. Parents of children
ages 5 to 10 want to raise AI literate children, but at bedtime they have no
time to find, check, and explain the news.

**Our question.** Can an agentic AI system turn real AI news into accurate,
age appropriate stories that parents trust and children look forward to every
night?

**Our approach.** A pipeline of agents picks AI news, checks each claim against
its source, and rewrites the story for two age levels (5 to 7, 8 to 10). A
parent approves each story. The story is read aloud with word highlighting and
ends with a short game. Agents do the work; parents keep control.

## Status

Milestone: prototyping (technical feasibility assessment), due Nov 9, 2026.

- Each component is a Python prototype in its own folder. It runs on a laptop.
- The production app is live at <https://goodnight.ioenv.com>: one Cloudflare
  Worker serves the landing page and the API (`/health`). D1 has the five
  tables from the architecture. Every push to `main` is checked and deployed
  by GitHub Actions.
- The stages (Scout to Playmate) do not run on Cloudflare yet. The design is
  proposed and waits for the team to agree (see [Design documents](#design-documents)).
- The handoff format between components is not ratified yet. See
  [`integration/README.md`](integration/README.md).

Work is tracked in GitHub issues:

| Issue | What | State |
| :-- | :-- | :-- |
| [#1](https://github.com/sem-baby-cmu/goodnight-ai-news/issues/1) | Epic: week 3 assignment (architecture design and technical feasibility) | open |
| [#2](https://github.com/sem-baby-cmu/goodnight-ai-news/issues/2) | Storytelling: agree on and build the news to story workflow | open, waits for owners to agree |
| [#3](https://github.com/sem-baby-cmu/goodnight-ai-news/issues/3) | Producer: a three.js sky layer behind the SVG scenes (suggestion) | open |

## Pipeline

```
 RSS feeds
    |
    v
 Scout ........... picks AI news, checks claims, rates green / yellow / red
    |
    v
 Storyteller ..... two 10-page scripts (ages 5-7, 8-10), parent card, key facts
    |
    +------------------------+
    v                        v
 Producer                 Playmate
 scenes, narration,       quiz, scene tap, word card,
 word timings             Ask the AI, badges, streaks
    |                        |
    +-----------+------------+
                v
          Story package ........ parent approves, child reads
```

Integration owns the contract between the boxes and runs one story end to end.

## Design documents

| Document | What it decides | State |
| :-- | :-- | :-- |
| [`integration/architecture.md`](integration/architecture.md) | Production architecture: one Cloudflare Workflow per story, artifacts in D1, three review gates, UUID v7 IDs | proposed, revision 2 |
| [`integration/storytelling.md`](integration/storytelling.md) | News to story: a shared story plan, claims and tags per sentence, age limits checked by code, scenes with tappable props, a bounded quality loop | proposed, revision 2 ([#2](https://github.com/sem-baby-cmu/goodnight-ai-news/issues/2)) |
| [`integration/story.schema.json`](integration/story.schema.json) | The handoff contract between components | current |
| [`DESIGN.md`](DESIGN.md) | Visual style: palette, type, buttons, motion, child surfaces for ages 5 to 7, the three.js layer | in use |
| [`TASTES.md`](TASTES.md) | Aesthetic rules for people and agents | in use |
| [`AGENTS.md`](AGENTS.md) | Rules for everyone who changes this repo | in use |
| [`docs/adr/`](docs/adr/README.md) | Architecture decision records: each decision, its reasons, and the options we rejected | 14 records |

Both proposed designs had a review by a second model family (Codex). Each
document records the findings and how they were handled.

## Repository layout

| Folder | Component | Owner | Pair (reviewer) |
| :-- | :-- | :-- | :-- |
| [`scout/`](scout/README.md) | News sources to daily news | Deokhwa Jeong | Sally Chou |
| [`storyteller/`](storyteller/README.md) | Daily news to scripts for two ages | Sally Chou | Judy Lee |
| [`producer/`](producer/README.md) | Script to scenes, narration, package | Judy Lee | Madhuri Dusad |
| [`playmate/`](playmate/README.md) | Story to interaction and games | Madhuri Dusad | Jinyu Liu |
| [`integration/`](integration/README.md) | Contract, data flow, end-to-end test | Jinyu Liu | Deokhwa Jeong |
| [`app/`](app/) | Cloudflare Worker: front end and API | Jinyu Liu | Deokhwa Jeong |

Jinyu (integration) sets the interfaces between components. A change that
affects another component is announced in a GitHub issue that mentions its
owner.

Each folder has its own README with its tests, results, and how to run it.

## Quick start

Python 3.9 or later.

```bash
# Scout: pull today's AI news (no extra packages)
python3 scout/fetch_news.py

# Producer: build the web story and carousel for one day (no API key)
pip install playwright pillow && playwright install chromium
(cd producer && python package/build_reader.py --age 5to7)

# Playmate: open the demo
open playmate/playmate.html
```

The app (`app/`) needs Node.js 22 or later.

```bash
cd app
npm ci
npx wrangler d1 migrations apply DB --local   # create the local D1 tables
npm run dev          # front end and API at http://localhost:5173
npm run typecheck    # Worker types and TypeScript
npm run build        # production build in app/dist/
```

After a change to `app/worker/db/schema.ts`, run `npm run db:generate` to
write a new migration to `app/migrations/`.

API keys go in a local `.env` file (for example `producer/.env`, copied from
`producer/.env.example`). `.env` files are ignored by git. Never commit a key.

## Target platform

The production design runs on Cloudflare Workers Paid. The proposed design,
not yet ratified, is in
[`integration/architecture.md`](integration/architecture.md). In short:

| Need | Cloudflare service |
| :-- | :-- |
| Code for each stage, the API, and the reader | Workers (Hono API, React front end in Static Assets) |
| Daily start (Scout only) | Cron Triggers |
| Reviewer page | Cloudflare Access |
| Stage order, retries, review gates | Workflows (one instance per story) |
| Stage outputs and story packages | D1 |
| Audio and images | R2 |
| Model calls, cost and token logs | AI Gateway |

## Product rules

- No ads, no public chat, no social features.
- No child account. A child's progress stays on the device.
- Only an approved story reaches a child.
- Every story keeps a link to its original news source.

## Team

| Name | GitHub | Component; team role |
| :-- | :-- | :-- |
| Deokhwa Jeong | [@deokhwajeong](https://github.com/deokhwajeong) | Scout; scrum master |
| Jinyu Liu | [@passos](https://github.com/passos) | Integration, `app/`; tech lead |
| Judy Lee | [@judylee-cmu](https://github.com/judylee-cmu) | Producer; UI/UX |
| Madhuri Dusad | [@madhuridusad97](https://github.com/madhuridusad97) | Playmate; product owner |
| Sally Chou | [@sallychochou](https://github.com/sallychochou) | Storyteller; QA |
