# AGENTS.md

Rules for AI coding agents and people who work in this repository.
Read [`README.md`](README.md) first for what the project is.

## 1. Baseline

- The current design is [ADR 0015](docs/adr/0015-storybook-mvp-reset.md) and
  the spec in [`docs/specs/storybook-mvp/`](docs/specs/storybook-mvp/).
  When older documents disagree, these win.
- Jinyu Liu (`passos`) owns all technical decisions and does the MVP work.
- [`modules/`](modules/) holds earlier prototypes and design material. It is
  history: do not change it, and do not import from it. The one exception is
  the Producer boards in `modules/material/00_storybook_design/`, which the
  asset pipeline reads as its source.
- [`app/`](app/) is the earlier Worker that is live today. Do not change it
  unless a task says so. It is replaced when the MVP Worker goes live.

## 2. Tech stack

- TypeScript only, strict mode. Node.js 22 or later, pnpm workspaces, Vitest.
- Cloudflare Workers Paid. Configuration in `wrangler.jsonc`. Services:
  Workers, Static Assets, Workflows, D1, R2, AI Gateway, Access.
- Front end: React 19 and Vite (ADR 0009). API: Hono. Database: D1 with
  Drizzle (ADR 0010).
- Before you design for a Cloudflare service, read its current limits page.
  Do not rely on remembered numbers.
- Large binary files (audio, images, SVG assets) go to R2. D1 rows hold JSON
  and R2 keys. A D1 row is limited to 2 MB.

## 3. Design rules (from ADR 0015)

- **Models choose, code places.** A model picks from closed lists: layout
  templates, registry asset keys, poses, expressions, animation and tap
  primitives. Code computes positions and checks them.
- **No silent fixes.** If a model output fails validation after one repair,
  keep it with its errors and mark it `needs_review`. Never drop a layer or
  swap a character to make it pass.
- **Revisions never change.** Every stage output is a new revision row. Move a
  head only by compare-and-set.
- **Retries are safe.** Every model call has a call ID. Write at most one
  revision per call ID. Workflow steps return IDs and R2 keys only.
- **Releases never change.** A release has its own R2 prefix with copies of
  the assets it uses.
- **No generated code runs in the browser.** The renderer runs only the
  primitives in `packages/scene-runtime`. SVG assets are sanitised (no
  scripts, no event attributes) before upload.
- **Model IDs are configuration.** Read them from environment variables, not
  from code.

## 4. Identifiers

- All system IDs are UUID version 7, lower case (ADR 0007).
- Asset keys (for example `pip`) are readable names, unique per asset. They
  are not system IDs.
- A date is an attribute, not an ID.

## 5. Safety and privacy

The users are children ages 5 to 10.

- Store no child personal data on a server: no name, birthday, photo, or
  voice. Progress stays in the browser.
- Only a published release is shown to a child.
- Keys and tokens live in `.env` files and Worker secrets. Never commit them,
  print them in logs, or paste them into issues.
- Logs do not contain full news texts or full model outputs.

## 6. Tests and evidence

- Run before you commit (once the workspace exists):

  ```bash
  pnpm -r typecheck
  pnpm -r test
  ```

- Every acceptance criterion in the spec maps to a test (see the design
  document, "Testing Strategy").
- Numbers over adjectives. Record cost, time, sizes, and frame times.
- A failed test is a finding. Record it; do not hide it.

## 7. Architecture decisions

- Each architecture decision has a record in `docs/adr/`, with its reasons and
  the options that were rejected.
- Read the records before you change the design. To change a decision, write
  a new record and mark the old one "Superseded".

## 8. Writing style

- All repository text, issues, and pull requests are in English.
- Plain English. Short sentences. One idea per sentence.
- Use tables for comparisons and test results.
- Name files and fields in backticks: `scene`, `packages/dsl`.

## 9. Git

- One topic per commit. Start the subject with the area:
  `Docs: ...`, `DSL: ...`, `Runtime: ...`, `Workflow: ...`, `Assets: ...`.
- Keep history linear. Rebase on `origin/main`; do not create merge commits.
- Do not add AI attribution lines to commit messages or pull requests.
- Build output is not tracked (for example built WebP assets, `dist/`).

## Aesthetic Judgment

When doing design, creative, or artistic work — anything requiring aesthetic
judgment such as UI design, visual assets, layouts, color choices, typography,
animation, branding, or creative direction — read `TASTES.md` if it exists and
apply its constraints to your output. Read `DESIGN.md` for the tokens and
components of the front end.
