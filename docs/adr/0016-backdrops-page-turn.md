# ADR 0016: Painted backdrops, narration below the stage, and a page-turn transition

- Status: Accepted
- Date: 2026-11-19
- Decided by: Jinyu Liu (owner)
- Amends: [ADR 0015](0015-storybook-mvp-reset.md) (not superseded)
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
  pipeline") keeps the floor band open across the whole stage. A review sheet
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

## Open questions

- Where the source paintings live: `assets/backdrops/` in git, like the Pip
  SVG, or R2, as `AGENTS.md` section 2 says for large binary files. Owner
  decision before the first painted backdrop.
- The list of painted backdrops for the MVP, and their palettes. Product
  content; owner decision.
- Indoor backdrops: which scenery and slots they allow. Not in the MVP.
- What the last page does on "next" (an end page, or back to the shelf).
  Product behaviour; owner decision.
- Narration audio is WAV when the provider returns raw PCM (design "1. Model
  adapter"). About 15 s of 24 kHz 16-bit mono audio is about 700 KB, which
  competes with the backdrop for the 2 s 4G budget. A compressed format is a
  separate decision.
- The root `DESIGN.md` describes the earlier Lullabyte front end (for example
  a 0.55 s page turn). Where it disagrees with this record and the spec, the
  spec wins; `DESIGN.md` needs its own update.
