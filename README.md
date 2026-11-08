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
- Nothing is deployed yet. The target platform is Cloudflare (see
  [Target platform](#target-platform)).
- The handoff format between components is not ratified yet. See
  [`integration/README.md`](integration/README.md).

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

## Repository layout

| Folder | Component | Owner | Pair (reviewer) |
| :-- | :-- | :-- | :-- |
| [`scout/`](scout/README.md) | News sources to daily news | Deokhwa Jeong | Sally Chou |
| [`storyteller/`](storyteller/README.md) | Daily news to scripts for two ages | Sally Chou | Judy Lee |
| [`producer/`](producer/README.md) | Script to scenes, narration, package | Judy Lee | Madhuri Dusad |
| [`playmate/`](playmate/README.md) | Story to interaction and games | Madhuri Dusad | Jinyu Liu |
| [`integration/`](integration/README.md) | Contract, data flow, end-to-end test | Jinyu Liu | Deokhwa Jeong |

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

API keys go in a local `.env` file (for example `producer/.env`, copied from
`producer/.env.example`). `.env` files are ignored by git. Never commit a key.

## Target platform

The production design runs on Cloudflare Workers Paid. The proposed design,
not yet ratified, is in
[`integration/architecture.md`](integration/architecture.md). In short:

| Need | Cloudflare service |
| :-- | :-- |
| Code for each stage, the API, and the reader | Workers, with Static Assets for the front end |
| Daily start (Scout only) | Cron Triggers |
| Feed card images | Browser Run |
| Reviewer page | Cloudflare Access |
| Stage-to-stage hand-off | Queues (signal) and D1 (state of record) |
| Story packages and stage outputs | D1 |
| Audio and images | R2 |
| Model calls, cost and token logs | AI Gateway |

## Product rules

- No ads, no public chat, no social features.
- No child account. A child's progress stays on the device.
- Only an approved story reaches a child.
- Every story keeps a link to its original news source.

## Team

Deokhwa Jeong, Jinyu Liu, Judy Lee, Madhuri Dusad, Sally Chou.
