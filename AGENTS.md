# AGENTS.md

Rules for AI coding agents and people who work in this repository.
Read [`README.md`](README.md) first for what the project is.

## 1. Ownership

- Each top-level folder is one component with one owner (see the table in
  `README.md`). Change only the folder you were asked to work in.
- To change another component, open an issue or a pull request for its owner.
  Do not edit their files directly.
- `integration/` owns the contract between components. A field change in the
  contract is announced to the team before it lands.

## 2. Handoff contract

- Components exchange data as JSON files. They never read each other's
  internal state or call each other's code.
- The contract is `integration/story.schema.json`. Each field has one producer
  (`x-owner`).
- Before you hand a file to the next component, check it:

  ```bash
  python3 -I integration/validate.py --owner <Scout|Storyteller|Producer|Playmate> <file>
  ```

- If a file you receive fails the check, report it to its producer. Do not
  patch it yourself. A manual fix hides the defect from the end-to-end test.

## 3. Identifiers (decided 2026-11-08)

- All system IDs are UUID version 7 (time ordered), lower case. This includes
  `story_id`. Do not use titles or dates as IDs.
- A date is an attribute (for example `publish_date`), not an ID.
- `integration/story.schema.json` enforces the UUID v7 format for `story_id`.
- Some prototypes still name files by date (`producer/input/<date>.json`).
  Each owner moves their component to UUID v7 IDs. Until then, a date in a file
  name is only a label.

## 4. Tech stack

- **Now:** Python 3.9+ prototypes. Prefer the standard library. Add a
  dependency only when the prototype needs it, and list it in the component
  README.
- **Target:** Cloudflare. TypeScript Workers configured with `wrangler.jsonc`.
  Plan: Workers Paid. Services: Workers, Static Assets, Cron Triggers, Workflows,
  D1, R2, AI Gateway, Access. Design:
  `integration/architecture.md` (proposed).
- Before you design for a Cloudflare service, read its current limits page.
  Check both Workers Free and Workers Paid limits (CPU time, subrequests,
  retention). Do not rely on remembered numbers.
- Large binary files (audio, images) go to R2. D1 rows hold JSON and R2 keys.
  A D1 row is limited to 2 MB.

## 5. Safety and privacy

The users are children ages 5 to 10.

- Store no child personal data on a server: no name, birthday, photo, or
  voice. Progress stays in the browser.
- A child's question to "Ask the AI" goes through a model gateway with logging
  turned off, and carries no child ID.
- Only a story with an approved review status is shown to a child.
- Keys and tokens live in `.env` files, which git ignores. Never commit them,
  print them in logs, or paste them into issues.

## 6. Tests and evidence

- Each component README has a test table (for example S1-S5, P1-P9). When you
  run a test, record the result and the date in that table.
- Numbers over adjectives. Record cost, time, and counts.
- A failed test is a finding. Record it; do not hide it.
- Run the component's checks before you commit:

  ```bash
  python3 producer/test_pipeline.py --date <YYYY-MM-DD>   # Producer
  python3 playmate/run_tests.py                            # Playmate
  python3 -I integration/validate.py <story.json>          # any handoff file
  npm --prefix app run typecheck                           # Cloudflare Worker
  ```

## 6.5 Architecture decisions

- Each architecture decision has a record in `docs/adr/`, with its reasons and
  the options that were rejected.
- Read the records before you change the design. To change a decision, write
  a new record and mark the old one "Superseded".

## 7. Writing style

- Plain English. Short sentences. One idea per sentence.
- Use tables for comparisons and test results.
- Name files and fields in backticks: `scene_description`, `producer/README.md`.

## 8. Git

- One topic per commit. Start the subject with the component:
  `Producer: make the voice test runnable`.
- Keep history linear. Rebase on `origin/main`; do not create merge commits.
- Do not add AI attribution lines to commit messages or pull requests.
- Build output is not tracked (for example `producer/results/`).

## Aesthetic Judgment

When doing design, creative, or artistic work — anything requiring aesthetic judgment such as UI design, visual assets, layouts, color choices, typography, animation, branding, or creative direction — read `TASTES.md` if it exists and apply its constraints to your output. Read `DESIGN.md` for the tokens and components of the front end.
