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
- Order of authority: ADR 0015 and the spec, then tests, then code. If two of
  them disagree, that is a defect. Decide which side is wrong and correct that
  side. Do not settle the conflict in code.
- This file is the only rules file for all agents. Do not add copies such as
  `CLAUDE.md` or `GEMINI.md`.
- GitHub issues are the only task list. Do not keep a local task file such as
  `tasks.md`.

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
- **Retries are safe.** Every model call has a call ID. Store its result once
  in `call_log` and never request a stored result again. Workflow steps return
  IDs and R2 keys only.
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
- Expected values in a test come from the spec text. They do not come from
  what the code does today.
- Do not change an expected value to make a test pass. If the spec is wrong,
  correct the spec and record the reason.
- A criterion passes only when its test exists and passes.
- Numbers over adjectives. Record cost, time, sizes, and frame times. Say how
  and when you measured each number.
- A failed test is a finding. Record it; do not hide it.

## 7. Architecture decisions

- Each architecture decision has a record in `docs/adr/`, with its reasons and
  the options that were rejected.
- Read the records before you change the design. To change a decision, write
  a new record and mark the old one "Superseded".
- Do not invent behaviour that the spec does not define. Product behaviour is
  a decision for the owner. For an implementation detail, choose, label it
  "implementation decision", and record it in the pull request or an ADR.
- A decision request gives four things: the background with sources
  (`file:line`, spec section, data), the real problem, the result of each
  option, and a recommendation with its reason.
- A recommendation from an agent is not a decision.

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
- Make changes in a separate worktree. Keep the main checkout as a read-only
  baseline. Commit only your own changes.
- After a push, confirm it with `git ls-remote`. After a `gh` write, confirm
  it with `gh ... view`.

## 10. Scope and trade-offs

- Ask first if the problem is real. Prefer the solution that covers most
  cases with little complexity. Leave the other cases to a person.
- Build the narrowest end-to-end path first, then widen it. The rules in
  sections 3 and 5 apply from the first slice.
- A rare case can stay manual, but it must not fail silently. Keep the data
  and show the case to a person: an error message, a log line, or a
  `needs_review` record.
- "Rare" needs evidence: a measured frequency or a fact from the owner.
- A trade-off changes the order of the work. It does not remove a capability
  that the spec defines. Do not remove a mechanism on an assumption.

## 11. Review and verification

- A change to the design or the architecture gets a review from two models
  that are not in the author's model family. Merge the findings as a union.
  If only one reviewer reports a finding, check it against the source.
- Do not trust a self-reported result ("tests pass", "file written",
  "pushed") from a sub-agent or a command. Confirm it through a second
  channel.

## 12. Workflow

Every change follows one path:

```text
spec or ADR -> issue -> refinement -> branch and worktree -> failing test
  -> code -> pull request -> checks and review -> merge
```

### Design

- Write the design by hand in `docs/specs/<topic>/` and `docs/adr/`
  (section 7). Do not use a spec-workflow tool.

### Issues

- An epic is an issue with the label `epic`. Its tasks are native GitHub
  sub-issues.
- A task issue has three sections: `## Goal`, `## Depends on`, and `## Spec`.
  `## Spec` links the baseline documents at a fixed commit.
- Do not start code until the issue has a checked refinement section and the
  label `refined`. A doc-only change and a one-line mechanical change do not
  need one.
- The refinement section is the contract for the implementer. Where it
  disagrees with the issue text, it wins. It has these fixed anchors:

  | Anchor | Form |
  |---|---|
  | Heading | Starts with `## Implementation refinement` |
  | Baseline | First line: `> Baseline checked @ origin/main <short-sha>` |
  | Contract anchors | `### Contract anchors`: file, symbol, current value |
  | Executor tier | `### Executor tier`: first line `sonnet` or `opus` |

- The `refine-issue`, `autopilot`, and `hybrid-mode` skills name these anchors
  in another language. In this repository, they use the English anchors
  above. The other parts of the section follow the `refine-issue` template,
  in English.
- The refinement is stale when a row in `### Contract anchors` no longer
  agrees with `origin/main`. Refine the issue again before you start code.

### Branch and pull request

- One issue, one branch, one pull request. Name the branch
  `<type>/<issue>-<slug>`, for example `feat/10-dsl-schemas`. The types are
  `feat`, `fix`, `docs`, `chore`, and `test`.
- For a change in behaviour, commit the failing test first, then the code.
- The pull request title follows the subject rule in section 9. The body
  uses the template in `.github/pull_request_template.md`. It names the issue
  (`Refs #10`) and has five sections: `## Summary`, `## Test discipline`,
  `## Design impact`, `## Verification` (the commands and their results), and
  `## Not verified and open items`.
- Do not push to `main` directly. Merge only when all checks are green
  (`gh pr checks <n>`).
- Merge by rebase: `gh pr merge <n> --rebase`. Do not squash. A rebase keeps
  each topic and the failing-test commit in the history.
- Once the workspace exists, CI runs the commands in section 6 on every pull
  request.

### Review

The highest tier that applies decides the review.

| Tier | Applies to | Review |
|---|---|---|
| R0 | Doc-only, test-only, or mechanical change | CI only |
| R1 | Every other change | A reviewer that did not write the code |
| R2 | Design or architecture; a rule in section 3 or 5 | Section 11 |

- The R1 reviewer checks the diff against the acceptance criteria of the
  issue.

### Sessions

- A session handover goes in `.claude/handovers/`. Do not commit it. It holds
  session state only. A lasting decision goes in an ADR, the spec, or an
  issue.

## Aesthetic Judgment

When doing design, creative, or artistic work — anything requiring aesthetic
judgment such as UI design, visual assets, layouts, color choices, typography,
animation, branding, or creative direction — read `TASTES.md` if it exists and
apply its constraints to your output. Read `DESIGN.md` for the tokens and
components of the front end.
