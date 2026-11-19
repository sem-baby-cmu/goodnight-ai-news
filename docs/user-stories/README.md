# User stories

The behaviour of the storybook MVP, written as stories with Given / When /
Then scenarios. A refinement, a test, and a review name a scenario by its ID.

The stories add no behaviour. Every expected value comes from
[`requirements.md`](../specs/storybook-mvp/requirements.md),
[`design.md`](../specs/storybook-mvp/design.md), or
[ADR 0015](../adr/0015-storybook-mvp-reset.md). If a story and the spec
disagree, the spec wins and the story is corrected (`AGENTS.md` section 1).

## Files

| File | Prefix | Area | Stories | Scenarios |
| :-- | :-- | :-- | --: | --: |
| [`01-production.md`](01-production.md) | `RUN` | From a news text to a draft | 6 | 49 |
| [`02-studio.md`](02-studio.md) | `EDT` | See a draft, edit and regenerate one page | 4 | 13 |
| [`03-publish.md`](03-publish.md) | `PUB` | Publish, and releases that never change | 2 | 15 |
| [`04-player.md`](04-player.md) | `PLY` | A child reads a release | 3 | 15 |
| [`05-registry.md`](05-registry.md) | `REG` | Character registry and asset pipeline | 2 | 11 |
| [`06-system.md`](06-system.md) | `SYS` | Retries, revisions, access, privacy, models | 5 | 19 |
| Total | | | 22 | 122 |

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

Current state: 117 scenarios are `spec (to implement)`, and 5 are
`manual · not run`. No scenario passes.

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
| AC-1 200 to 2,000 words give 6 to 8 pages | RUN-01.S1, RUN-01.S2, RUN-01.S9, RUN-01.S10 |
| AC-2 Each page has text, audio, a character, an animation, a tap | RUN-01.S3, RUN-03.S13 |
| AC-3 Every layer references the frozen registry | RUN-03.S1, RUN-03.S2, RUN-03.S3 |
| AC-4 `needs_review`, not a silent change | RUN-05.S2, RUN-03.S14 |
| AC-5 "Regenerate audio" changes page 3 only | EDT-02.S3 |
| AC-6 One stored result for each call ID | SYS-01.S1, SYS-01.S3, SYS-01.S4 |
| AC-7 A retry completes the head move | SYS-01.S2 |
| AC-8 A late result is kept as `superseded` | EDT-04.S1 |
| AC-9 Publishing is blocked; "still fits" | PUB-02.S1 to PUB-02.S7, EDT-03.S2 |
| AC-10 A release has a new prefix and changes no earlier release | PUB-01.S1, PUB-01.S4 |
| AC-11 A release has copies of its asset versions | PUB-01.S3 |
| AC-12 Safari on iPad and iPhone, Chrome on Android | PLY-03.S1, PLY-03.S2 |
| AC-13 The Studio is behind Access; the Player is public | SYS-03.S1, SYS-03.S2 |

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
| Head moved since the operator loaded it | EDT-02.S2, EDT-03.S4 |
| Compare-and-set loop exhausted (5 tries) | SYS-02.S3 |
| Publish blocked | PUB-02.S7 |
| Run fails | RUN-05.S7 |
| Error record fields; no full text in logs | SYS-04.S2, SYS-04.S3 |

Not written as scenarios, because they are not behaviour of the system:

- The number of layout templates (6 to 8) and the template content.
- The asset pipeline steps "find figures" and "name figures". A person does
  them with a tool, and the crop map is their result.
- The bounds of each animation parameter. They are data in the primitive
  table. RUN-03.S14 covers a value outside them.
- The exit criteria of spike S1 (the owner accepts the look; clean-up time).

## Open questions

The spec is silent on these points, or two parts of it disagree. No scenario
gives an expected result for them. Each one needs a decision from the owner
(`AGENTS.md` section 7). Do not choose an answer in code.

| # | Question | Source | Effect on the stories |
| :-- | :-- | :-- | :-- |
| Q2 | What does `PUT /api/studio/stories/:id/pages/:pageId/scene` return when an operator's scene fails validation, for example with no tap or with a parameter outside its bounds? | The owner decided the rule for model output (Q2, Q5). "6. API" says only that the operator's scene is "Validated, laid out". It gives no response for a failure. | RUN-03.S13 and RUN-03.S14 cover model output only. EDT-03 has no scenario for an invalid operator scene. |
| Q3 | Which registry version does an operator's scene edit, or "still fits", use? How does a scene revision record the versions that it was made with, so that publish knows which version to copy? | The owner decided that one draft can hold several versions of an asset, and that a release copies each version that it uses (Q3). The `revision` table has no column for registry versions, and a human revision has no `call_id` that leads to a run. `GET /api/studio/registry` returns only active versions. Issue #32 proposes `revision.asset_versions`. | REG-01.S6 covers a page run only. PUB-01.S3 says that the release copies every version in use, but no scenario says how the version is found. |
| Q7 | Does OpenRouter pass Gemini TTS audio through, and in which format? | ADR 0015, "Consequences" (open); checked in TB0. | SYS-05.S3 covers only the raw PCM case. |

The owner closed Q1, Q4, Q5, Q6, Q8, Q9, and Q10 on 2026-11-19 (#34), and
narrowed Q2 and Q3 to the rows above. A question number is not used again.

## Changes

- A change to the spec comes first. Then change the stories that it affects
  in the same pull request.
- Do not change a `Then` to agree with what the code does. If the spec is
  wrong, correct the spec and record the reason.
- When a decision closes an open question, add the scenario, then remove the
  row from the table.
- A coverage script and a test dashboard do not exist. Until they do, keep
  the counts in "Files" and in "The `Test:` line" correct by hand.
