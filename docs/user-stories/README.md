# User stories

The behaviour of the storybook MVP, written as stories with Given / When /
Then scenarios. A refinement, a test, and a review name a scenario by its ID.

The stories add no behaviour. Every expected value comes from
[`requirements.md`](../specs/storybook-mvp/requirements.md),
[`design.md`](../specs/storybook-mvp/design.md), or
[ADR 0015](../adr/0015-storybook-mvp-reset.md),
[ADR 0016](../adr/0016-backdrops-page-turn.md), and
[ADR 0017](../adr/0017-shelf-home-player-states.md). If a story and the spec
disagree, the spec wins and the story is corrected (`AGENTS.md` section 1).

## Files

| File | Prefix | Area | Stories | Scenarios |
| :-- | :-- | :-- | --: | --: |
| [`01-production.md`](01-production.md) | `RUN` | From a news text to a draft | 6 | 55 |
| [`02-studio.md`](02-studio.md) | `EDT` | See a draft, edit and regenerate one page | 4 | 33 |
| [`03-publish.md`](03-publish.md) | `PUB` | Publish, releases that never change, and the shelf list | 3 | 30 |
| [`04-player.md`](04-player.md) | `PLY` | A child picks a book and reads a release | 6 | 77 |
| [`05-registry.md`](05-registry.md) | `REG` | Character registry and asset pipeline | 2 | 14 |
| [`06-system.md`](06-system.md) | `SYS` | Retries, revisions, access, privacy, models | 5 | 22 |
| Total | | | 26 | 231 |

## Format

```markdown
## RUN-01 <story title>

As the <role>, I want <goal>, so that <reason>.

Spec: requirements <items> · design "<section title>", ...

### RUN-01.S1 <scenario title>
- Given <start state>
- When <one action>
- Then <result that a test can check>
- Test: <status>
```

- A story ID is `<PREFIX>-<nn>`. A scenario ID is `<story ID>.S<n>`. An ID
  never changes and is never used again. A new scenario gets the next number.
- The roles are the operator, a child, the designer, and the system. A story
  that the requirements do not list says "(Derived from ...)" and names its
  source.
- The `Spec:` line names the sources. `US-n` and `AC-n` are the n-th user
  story and the n-th acceptance criterion in `requirements.md`, in the order
  of that file. A design section is named by its title. A label in
  parentheses names a paragraph in that section.
- One scenario has one `When` and checks one behaviour.
- The steps S1, TB0, S2, TB1, TB2, and TB3 are the milestones of epic #8.

## The `Test:` line

| Value | Meaning | Passes? |
| :-- | :-- | :-- |
| `spec (to implement)` | No test exists. The scenario is an acceptance spec. | No |
| `<package> · <test file>` | An automated test exists in that file. | When that test passes |
| `manual · not run` | The design defines a manual check. No result is recorded. | No |
| `manual · <where the result is>` | The manual check was done and recorded there. | When the record says so |

- One scenario maps to one test. The title of that test starts with the
  scenario ID, for example `it("RUN-05.S2 a scene that still fails ...")`.
- The pull request that implements a scenario changes its `Test:` line in the
  same pull request.
- An expected value in the test comes from the spec text (`AGENTS.md`
  section 6).
- A refinement section names the scenario IDs that it covers in its
  acceptance part.

Current state: 91 scenarios are `spec (to implement)`, 131 have an
automated test, 8 are `manual · not run`, and 1 is a recorded manual check.

## Coverage of the requirements

| Requirement | Stories and scenarios |
| :-- | :-- |
| US-1 Paste a news text, get a draft | RUN-01 |
| US-2 Change one page text, regenerate only its audio | EDT-02 |
| US-3 Regenerate the scene of one page | EDT-03 |
| US-4 Publish a release that never changes | PUB-01 |
| US-5 Characters move and react to a tap | PLY-01 |
| US-6 Each page is read aloud | PLY-02 |
| US-7 Replace a character asset with a new version | REG-01 |
| US-8 Pick a book from a shelf | PLY-05 |
| AC-1 200 to 2,000 words give 6 to 8 pages | RUN-01.S1, RUN-01.S2, RUN-01.S9, RUN-01.S10 |
| AC-2 Each page has text, audio, a character, an animation, a tap | RUN-01.S3, RUN-03.S13 |
| AC-3 Every layer references the registry: the frozen version for an AI draft, the active version for an operator's edit | RUN-03.S1, RUN-03.S2, RUN-03.S3, EDT-03.S16, EDT-03.S19 |
| AC-4 `needs_review`, not a silent change | RUN-05.S2, RUN-03.S14 |
| AC-5 "Regenerate audio" changes page 3 only | EDT-02.S3 |
| AC-6 One stored result for each call ID | SYS-01.S1, SYS-01.S3, SYS-01.S4 |
| AC-7 A retry completes the head move | SYS-01.S2 |
| AC-8 A late result is kept as `superseded` | EDT-04.S1 |
| AC-9 Publishing is blocked; "still fits" | PUB-02.S1 to PUB-02.S7, EDT-03.S2 |
| AC-10 A release has a new prefix and changes no earlier release | PUB-01.S1, PUB-01.S4 |
| AC-11 A release has copies of its asset versions, with each backdrop | PUB-01.S3, PUB-01.S10 |
| AC-12 Every scene names a backdrop with a variant for its sky | RUN-03.S15, RUN-03.S16, EDT-03.S23 |
| AC-13 Narration below the stage; page-turn transition; narration starts in the tap handler; end page | PLY-02.S4, PLY-04.S1 to PLY-04.S17 |
| AC-14 Safari on iPad and iPhone, Chrome on Android | PLY-03.S1, PLY-03.S2 |
| AC-15 The Studio is behind Access; the Player, the shelf, and `GET /api/shelf` are public | SYS-03.S1, SYS-03.S2 |
| AC-16 `GET /api/shelf` lists the latest release of each published story, three fields, newest story first; a story with a broken pointer is not listed | PUB-03.S1 to PUB-03.S12, PUB-01.S11 |
| AC-17 The shelf shows books with a title and a still cover; shelf pages; quiet empty and failed states | PLY-05.S1 to PLY-05.S15, PLY-05.S19 to PLY-05.S21 |
| AC-18 One Home control on each book screen; the Resting state; "Start" does not wait for audio | PLY-06.S1 to PLY-06.S15, PLY-04.S11, PLY-04.S14 |
| AC-19 A tappable layer has a hit area of 64 x 64 CSS px or more, cut at the stage edge; a drawn layer wins over a margin | PLY-01.S8 to PLY-01.S14 |

## Coverage of the design

Integration sequences (`design.md`, "Testing Strategy"):

| Sequence | Scenarios |
| :-- | :-- |
| Full run on an empty database | RUN-01.S2, RUN-01.S11 |
| Stop after the `call_log` insert, then retry | SYS-01.S1 |
| Stop after the revision insert and before the head move, then retry | SYS-01.S2 |
| First output invalid, repair valid, 429 between them | RUN-05.S1 |
| Operator edits page 3 text while `scene:p3` is running | EDT-04.S1 |
| Page run for page 3 audio after a text change | EDT-02.S3 |
| TTS fails for page 5, then publish | RUN-05.S6, PUB-02.S1 |
| Stale scene, "still fits", then publish | PUB-02.S6 |
| Publish twice | PUB-01.S4 |
| Release contents | PUB-01.S3 |
| Content route | PUB-01.S8 |
| URL input | RUN-02.S3, RUN-02.S5, RUN-02.S6 |
| Text input | RUN-01.S9, RUN-01.S10 |
| Shelf | PUB-03.S1, PUB-03.S2, PUB-03.S3, PUB-03.S7 |
| Shelf after a second release | PUB-03.S4 |
| Shelf on an empty database | PUB-03.S6 |
| Shelf with a broken pointer | PUB-03.S11, PUB-03.S12 |

Error rows (`design.md`, "Error Handling"):

| Error | Scenarios |
| :-- | :-- |
| URL scheme refused, URL fetch fails, too many redirects, or text too short | RUN-02.S2, RUN-02.S3, RUN-02.S4, RUN-02.S6, RUN-01.S9 |
| Model output fails the schema or validation | RUN-05.S1, RUN-05.S2, RUN-05.S3 |
| Layout check fails after shrinking | RUN-04.S6 |
| Provider 429 or 5xx | RUN-05.S4 |
| Provider 4xx other than 429, in `scene:*` or `audio:*` | RUN-05.S5 |
| Provider 4xx other than 429, in `script` | RUN-05.S8 |
| TTS fails after retries | RUN-05.S6, RUN-01.S12, PUB-02.S1 |
| Basis changed before commit | EDT-04.S1 |
| Operator's scene fails validation | EDT-03.S7, EDT-03.S8, EDT-03.S9, EDT-03.S15 |
| Operator's scene carries an `instanceId` that is not a layer of the `basedOn` scene revision | EDT-03.S20, EDT-03.S21 |
| Operator's scene names a new layer in an animation or tap | EDT-03.S13 |
| Operator's page text fails `PageText` validation | EDT-02.S4 |
| "Still fits" on a `needs_review` scene | EDT-03.S11 |
| "Still fits" copy fails validation against the active registry | EDT-03.S17 |
| Full run requested when the story has an `outline` head, or a run of the story is `queued` or `running` | RUN-05.S10, RUN-05.S11 |
| Page run requested while a run of the story is `queued` or `running` | RUN-05.S12 |
| Head moved since the operator loaded it | EDT-02.S2, EDT-02.S5, EDT-03.S4, EDT-03.S10, EDT-03.S18 |
| Compare-and-set loop exhausted (5 tries) | SYS-02.S3 |
| Compare-and-set loop exhausted (5 tries), API save route | EDT-03.S22 |
| Publish blocked | PUB-02.S7 |
| Run fails | RUN-05.S7, RUN-05.S9 |
| Database fails in `GET /api/shelf` | PUB-03.S8 |
| A release pointer names no `release` row, or a release of another story | PUB-03.S11, PUB-03.S12 |
| The shelf request fails | PLY-05.S9, PLY-05.S10 |
| A cover fails to load | PLY-05.S13 |
| A release does not exist; or the manifest, a page JSON, or a first-page file fails before "Start" | PLY-06.S5, PLY-06.S6, PLY-06.S7, PLY-06.S12, PLY-06.S13 |
| An image fails to load after "Start" | PLY-06.S10 |
| The narration of a page cannot be loaded or played after "Start" | PLY-06.S11 |
| Error record fields; no full text in logs | SYS-04.S2, SYS-04.S3 |

Not written as scenarios, because they are not behaviour of the system:

- The number of layout templates (6 to 8) and the template content.
- The asset pipeline steps "find figures" and "name figures". A person does
  them with a tool, and the crop map is their result.
- The bounds of each animation parameter. They are data in the primitive
  table. RUN-03.S14 covers a value outside them.
- The exit criteria of spike S1 (the owner accepts the look; clean-up time).

## Open questions

This section lists the points on which the spec is silent, or on which two
parts of it disagree. No scenario gives an expected result for them. Each one
needs a decision from the owner (`AGENTS.md` section 7). Do not choose an
answer in code.

No question is open.

The points that ADR 0017 leaves open are in its "Still open" section. No
scenario gives an expected result for them.

On 2026-11-19 the owner closed Q1, Q4 to Q6, and Q8 to Q10 (#34), Q2 (#36),
Q11 to Q13 (#38), and Q3, Q7, Q14, and Q15 (#32). The scenarios of the last
four:

| # | Scenarios |
| :-- | :-- |
| Q3 | REG-01.S6, EDT-03.S16, EDT-03.S19, PUB-01.S9 |
| Q7 | SYS-05.S4, SYS-05.S5 |
| Q14 | EDT-03.S12, EDT-03.S13, EDT-03.S14, EDT-03.S15, EDT-03.S20, EDT-03.S21 |
| Q15 | EDT-02.S4, EDT-02.S5 |

A question number is not used again.

## Changes

- A change to the spec comes first. Then change the stories that it affects
  in the same pull request.
- Do not change a `Then` to agree with what the code does. If the spec is
  wrong, correct the spec and record the reason.
- When a decision closes an open question, add the scenario, then remove the
  row from the table.
- A coverage script and a test dashboard do not exist. Until they do, keep
  the counts in "Files" and in "The `Test:` line" correct by hand.
