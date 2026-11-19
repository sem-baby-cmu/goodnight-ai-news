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
| [`01-production.md`](01-production.md) | `RUN` | From a news text to a draft | 6 | 42 |
| [`02-studio.md`](02-studio.md) | `EDT` | See a draft, edit and regenerate one page | 4 | 13 |
| [`03-publish.md`](03-publish.md) | `PUB` | Publish, and releases that never change | 2 | 15 |
| [`04-player.md`](04-player.md) | `PLY` | A child reads a release | 3 | 14 |
| [`05-registry.md`](05-registry.md) | `REG` | Character registry and asset pipeline | 2 | 10 |
| [`06-system.md`](06-system.md) | `SYS` | Retries, revisions, access, privacy, models | 5 | 19 |
| Total | | | 22 | 113 |

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

Current state: 108 scenarios are `spec (to implement)`, and 5 are
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
| AC-1 200 to 2,000 words give 6 to 8 pages | RUN-01.S1, RUN-01.S2 |
| AC-2 Each page has text, audio, a character, an animation, a tap | RUN-01.S3 |
| AC-3 Every layer references the frozen registry | RUN-03.S1, RUN-03.S2, RUN-03.S3 |
| AC-4 `needs_review`, not a silent change | RUN-05.S2 |
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
| Full run on an empty database | RUN-01.S2 |
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

Error rows (`design.md`, "Error Handling"):

| Error | Scenarios |
| :-- | :-- |
| URL fetch fails, too many redirects, or text too short | RUN-02.S3, RUN-02.S4, RUN-02.S6 |
| Model output fails the schema or validation | RUN-05.S1, RUN-05.S2, RUN-05.S3 |
| Layout check fails after shrinking | RUN-04.S6 |
| Provider 429 or 5xx | RUN-05.S4 |
| Provider 4xx other than 429 | RUN-05.S5 |
| TTS fails after retries | RUN-05.S6, PUB-02.S1 |
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
- The bounds of each animation parameter (see Q5).
- The exit criteria of spike S1 (the owner accepts the look; clean-up time).

## Open questions

The spec is silent on these points, or two parts of it disagree. No scenario
gives an expected result for them. Each one needs a decision from the owner
(`AGENTS.md` section 7). Do not choose an answer in code.

| # | Question | Source | Effect on the stories |
| :-- | :-- | :-- | :-- |
| Q1 | What does the API do with a pasted text of fewer than 200 or more than 2,000 words? | AC-1 covers only texts in the range. The 422 rule and the cut at 2,000 words are in `design.md`, "6. API", paragraph "URL input", and apply to a URL. | RUN-01 has no scenario for a pasted text outside the range. |
| Q2 | Which check makes sure that a page has at least one character layer, one animation, and one tap? What happens to a page that has none? | AC-2 requires them. The validation list in `design.md`, "Storybook DSL", has no rule for a minimum count. | RUN-01.S3 gives the result for a draft. No scenario covers the failure. |
| Q3 | Does an existing draft move to a new asset version? | A page run does `freeze` again and records the active versions at that time (`design.md`, "2. StoryRun Workflow"). One draft can then hold scenes made with different versions. The spec does not say if this is intended, or which version an operator edit is validated against. | REG-01 covers only a new story and an old release, as US-7 does. |
| Q4 | What happens when the provider answers a 4xx (not 429) in the `script` step? | `design.md`, "Error Handling": "The page goes to `needs_review`". The `script` step has no page. | RUN-05.S5 covers page steps only. |
| Q5 | Is an animation parameter outside its bounds rejected or clamped? | `design.md`, "5. Scene runtime", gives bounds for each primitive and no behaviour. A clamp can be a silent fix (`AGENTS.md` section 3). | RUN-03 has no scenario for parameters. |
| Q6 | Which status does the API return for a URL whose scheme is not `http` or `https`? | "URL input" says `http` and `https` only. The 422 row in "Error Handling" names a failed fetch, too many redirects, and a short text. It does not name a refused scheme. | RUN-02.S2 gives no status. |
| Q7 | Does OpenRouter pass Gemini TTS audio through, and in which format? | ADR 0015, "Consequences" (open); checked in TB0. | SYS-05.S3 covers only the raw PCM case. |
| Q8 | Where is the text of a `show_bubble` action shown? | `design.md`, "4. Layout engine": "The stage never carries text." "5. Scene runtime": `show_bubble` has a text and a target layer. | PLY-01.S4 says that the action runs. PLY-02.S4 covers the narration only. |
| Q9 | Which rule gives a run the status `draft_ready` or `needs_review`? | `design.md`, "2. StoryRun Workflow": `finish` checks that every page has current text, scene, and audio, and a run ends at one of the two. Only the row "TTS fails" in "Error Handling" names a status. A `needs_review` scene can be a head, so the check alone does not decide. ADR 0015 names only `draft_ready`. | RUN-01.S2 and RUN-05.S2 give no run status. RUN-05.S6 gives the status from the TTS row. |

## Changes

- A change to the spec comes first. Then change the stories that it affects
  in the same pull request.
- Do not change a `Then` to agree with what the code does. If the spec is
  wrong, correct the spec and record the reason.
- When a decision closes an open question, add the scenario, then remove the
  row from the table.
- A coverage script and a test dashboard do not exist. Until they do, keep
  the counts in "Files" and in "The `Test:` line" correct by hand.
