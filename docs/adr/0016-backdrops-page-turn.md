# ADR 0016: Painted backdrops, narration below the stage, and a page-turn transition

- Status: Accepted
- Date: 2026-11-19
- Decided by: Jinyu Liu (owner)
- Amends: [ADR 0015](0015-storybook-mvp-reset.md) (not superseded)
- Amended: 2026-11-19 by [ADR 0017](0017-shelf-home-player-states.md). The
  Home rule of decision B changed, and five items left "Still open" (#70).
- Spec: [`design.md`](../specs/storybook-mvp/design.md) "4. Layout engine",
  "5. Scene runtime", "8. Asset pipeline", "Data Models"
- Issue: #59

## Context

The owner reviewed UI mocks of the Player on 2026-11-19. The reference look is
a full-frame picture book: each page is one painted picture with the text
below it on paper, and pages turn like paper.

The design of ADR 0015 cannot give that look:

- A page background is one of 4 sky palettes (`SKY_PALETTES` in
  `packages/dsl/src/primitives.ts:49`, `PageScene.sky` in
  `packages/dsl/src/schemas.ts:76`). Everything else is a cut-out layer in a
  slot. The mock built from cut-outs alone looked like stickers on hills.
- In landscape, the narration is beside the stage (design "4. Layout engine",
  PLY-02.S4). The approved mock has it below the stage.
- A page turn is a tap with no defined transition.

No deployed environment exists yet: `apps/storybook/wrangler.jsonc:13` has no
`database_id` ("local runs provision the database automatically"), so no
deploy can bind a remote D1. Local databases are disposable. A scene that has
no `backdrop` (for example from a local database made before this change)
fails validation like any other invalid scene; nothing fills it in.

## Decision

Owner decisions (2026-11-19):

1. Scenes get painted backdrops.
2. In landscape, the narration is below the stage, as in portrait.
3. A page turn shows a page-turn transition.

The rules below implement them. They are proposals of the author, accepted
with this record.

### 1. Backdrop: a new registry asset kind

- `asset.kind` gets the value `backdrop`. A backdrop is a painted full-frame
  background with no characters and no text, for example `meadow`,
  `riverbank`, `village-street`.
- MVP backdrops are outdoor scenes only. The scenery assets and the `sky-*`
  slots are outdoor objects (sun, clouds, trees, houses); an indoor backdrop
  needs a separate decision about which of them may appear.
- A backdrop is not a layer. `PageScene` gets a required field
  `backdrop: string` (an asset key). The model picks it from an enum built from
  the frozen registry, the same as `ref` and `templateId`.
- `PageScene.sky` stays. It picks the variant of the backdrop: one file per
  sky palette. A backdrop lists the palettes that it has. The pair
  (`backdrop`, `sky`) must be one of them; otherwise validation fails with
  `backdrop_sky_mismatch`.
- One backdrop file is 2400 x 1200 stage units: the 1600 x 1200 stage in the
  middle and 400 units of bleed on each side. Layers are drawn in a separate
  container that clips to the stage, so no layer shows in the bleed. The
  layout checks do not change.
- Every backdrop fits every template. The art contract (design "8. Asset
  pipeline") keeps the ground band open across the whole stage. A review sheet
  draws the slot envelopes of all templates (computed from the real assets)
  over each variant. A person approves it, and publish checks the approval.
- Scope limit: characters stand in front of the painting. A character cannot
  sit at a painted table or stand behind a painted object. The full-frame
  look comes from the painting around and behind the cast.
- Scenery slots stay. A scenery layer is drawn over the backdrop.
- The first slice needs no new art: the asset pipeline makes one backdrop,
  `meadow`, in code (sky colour and three hills as SVG), with all 4 palettes.
  It is a real registry asset that a scene names, not a default. The painted
  backdrops follow as new assets when the Producer delivers them.
- `meadow` alone cannot prove the design. The S2 premise test of backdrop
  choice and the device tests (4G load, frame time during a turn) need at
  least 3 backdrops, at least 2 of them painted WebP files at full size, and
  at least 1 with only some of the palettes.
- A backdrop is an asset version like any other. A `scene` revision records
  it in `asset_versions`, and publish copies it into the release.

### 2. Narration below the stage

In portrait and in landscape, the narration is HTML below the stage. In a
container wider than 4:3, the backdrop bleed fills the extra width.

### 3. Page turn

A page turn is a paper page-turn transition of 500 ms, made with transforms
and opacity only. The narration starts in the tap handler, before the
transition ends. Reduced motion gives a 200 ms cross-fade. The rules are in
design "5. Scene runtime". If the device test measures a frame time p95 above
33 ms during the turn, the owner decides between the cross-fade for all
devices and a lighter turn.

## Reasons

- A closed list of backdrops keeps rule 1 of ADR 0015: the model chooses,
  code places. The model never draws.
- A required field with a code-made `meadow` backdrop avoids a fallback path.
  Every scene names its backdrop; nothing is filled in silently.
- One art contract for all templates avoids a backdrop-template compatibility
  table (8 templates x N backdrops) and a new validation rule.
- `sky` as the variant selector reuses a field that the model already fills.
- The bleed lets one file fill tablet and phone screens without a second
  layout.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Keep sky palettes and add more cut-out scenery | Tried in the mock on 2026-11-19. Still reads as stickers; the owner rejected it. |
| Backdrop as a scenery layer in a slot | A full-frame image is not a slot object: it has no foot point, it must be below every layer, and the face and overlap checks do not apply to it. |
| Template owns its backdrop (`two-friends-meadow`) | 8 templates x N backdrops; a new backdrop needs new templates. |
| Per-backdrop list of legal templates | A second compatibility rule that the model can break; the art contract avoids it. |
| A painted picture per page, generated by an image model | A model would draw. ADR 0015 rule 1 forbids it, and it breaks release reproducibility and character consistency. |
| Narration beside the stage in landscape | Rejected by the owner (2026-11-19). |

## Consequences

- `packages/dsl`: `AssetKind`, the manifest union, `PageScene.backdrop`, the
  JSON schema builder, and the `backdrop_sky_mismatch` check.
- `packages/scene-runtime`: the backdrop frame with bleed, a stage container
  that clips layers, the paper colour instead of the sky colour behind an
  unloaded backdrop, an explicit page phase for `enter` animations, and the
  page-turn transition in the Player.
- `tools/assets`: the code-made `meadow` backdrop, a backdrop build step, and
  the review sheet.
- Studio: a backdrop picker in the page editor.
- The Producer needs to paint backdrops (a new board type). Until then, every
  scene uses `meadow`.
- The 4G load budget of a page now includes one backdrop file. A file
  budget is set in design "8. Asset pipeline" and checked by the device test.

## Decisions (2026-11-19)

The owner accepted the agent recommendations for the questions that are not
UI (D and E), and delegated the UI and design questions (A to C) to a Fable
5.2 design pass. The look that follows is in the root `DESIGN.md`.

**A. Backdrops for the MVP.** Three backdrops; the Producer paints 6
variants.

| Key | Made by | Palettes | Description for the model |
| :-- | :-- | :-- | :-- |
| `meadow` | Code (SVG) | `day`, `cloudy`, `dusk`, `night` | "an open meadow with soft hills" |
| `riverbank` | Painted (WebP) | `day`, `dusk`, `night` | "a grassy bank by a wide, slow river" |
| `village-square` | Painted (WebP) | `day`, `dusk`, `night` | "an open village square with small houses far behind" |

- Reason: the smallest list that meets the S2 rule (3 backdrops, 2 painted,
  1 with only some palettes). It gives one open place, one nature place, and
  one built place.
- No painted `cloudy`: each sample story has night pages, and with no indoor
  backdrop they are outdoor night pages, so `night` and `dusk` come first.
  A page that needs `cloudy` uses `meadow`.
- A painted sky is clear: no sun, moon, stars, or outlined clouds. Those are
  scenery layers in the `sky-*` slots and would show twice.
- The dominant sky colour of a painted variant is the sky colour of its
  palette; soft gradients are allowed.
- A new backdrop joins the list only on evidence (S2 results or operator
  notes that show stories that cannot be placed).

**B. "Next" on the last page** turns to an end page. The Player makes it; it
is not part of a release (no page JSON, no audio). Its picture is the
backdrop of the last page in its sky, without layers. It shows "The end", a
"Read again" button, "previous", and Home.

| Event | Result |
| :-- | :-- |
| "Next" on the last page | The narration stops; no new `src`. The usual turn (500 ms, or the 200 ms cross-fade) shows the end page. No "next" and no progress pill on the end page |
| "Previous" on the end page or during the turn to it | The turn back to the last page; its `src` is set and `play()` is called in the tap handler |
| "Read again" | The `src` of page 1 is set and `play()` is called in the tap handler. Page 1 replaces the end page with a 200 ms cross-fade. The Start gate is not shown again |

- The end page has the Home round button. The shelf is in the spec since
  [ADR 0017](0017-shelf-home-player-states.md): every Player screen of a
  book has exactly one Home control, and it goes to the shelf (ADR 0017,
  decision 8). The earlier text gave the end page a Home button "only when
  the shelf exists".
- Reason: a book needs an end a child can see; a jump away looks like a
  fault, and the child who wants the story again does not have to find it.

**C. Other UI choices** are in `DESIGN.md`: one typeface (Baloo 2, bundled),
one light theme, hard edges as the only shadow, a two-ring focus ring, a
narration panel of one height for every page of a book, 44 px Studio
targets, and a sky picker that shows only the palettes of the chosen
backdrop. Cut-outs keep their own colours in every sky (no night filter).

**D. Source paintings live in R2**, as `AGENTS.md` section 2 says for large
binary files. Git holds a source list with the SHA-256 digest of each source
painting; the asset pipeline downloads the sources to a cache that git does
not track and checks them against that list. The approval record is a
separate list: it holds the digests of the built WebP variants that the
person reviewed, and publish checks those.

**E. Narration audio is compressed.** The target format is MP3, mono. A spike
measures the encoding cost in the Worker against the current Workers limits
page and checks playback in Safari on iPad and iPhone before the audio step
changes. If the spike fails, the owner picks another format. Until then the
WAV rule of design "1. Model adapter" holds.

**F. `DESIGN.md`** is rewritten for the approved boards (issue #61). Where
it and this record or the spec disagree, the spec wins.

## Still open

- The `clouds` cut-out is warm cream; its contrast on the `dusk` sky is not
  checked.
- Indoor backdrops: 36 of the 60 page settings of the sample stories (3
  stories, 2 age scripts each) are indoor (`bedroom`, `office`,
  `classroom`; counted 2026-11-19 from `setting.place`). Not in the MVP;
  S2 records how often a news story cannot be told outdoors.
  [ADR 0017](0017-shelf-home-player-states.md) keeps them out.

Settled by [ADR 0017](0017-shelf-home-player-states.md) (2026-11-19, #70):

| Item | Result | ADR 0017 |
| :-- | :-- | :-- |
| The shelf | In the spec: the route `/` and the public `GET /api/shelf` | Decisions 1 to 7 |
| The "resting" state | Defined: its triggers, what it shows, and Home | Decision 9 |
| A minimum hit area for a tappable layer | 64 x 64 CSS px or more, cut at the stage edge, with one hit layer for the margins | Decision 10 |
| A night tint for cut-outs | Rejected for the MVP. Decision C stays | Decision 11 |
| A moon asset | Not needed in the MVP | Decision 12 |
