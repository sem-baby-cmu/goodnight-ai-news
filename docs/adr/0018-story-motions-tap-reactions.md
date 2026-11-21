# ADR 0018: Story motions and tap reactions

- Status: Proposed
- Date: 2026-11-21
- Decided by: Jinyu Liu (owner) approved the look in a motion mock on
  2026-11-21 (version 2; an HTML mock, not in the repository). The rules
  that implement the look are proposals of the author (a Fable 5.2 design
  pass). On the same day the owner ruled on two differences between the mock
  and the runtime, from a comparison page (decisions 5 and 6). One item
  waits for an owner ruling ("Still open").
- Reviewed: 2026-11-21, by two models of other families (a Codex seat and
  a Gemini seat), one round. The findings and what was done with each are
  in "Review".
- Amends: [ADR 0016](0016-backdrops-page-turn.md), section 1: layers are
  cut at the frame, not at the stage (section 10 of this record). Amends
  ADR 0016 and [ADR 0017](0017-shelf-home-player-states.md) in the rules of
  the page phases, the Start gate, and reduced motion. ADR 0015 is not
  superseded.
- Spec: [`design.md`](../specs/storybook-mvp/design.md) "5. Scene runtime",
  "Data Models". The spec changes when this record is accepted.
- Issue: #137

Baseline: `origin/main` `2be0f2e`. Every `file:line` below is of that commit.

## Context

The owner looked at the first live book and said that the animation is too
weak: a character moves a little, and a tap does almost nothing.

Measured on release 1 of "The New Reading Garden"
(`01a1fa73-e3d3-76d4-9bbf-656f3e6a072a`, 7 pages, read from the public
release files on 2026-11-21):

| Page | The text says | The page shows |
| :-- | :-- | :-- |
| 1 | Lumi and Bobo walk past the fence | 2 `bounce` on `enter`: two hops in place, then nothing moves |
| 2 | | 1 `bounce` on `enter` |
| 3 | | 1 `pop` on `enter` |
| 4, 5 | | 1 `sway` loop |
| 6 | Clouds drift, raindrops fall, ripples form | 1 `float` loop on `raindrops`: 3% of the stage height |
| 7 | Stars shine, the cast gets ready for sleep | 1 `fade-in` on `enter`, then nothing moves |

- The 7 pages have 8 animations. Six pages have one, the minimum.
- The 17 taps of the book show a bubble. One page adds a `bounce`. No tap
  plays a sound, and no tap changes a pose or an expression.

Causes, from the source:

- The prompt asks for the minimum. It says "Include at least one
  character, one animation, and one tap interaction"
  (`apps/storybook/worker/workflow/prompts.ts:103`). It lists each
  primitive with the assets that it works on, and does not say what a
  primitive shows (`prompts.ts:159-166`, `187`).
- The closed list has 7 primitives (`packages/dsl/src/primitives.ts:19-27`).
  None moves a layer away from its place. The largest travel is `bounce`,
  5% of the stage height. Nothing can show "walk", "drift", or "fall".
- The prompt asks for a tap on each character
  (`prompts.ts:108`). It does not ask for an action in that tap.
- `blink` and `wave` need the `svg-rig` renderer. Every layer file of the
  live release is a `webp` file, so these two never run.
- Two lists say which trigger a primitive allows, in two packages:
  `ONE_SHOT_PRIMITIVES` (`primitives.ts:54`) and `LOOPABLE`
  (`packages/scene-runtime/src/keyframes.ts:18`). `play_animation` accepts
  every primitive (`packages/dsl/src/schemas.ts:47-51`).
- A layer has two wrappers, `loop` and `once` (`keyframes.ts:9`). A tap
  animation runs on `once`, the wrapper of the `enter` animations. Two
  animations of one property on one element replace each other, and
  `Animator` removes only a second animation of the same primitive
  (`packages/scene-runtime/src/animator.ts:15-16`).
- Only a layer with an `enter` `fade-in` is hidden before its `enter`
  animation starts (`packages/scene-runtime/src/SceneView.tsx:73-74`, `696`).

## Decision

Owner decisions (2026-11-21, from the mock):

1. A page has story motions: a character walks in, a plant grows, a cloud
   drifts, rain falls, a star twinkles, a sleepy character nods.
2. A tap gives a clear reaction: the body moves, paper bits fly out, the
   bubble pops, and a sound plays. A character can change its pose for the
   time of the reaction.
3. Each character breathes a little all the time, so a page is never
   completely still.
4. The last page stays slow and quiet. It is the bedtime page.

Owner rulings (2026-11-21, from a page that compared the options on the
live page 1 in a 16:9 picture area):

5. A `walk-in` character comes from outside the whole picture, on every
   screen. A layer can be drawn over the bleed of the backdrop.
6. Scenery can grow on any page, as the mock showed. During a page turn and
   on the Start gate, a page shows only the layers that have no such
   `enter` motion. On page 1 of the mock that is the backdrop and the sun.

The rules below implement them. They are proposals of the author. They are
accepted with this record, after the review and the ruling of "Still open".

### 1. One table for every primitive

`PRIMITIVES` (`packages/dsl/src/primitives.ts`) gets two new fields for
each primitive. The table is the only source for the schema, the
validation, the runtime, and the prompt.

- `triggers`: the triggers that the primitive allows, from `enter`, `loop`,
  and `tap`. `tap` means a `play_animation` action.
- `kinds`: the layer kinds that the primitive allows, or "all".

`ONE_SHOT_PRIMITIVES` and `LOOPABLE` go away. The 7 primitives of today
keep every trigger that they have today, and they keep "all" kinds:

| Primitive | Triggers | Kinds |
| :-- | :-- | :-- |
| `float`, `sway`, `blink` | `enter`, `loop`, `tap` | all |
| `bounce`, `pop`, `fade-in`, `wave` | `enter`, `tap` | all |

The list grows from 7 to 21 primitives (sections 2 and 3).

The schemas are made from the table, one trigger group at a time:

- `animations` has one member for each primitive that allows `enter` or
  `loop`: 14 members. A new primitive has only its own triggers in its
  member. The 7 old members keep both triggers, as today, so a stored
  revision parses as before, and the code `loop_not_allowed` stays.
- `play_animation` names the primitives that allow `tap`: the 7 old ones
  and the 7 reactions.
- So a reaction in `animations`, and a story motion in `play_animation`,
  fail in the schema. The model cannot write them in a strict mode.

Validation (implementation decision; the codes are settled in the issue):

- A primitive on a layer whose kind the table does not allow fails.
- `walk-in` on a character whose pose is not `walk` or `run` fails. A
  character that sits and moves across the ground looks wrong. `pip` has
  only the pose `front`, so `pip` cannot have `walk-in`.

### 2. Story motions

A story motion shows what the page text says. Models choose the motion;
code places it. No model output holds a distance, a direction, or a path.

| Primitive | Trigger | Kinds | What it shows | Parameters (bounded) |
| :-- | :-- | :-- | :-- | :-- |
| `walk-in` | `enter` | character, pose `walk` or `run` | The character walks from the side to its place. Steps of 130 units, a rise of 16 units and a lean of 3.4 degrees for each step, at 300 units for each second | none |
| `grow` | `enter` | scenery | The layer grows from its foot point, goes a little over its size (1.08 x 1.14), and settles. 1 s | delay 0 to 3 s |
| `drift` | `loop` | scenery | The layer moves slowly to one side and to the other, by up to 18% of the stage width | period 20 to 40 s |
| `fall` | `loop` | scenery | The layer and 7 copies of it fall from above their place to 520 units below it, and fade in and out. The copies are spread over the stage width and start at different times | period 2 to 4 s |
| `twinkle` | `loop` | scenery | The layer gets dim (opacity 1 to 0.45) and a little smaller (1.06 to 0.9), and comes back | period 2 to 6 s |
| `shine` | `loop` | scenery | The layer gets a little larger (1 to 1.12) and rocks by 5 degrees to each side | period 4 to 8 s |
| `doze` | `loop` | character | The character nods slowly: 3 degrees forward, a hold, then back | period 6 to 10 s |

- **Direction of `walk-in`.** The `walk` and `run` art of the 12 WebP
  characters faces right (checked on the 24 files of the registry). So a
  character comes from the left. A layer with `flip` faces left and comes
  from the right.
- **`flip`.** `flip` is a mirror on the asset element
  (`packages/scene-runtime/src/LayerView.tsx:152-156`), inside the wrappers
  that move. So for a layer with `flip`, every motion and reaction mirrors
  its travel to the side and its rotation. Without this rule a flipped
  walker leans back.
- **Start point of `walk-in`.** The whole layout box of the layer is
  outside the frame (decision 5, section 10). From the left that is a
  travel of `at.x` + 400 + the part of the box to the right of the foot
  point. From the right it is 1600 - `at.x` + 400 + the part of the box to
  the left of the foot point. The time is the travel at 300 units for each
  second: about 4 s for the slot at x 520 and about 6 s for the slot at
  x 1080 of `two-friends`. That is 1.4 s more than the mock showed.
- **Order of the walkers.** Code gives it; `walk-in` has no parameter. Of
  the walkers from one side, the one with the longest travel starts first,
  and each next one starts 1.4 s later. So two walkers are 420 units apart
  and do not cover each other. The four characters of `line-up` are in
  place after about 7 s.
- **Copies of `fall`.** The runtime makes the copies. They are not layers:
  the scene has one layer, the layout checks see one box, and a copy takes
  no tap. The places and the start times of the copies are fixed values in
  the code.
- **Travel of `drift`.** 18% of the stage width to each side, for every
  slot. A layer near the stage edge drifts over the bleed (section 10). In
  a 4:3 picture area the edge of the picture cuts it, as a cloud that
  leaves the picture.
- **Order of `grow`.** The `delay` parameter gives it. The prompt asks for
  different delays when a page has two or more.
- `shine` is the motion that the mock showed on the sun. The mock named it
  `twinkle`; it is a different motion, so it has its own name.

### 3. Tap reactions

A tap reaction is a primitive with the trigger `tap` only. It has no
parameters.

| Primitive | Kinds | What it shows | Time |
| :-- | :-- | :-- | :-- |
| `jump` | character | A crouch, a jump of 150 units with a stretch, a squash on landing, and one small hop | 1.1 s |
| `wiggle` | character | A rock from side to side, 8 degrees at first, less each time | 1.3 s |
| `look-around` | character | The character turns like a paper cut-out to face the other side, holds, and turns back | 1.7 s |
| `yawn` | character | A slow stretch up (0.96 x 1.1) with a lean of 3 degrees, a hold, and a release | 2.4 s |
| `shake` | prop, scenery | A rock from side to side, 5 degrees at first, less each time | 1.1 s |
| `squish` | prop, scenery | A squash (1.12 x 0.86) and a rebound | 0.8 s |
| `glow` | prop, scenery | The layer grows to 1.3, with a turn of 16 degrees, and settles | 1.2 s |

### 4. Paper bits, the bubble, and sound

- **A new tap action, `show_bits`.** `{ action: "show_bits", target, bits }`.
  `bits` is one of a closed list of 7 shapes that the runtime draws:
  `star`, `heart`, `note`, `leaf`, `petal`, `drop`, `z`. They are not
  registry assets, and a release has no file for them.
  - 10 bits fly out from the upper part of the layer and fade. A bit lives
    for 1.4 to 1.9 s. `star`, `heart`, `note`, and `petal` fly up in a fan.
    `leaf` and `drop` fall. `z` is 3 letters that rise slowly, for 2.6 s.
  - The bits are drawn in the stage overlay (ADR 0017, decision 16), so
    the clip of the stage does not cut them. They take no tap.
- **The bubble pops.** A bubble appears with a scale from 0.6 to 1.06 to 1
  and a fade, in 320 ms. This is a rule of the runtime, for every bubble.
- **Sound.** A tap plays a sound with the `play_sfx` action of today. The
  registry of the model-contract fixture has 8 `sfx` assets
  (`apps/storybook/test/model-contract/s2/s2-1/registry.json`). No new
  action is needed. The prompt asks for one (section 9).

### 5. A pose for the time of a reaction

`set_pose` gets a field, `revert`. With `revert: true`, the layer shows the
new pose for 1.7 s and then shows the pose that it had before the tap. With
`false`, or without the field, `set_pose` works as today: the new pose
stays.

- In a stored scene the field is an optional boolean. In the draft that
  the model writes it is a required boolean, as `flip` is
  (`packages/dsl/src/draft.ts:47`). The model JSON schema makes every key
  required (`packages/dsl/src/json-schema.ts:21-24`), so an optional
  `true` would be forced on every `set_pose`.
- A return that waits is dropped when a later action sets the pose of the
  layer, and when the page is no longer `current`.

- The pair rule of today applies to the new pose and to the return.
- A pose change keeps `at`. Two poses of one character have boxes of
  different sizes, so the new pose is drawn at the scale of the starting
  pose. The mock set the scale of each swap by hand (Kiki `sit` 1.98 to
  `front` 1.78). #85 (one scale per character) removes this fault. This
  field ships after #85.

### 6. Wrappers and the busy rule

- A layer gets a third wrapper, `tap`, inside `once`:
  `loop` > `once` > `tap` > asset. A `play_animation` action runs on `tap`,
  whatever its primitive. The part primitives `blink` and `wave` keep their
  part elements.
- So a tap during a `walk-in` does not replace the walk, and the two
  motions add up. The mock ran in this way.
- **Busy rule.** While the reaction of a layer runs, a tap on that layer
  shows its bubble again and runs no other action. This stops a pile of
  bits and sounds from fast taps. The busy time is the time of the reaction
  in the table of section 3, also when the reaction is not drawn (reduced
  motion).
- **Part primitives do not change.** A tap `blink` on a layer with a loop
  `blink` replaces the loop on the same part element, and the loop does not
  come back. This fault is in the code of today (`animator.ts:15-16`). The
  third wrapper does not repair it, and this record does not.

### 7. Before `enter`, reduced motion, still mode, slow images

One flag in the table, not a test for each primitive: `fade-in`, `walk-in`,
and `grow` **start away from rest**.

| State | A layer with such an `enter` motion |
| :-- | :-- |
| `incoming`, and the Start gate | Is not shown. This is the rule of `fade-in` of today, for all three (decision 6) |
| `current`, an asset of the page not settled | Is not shown. The `enter` gate is one gate for the page: every asset is loaded or has failed (`SceneView.tsx:415-432`). One slow image holds back every `enter` motion of the page |
| `current`, all assets settled | The motion runs once, after its delay |
| `outgoing` | A running `walk-in` or `grow` ends at once, and the layer is at rest. A reaction, its bits, and a waiting pose return are removed |
| Still mode | Shown at rest. No animation runs (ADR 0017) |

- **A layer that is not shown takes no tap and no focus.** Today a hidden
  `fade-in` layer of a `current` page takes both
  (`SceneView.tsx:547-548`, `LayerView.tsx:163-176`). This record closes
  that fault for all three motions.
- The gate is the gate of today. This record does not add a gate for each
  layer: the motions of a page then start together and in their order.

Reduced motion (`prefers-reduced-motion`):

| Part | With reduced motion |
| :-- | :-- |
| Loops, old and new | Off, as today |
| `walk-in`, `grow` | Do not run, and the layer is never hidden: it is shown at rest in every phase. So nothing appears with a jump on "Start" |
| `fade-in`, `bounce`, `pop` on `enter` | Run, as today. `startEnter` has no test for reduced motion (`SceneView.tsx:267-278`) |
| Tap reactions, bits, the bubble pop | Do not run. The busy rule holds |
| Bubble, sound, `set_expression`, `set_pose` without `revert` | Work, as today |
| `set_pose` with `revert` | The pose does not change |
| Breathing | Off |

### 8. Breathing

In play mode, each character layer has a slow change of scale on its `loop`
wrapper: 1 to 1.012 x 1.03 and back, about its foot point, with a period of
3.6 to 4.6 s that differs between the characters of a page. The runtime
adds it. It is not in the scene, and the model does not choose it.

- It is off in still mode, in edit mode, with reduced motion, and on an
  `outgoing` page.
- The global taste file rejects ambient motion. The owner saw the
  breathing in the mock and approved it. This record follows the approval.

### 9. Prompt

- The "Animations" block gets one line for each primitive: what it shows,
  its triggers, and the assets that it works on.
- New rule: for each thing that the page text says moves, the scene has one
  animation that shows that movement, when a primitive fits its kind and
  the template has a slot for it. A page can have several.
- Code does not check this rule. A template can have no slot for the thing
  (`circle-around-object` has no sky slot), a prop has no story motion, and
  `pip` cannot walk in. A scene that leaves a motion out passes validation.
  The model run of "Order of work" measures how often that happens.
- New rule: the tap of a character has a reaction, a `show_bits`, a
  `show_bubble`, and a `play_sfx`.
- The schema keeps `animations.min(1)` and every bound of today. A count
  that the text decides cannot be a schema bound.

### 10. Layers are cut at the frame, not at the stage

ADR 0016 section 1 says: "Layers are drawn in a separate container that
clips to the stage, so no layer shows in the bleed." Decision 5 changes
this sentence. The container of the layers
(`packages/scene-runtime/src/SceneView.tsx:669-680`) cuts its content at
the frame: 2400 x 1200 units, the stage and the bleed on each side. The
frame element has no clip today (`SceneView.tsx:601-612`); it gets one.

- The top and the bottom do not change: the frame and the stage have the
  same height.
- In a 4:3 picture area the picture shows the stage only, so nothing
  changes there. In a wider picture area, the part of a layer that is
  beside the stage is drawn over the bleed.
- The layout checks do not change. They let up to 10% of the box of a
  layer be outside the stage (`packages/layout/src/checks.ts:4`, `62-63`).
  So a layer at rest can have a part beside the stage. That part is drawn
  in a wide picture area, in every mode, also in a book that is live today.
- In a picture area wider than 2:1 the paper colour shows beyond the frame
  (`design.md` "5. Scene runtime"). A layer is cut at the frame there.
- The hit-area rule of ADR 0017, decision 10, does not change: a margin is
  cut at the stage edge. The drawn part of a tappable layer takes a tap
  where it is drawn, also beside the stage.
- The bubble stays inside the stage area (ADR 0017, decision 16).

## What the mock showed and the runtime cannot show as it is

| The mock | The runtime | Where it is settled |
| :-- | :-- | :-- |
| A stage of 4:3 only. A character walks in from outside the picture | A picture area wider than 4:3 shows bleed beside the stage (ADR 0016). The stage container cuts layers, so the character would appear at a hard line inside the picture | Decision 5, section 10: the cut moves to the frame |
| The replay starts with the motions. The page turn and the Start gate were not shown | During a turn and on the Start gate, a layer with `walk-in` or `grow` is not shown. Page 1 of the mock then shows the backdrop and the sun only | Decision 6: accepted as it is |
| Page 6 has two drifting clouds and the rain | `two-friends` has one sky slot. Only `big-sky` has three (`packages/layout/src/templates.ts:78-80`). A cloud and the rain need two | "Still open" |
| The bits of a tap on `stars` fall | `star` bits fly up. The direction comes from the shape, not from the layer | Section 4 |
| A swapped pose at a scale set by hand | The pose keeps `at` | Section 5, #85 |
| Sounds made in the page | `sfx` assets of the registry | Section 4 |

## Compatibility

- **Parsing does not change.** Every new field is optional, and every new
  primitive and action is a new member of a list. A stored revision and a
  published release pass the new schemas. No release file changes.
- **Every live book changes in six ways**, because the
  runtime is part of the app, not of a release:
  1. Each character breathes.
  2. A bubble pops.
  3. A tap animation runs on the `tap` wrapper. It looks the same, but for
     a tap during an `enter` animation: the two now add up.
  4. The busy rule: a second tap during a reaction shows the bubble only.
  5. In a picture area wider than 4:3, the part of a layer that is beside
     the stage is drawn, not cut (section 10). At rest that is up to 10%
     of the box of a layer near the stage edge. It is more during a `sway`
     or a `pop`, and after a `set_pose` to a wider pose.
  6. A hidden `fade-in` layer takes no tap and no focus before it shows.
- A live book gets story motions only when its scenes are generated again
  and a new release is published. That is an owner action.

## Reasons

- The measured book has the minimum that the prompt asks for, and the list
  has no primitive for the verbs of its text. Both halves must change: new
  motions without a prompt rule stay unused, and a prompt rule without new
  motions has nothing to choose.
- The list stays closed and each parameter stays bounded, so a scene from
  the model still cannot put a layer at a place that code did not check.
- One table for triggers and kinds removes two lists that can disagree, and
  the prompt is made from the same table.
- A separate `tap` wrapper makes a tap safe at any moment of a page, with
  no rule about which pairs of animations can run together.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Change the prompt only | Tried as the first step of the mock. "Walk" still shows as a hop, because no primitive moves a layer |
| Let the model give distances, directions, or keyframes | It breaks "models choose, code places" (ADR 0015). A wrong value puts a layer outside the stage, and no check sees it |
| Raise the bounds of `bounce` and `float` | A larger hop is not a walk. The owner saw version 1 of the mock, with small motions, and said that it was still too weak |
| Start each motion when the narration reads its sentence | It needs a time for each sentence of the narration. No such data exists. It can follow this record |
| A registry asset for each paper bit | 7 more approvals and files for shapes of one colour. A shape in the code costs no request |
| Tap reactions on the `once` wrapper | A tap during `walk-in` replaces the walk: the character jumps to its place |
| `walk-in` starts outside the stage, and the stage cuts it (the mock as it is) | In a picture area wider than 4:3 the character appears at a hard line inside the picture. The owner compared it and chose decision 5 |
| `walk-in` fades in over its first steps inside the stage | No line and no change to ADR 0016. It was the recommendation of the author. The owner compared it and chose decision 5 |
| `grow` only when the text says that a thing grows or appears | The page is not empty during a turn. The owner compared it and kept the look of the mock (decision 6) |

## Consequences

- `packages/dsl`: the table fields, 14 primitives, `show_bits`, `revert`,
  the validation rules. The scene JSON schema for the model grows: the
  animation union and the `play_animation` list have 14 members each, not 7.
- `packages/scene-runtime`: keyframes, the `tap` wrapper, the copies of
  `fall`, the bits, the bubble pop, the busy rule, breathing, and the cut
  of the layers at the frame.
- `design.md` "5. Scene runtime" and ADR 0016 section 1 say that no layer
  shows in the bleed. Both sentences change with this record.
- A page that has `grow` on its scenery and `walk-in` on its characters is
  nearly empty during a turn and on the Start gate, and the last character
  can be in place about 6 s after the turn. The owner saw both.
- `apps/storybook/worker/workflow/prompts.ts`: section 9.
- Frame time: `fall` animates 8 images, and a tap adds 10 elements for
  under 2 s. PLY-03.S3 is measured again on a rain page.

Order of work (each line is one issue, refined before code):

1. The table fields, the schemas by trigger, the "start away from rest"
   flag with the tap and focus rule, the cut at the frame, `walk-in`,
   `grow`, `jump`, and the prompt lines of these three.
2. `drift`, `fall`, `twinkle`, `shine`, `doze`, and their prompt lines. The
   frame time on the rain page.
3. The other 6 reactions, `show_bits`, the bubble pop, the busy rule.
4. Breathing.
5. `revert`, after #85.

The model run comes after issue 2, when every story motion exists. Issue 1
alone cannot show pages 6 and 7.

- Before the run, a person writes a table from the 7 page texts of this
  book: for each page, the motions that the text names and that a primitive
  and a slot of some template can show.
- The run uses the real model and the new prompt, once for each page.
- It passes when all 7 scenes pass validation, the scenes have 80% or more
  of the motions of the table, and each page with two or more motions in
  the table has two or more animations.
- If it fails, the prompt changes first. A new primitive needs a new
  record.

## Still open

Two items need an owner ruling before this record is accepted.

**1. A cloud and rain on one page.** Page 6 of the mock has two drifting
clouds and the rain. `two-friends` has one sky slot, and only `big-sky` has
three (`packages/layout/src/templates.ts:78-80`).

| Option | Result |
| :-- | :-- |
| A: no change | A page of most templates shows a cloud or the rain, not both. The `cloudy` backdrop paints its clouds, and they do not move |
| B: a second sky slot in each template | A page can show both. The template digest changes, so each backdrop needs a new owner approval, as in #127 |

Recommendation: A now, and look at B with #131, which changes the sky
slots. A costs nothing and loses one thing that the mock showed.

**2. A tap on a character that walks in.** The mock let a tap work during
the walk, and the two motions added up. In the runtime the bubble, the hit
margin, and the focus ring are drawn at the place of the layer
(`SceneView.tsx:549-570`), not where the walker is. The bubble of a tap
during the walk is then far from the character. The review found this.

| Option | Result |
| :-- | :-- |
| A: a layer takes no tap and no focus until its `enter` animations end | One rule. No third wrapper (section 6 keeps only the busy rule). A character does not answer for the 4 to 7 s of its walk. In a live book, a tap in the first 1 to 2 s of a page on a layer with an `enter` `bounce` or `pop` does nothing |
| B: as the mock | Section 6 as written. The bubble, the margin, the ring, and the bits must follow the moving layer: the runtime reads the place of the layer in each frame of the walk |

Recommendation: A. It removes the special case. B is more code for a few
seconds of each page.

## Not verified

- No model run was made with the new prompt. Whether the model picks story
  motions, and more than the minimum, is the acceptance of issue 1.
- The registry of production was not read. That it has active `sfx` assets
  is inferred from the fixture and from the 8 recipes in
  `tools/assets/src/sfx/recipes.ts`.
- Whether each model provider accepts a schema with 14 union members in
  its strict mode.
- How long a slow asset holds back the `enter` motions of a page on 4G,
  and whether the Player turns to a page before its assets are settled.
- The frame time of `fall`, of breathing, and of the bits on a device, with
  the paper texture over the picture (a `multiply` blend).
- Whether a walk of 6 s fits the narration of a short page. The longest
  travel of today's templates was not computed.
- Whether a control of the Player (ADR 0017) can sit over a layer that is
  drawn beside the stage. The controls are above the picture in the stack.
- The mock was checked in one desktop browser. The owner judged its look;
  no device was used.

## Review

One round, 2026-11-21, on the commit before this section. The Codex seat
had the correctness lens and the Gemini seat the boundaries lens. The
findings are merged as a union. Each was checked against the source by the
author.

| # | Finding | Seat | Check | Result |
| :-- | :-- | :-- | :-- | :-- |
| 1 | The "late image" row was wrong: the `enter` gate is one gate for the page | Both | True (`SceneView.tsx:415-432`) | Section 7 rewritten |
| 2 | With reduced motion, a hidden walker appears with a jump on "Start" | Gemini | True: `startEnter` has no reduced-motion test | Section 7: never hidden with reduced motion |
| 3 | A hidden layer of a `current` page takes a tap and the focus | Codex | True (`SceneView.tsx:547-548`) | Section 7: no tap, no focus |
| 4 | An optional `revert: true` becomes required in the model schema | Codex | True (`json-schema.ts:21-24`) | Section 5: a boolean, required in the draft |
| 5 | "A layer at rest is inside the stage" is false | Codex | True: the bounds check allows 10% | Section 10 and "Compatibility" corrected |
| 6 | The frame has no clip; removing the stage clip alone lets a layer reach the paper beyond 2:1 | Gemini | True (`SceneView.tsx:601-612`) | Section 10 |
| 7 | A walk goes on while the page turns | Gemini | True: the turn stops loops only | Section 7, row `outgoing` |
| 8 | `flip` is inside the wrappers, so a flipped walker leans back; no rule for a walk from the right | Gemini | True (`LayerView.tsx:152-156`) | Section 2: `flip` rule and the travel from the right |
| 9 | Two walkers with one delay cover each other | Gemini | True by the start point rule | Section 2: code gives the order; `walk-in` has no parameter |
| 10 | The bubble and the margin stay at the place of the layer during a walk | Gemini | True (`SceneView.tsx:549-570`) | "Still open", item 2 |
| 11 | All 21 primitives in `animations` and in `play_animation` lets wrong triggers through | Gemini | True for the schemas of today (`schemas.ts:27-37`, `51`) | Section 1: schemas by trigger, 14 members each |
| 12 | The prompt rule cannot always be met (no sky slot, props, `pip`), and a missing motion passes | Gemini | True; `pip` has only `front` | Section 9. The count "13 characters, 26 files" was wrong and is corrected |
| 13 | The acceptance of issue 1 cannot fail and needs the motions of issue 2 | Gemini; Codex said it does not prove the runtime | True | "Order of work": the run is after issue 2, with a pass rule |
| 14 | `grow` was in no issue | Codex | True | Issue 1 |
| 15 | No rule for a pose return at a page turn or after another action; no busy time with reduced motion | Gemini | True | Sections 5 and 6 |
| 16 | A tap `blink` stops a loop `blink` on the same part | Codex | True, and in the code of today | Recorded in section 6. Not repaired here |
| 17 | The baseline was `cf12fe8`; `origin/main` had moved | Codex | True. No cited file changed between the two commits | Rebased; the baseline is `2be0f2e` |

Not adopted:

- **A `revert` can leave an illegal pose and expression pair** (Gemini). The
  example is a `set_expression` to an expression that the starting pose
  does not have. Validation rejects that action today
  (`packages/dsl/src/validate.ts:206-211`).
- **Reactions that are close to `sway`, `pop`, and `bounce` could be
  parameters of those** (Gemini). The bounds of the old primitives are
  small on purpose, and the owner approved each reaction as a look
  (decision 2). The list stays.
- **The prompt file has had 5 rule patches; one more rule is the wrong
  tier** (Gemini). Code cannot know which things a text says move. The
  model run with a pass rule is the check.

No seat found a simpler form with the same result. Both said that a change
to the prompt alone cannot show a walk.
