# ADR 0017: The shelf, the Home control, and the remaining Player rules

- Status: Accepted
- Date: 2026-11-19
- Decided by: Jinyu Liu (owner). The owner put the shelf into the spec,
  accepted the planning recommendations (shelf data, cover, home route), and
  delegated the UI and design choices to a Fable 5.2 design pass (#70).
- Reviewed: 2026-11-19, by two models of other families (Codex, Gemini).
  The owner ruled on the findings, and this text holds the result. The
  rulings changed decision 10, the book geometry, the cover crop, and the
  Resting triggers, and they removed the cover fallback.
- Amends: [ADR 0016](0016-backdrops-page-turn.md) (decision B, and five items
  of "Still open"). ADR 0015 is not superseded.
- Spec: [`design.md`](../specs/storybook-mvp/design.md) "Deployment",
  "5. Scene runtime", "6. API", "7. Publish", "9. Player screens",
  "Data Models"
- Look: root `DESIGN.md`, sections 12 to 16
- Issue: #70

## Context

The approved UI boards show a shelf of books. The spec had none.

- The Player has one route, `/read/:releaseId`
  (`apps/storybook/src/player/routes.tsx:7`). A child needs a link from an
  adult to reach a book.
- No list of releases is public. The only list is `GET /api/studio/stories`,
  behind Access (`apps/storybook/worker/api/app.ts:195`).
- The Worker runs first for `/api`, `/api/*`, `/content`, `/content/*`, and
  `/health`. Every other path is a static asset with the SPA fallback
  (`apps/storybook/wrangler.jsonc:10-11`).
- A `release` row has `id`, `story_id`, `number`, `manifest_key`, `snapshot`,
  and `created_at` (`apps/storybook/worker/db/schema.ts:163`). It has no
  title. `story.title` is nullable and is written by the `script` step
  (`schema.ts:81`, `apps/storybook/worker/workflow/steps/script.ts:151`).
  The manifest title comes from the outline head of the publish snapshot
  (`apps/storybook/worker/publish/publish.ts:190`). Both values come from
  the same script output (`script.ts:128`, `:151`), and no route changes an
  outline today, so they are equal today. No spec rule keeps them equal:
  `story.title` is a column of the draft that an update can change, and a
  release never changes.
- Each release has its own copies of its assets (design "7. Publish",
  step 4). Two books share no file URL, so they share no browser cache.
- Registry assets are served only inside a release, or to the Studio behind
  Access. The only tracked art source is `assets/pip/v2/pip.svg`.
- ADR 0016 left these items open
  (`docs/adr/0016-backdrops-page-turn.md:202-217` at commit `0fc6fda`): the
  shelf, the resting state, the hit area of a tappable layer, a night tint,
  and a moon. Its decision B gives a Home control only "when the shelf
  exists" (`:174` at that commit).
- `DESIGN.md` marks the shelf (section 12.1), the resting state (12.2), and
  the hit area (12.3) as proposals. Its open item 9 is the progress pill
  that lies over the stage in the Wide layout.
- The approved shelf board (HTML mock, not in the repository) shows a wooden
  shelf with 2 boards of 3 books, face out. A cover is a small scene with a
  paper title label, in an upright window of 151 x 208 px on a book of
  180 x 224 px. The board places
  each cover scene by hand and puts a CSS `filter` on its art. It also has
  registry art on the ground and characters beside the shelf.
- The Worker answers an error with 500 `{ error: "internal" }`, and an
  unknown route with 404 `{ error: "not_found" }`
  (`apps/storybook/worker/api/app.ts:501-508`).

## Decision

Owner decisions (2026-11-19):

1. The shelf goes into the spec before any Home control is built.
2. `GET /api/shelf` is public and read-only. For each story it returns only
   the latest release: `releaseId`, `title`, and the publish time.
3. A cover is the page 1 scene of the release, as a still picture. No new
   asset. The shelf is checked against the 4G load target.
4. The shelf is the home route of the Player.

The design pass made the choices below. They are accepted with this record.
A decision number in another document is a number of this table.

| # | Question | Decision | Reason |
| :-- | :-- | :-- | :-- |
| 1 | Path of the shelf | `/`. A book stays at `/read/:releaseId` | The root is what a parent types or bookmarks. No existing link changes, and the Worker configuration does not change |
| 2 | Title of a book | A new column `release.title`, written by publish. The shelf reads no draft column | A release never changes, and `story.title` is a draft column that is nullable and can change. A copy on the release row is written with the release, is never null, and cannot differ from its manifest. Cost: one migration, one value in the publish batch, one scenario (PUB-01.S11) |
| 3 | Order of books | Newest story first, by the time of the first release of the story. Equal times: descending story ID. A new release of a story keeps the place of its book | A child finds a book where it was. A correction of an old book is not a new book |
| 4 | More books than fit | Shelf pages with "previous" and "next" round buttons. Nothing scrolls. No cap on the number of books | Paging limits the covers that load at one time, and it uses the two arrows a child knows from a book. A cap would hide a published book without a sign |
| 5 | Empty shelf | The shelf without books and one quiet line. No control | An empty shelf is a true picture, not a fault |
| 6 | The shelf request fails | The shelf without books, a quiet line, and one "Look again" button | A person can try again without the reload control of the browser. No failure wording |
| 7 | How covers load | Only the covers of the shelf page that is shown, and only the files of the picture. A book shows at once with its title and a Paper picture window. The picture fades in when its files are loaded. A cover that fails keeps the Paper window. The load check is a gate before the shelf goes public | A child can open a book before its picture arrives. No red and no fault sign. The cost of six covers is not measured yet |
| 8 | Home | Every Player screen of a book has exactly one Home control. The shelf has none | One way back from every screen. The frame stays at 3 controls |
| 9 | Resting state | Shown when a release does not exist, or when the manifest, a page JSON, or a first-page file fails before "Start". A night picture from the app bundle, "This book is sleeping. Come back soon.", and a Home button | A fault shows as a quiet state with one way out. The picture needs no request, so it shows with no network |
| 10 | Hit area of a tappable layer | At least 64 x 64 CSS px in play mode, cut at the stage edge and never moved. The margins are in one hit layer below every drawn layer, so a drawn box wins over every margin | The child target rule also holds for a small cut-out on a phone. A cut is one rule for every box, also for a box that is wider than the stage |
| 11 | Night tint for cut-outs | Rejected for the MVP | No way keeps the page-turn rule without a second set of asset files |
| 12 | Moon | No moon asset in the MVP | `stars` and the `night` palette already say night. The scenery boards have no moon asset |
| 13 | Progress pill in the Wide layout | Moved off the picture: the count only, at the top of the right gutter | On a 900 px wide viewport the pill covers a part of a `sky-1` object: up to 41 % of its width at 900 x 600, and its whole width at 900 x 827 (arithmetic, below). Now no frame part lies over the picture in any layout |
| 14 | Indoor backdrops | Stay out of the MVP | ADR 0016; no new evidence |
| 15 | The picture of page 1 at "Start" | Behind the Start gate, page 1 is `incoming`: its loops run, no `enter` animation runs, and no layer takes a tap. "Start" makes it `current`, and its `enter` animations play once | It is the phase rule of the spec with no exception for page 1. The child sees an answer to the tap (#68) |
| 16 | Where a bubble and a focus ring are drawn | In one overlay above the stage, which the clip of the stage does not cut. The bubble is in stage units and stays inside the stage area. The ring is in CSS px | The stage container clips its content (`packages/scene-runtime/src/SceneView.tsx:311`), so a bubble or a ring at the stage edge was cut. A 3 px ring inside the scaled stage is under 1 px on a phone (#68) |

### Routes (decision 1)

| Path | Screen | Access |
| :-- | :-- | :-- |
| `/` | The shelf (Player home) | Public |
| `/read/:releaseId` | One book: Start gate, reading page, end page, or Resting | Public |
| `/api/shelf` | Shelf data | Public, `GET` only |

`/` is already a static asset path, and `/api/*` already runs the Worker
first. `/api/shelf` is not under `/api/studio/*`, so Access does not cover
it.

### Shelf data (decisions 2 and 3)

`GET /api/shelf` takes no parameter and no body. It answers 200 with:

```json
{
  "books": [
    {
      "releaseId": "019346a2-7c1e-7b3a-9f4e-2a6d5c8b1e07",
      "title": "The Robot by the Pond",
      "publishedAt": "2026-11-19T08:30:00.000Z"
    }
  ]
}
```

- One entry for each story whose `published_release_id` names a `release`
  row of that story. The entry is that release. The pointer moves only to a
  higher release number (design "7. Publish"), so that release is the
  latest.
- The pointer has no foreign key
  (`apps/storybook/worker/db/schema.ts:84`). If it names no `release` row,
  or a release of another story, the story has no entry. The route writes
  one log line with the story ID, the release ID, and the reason, and no
  title. The other books are returned. The route never reads a draft value
  and never picks another release.
- `title` is `release.title`. `publishedAt` is `release.created_at`.
- An entry has these three fields only. No story ID, no revision ID, no run,
  no head, no status, and nothing of a story that has no release.
- Order: by the first release time of the story, newest first. That time
  is the least `created_at` of the `release` rows of the story (an
  aggregate on `release`; no new column). `created_at` is ISO 8601 UTC
  text of one fixed form, so its text order is its time order. Equal times
  are in descending story ID order, so the order is stable.
- The response holds every book. There is no server paging and no cap.
- An empty shelf is `{ "books": [] }` with 200.
- A failure of the database gives 500 `{ "error": "internal" }`, as every
  route of the Worker does.
- Caching (implementation decision): `Cache-Control: no-store`. Each shelf
  view is one D1 query. A new book shows on the next load. The Worker does
  not cache the response.

**New column.** `release.title` (text, not null) holds the `title` of the
manifest. Publish writes it in the batch that inserts the `release` row.
No deployed database exists (`apps/storybook/wrangler.jsonc:13`), so no
stored row needs a value; local databases are disposable (ADR 0016,
"Context").

### Cover (decision 7)

- A cover is the scene of the first page of the release, drawn by
  `packages/scene-runtime` in a new `still` mode: the backdrop variant and
  the layers at their `at`, with no animation, no tap handling, and no
  focus.
- The Player reads `manifest.json`, then the page JSON of the first page,
  then the files of the picture: the backdrop variant, and the file of the
  starting pose and expression of each layer. Still mode loads nothing
  else: no swap file of a tap, no `sfx` file, no audio file, and no other
  page. Play mode loads the swap files ahead
  (`packages/scene-runtime/src/SceneView.tsx:238`); a cover does not need
  them.
- All of them come through the content route, so the browser caches them as
  immutable files. To open the book then needs no second download of them.
- Caching of covers (implementation decision): no rule beyond the content
  route. The Player keeps a loaded cover in memory while the shelf is open.
- A cover has no filter and no hand-placed art. That differs from the
  board (`DESIGN.md` section 16, "Differences").

**Book and window.** The board has a book of 180 x 224 px with a picture
window of 151 x 208 px. That leaves 16 px of the height. A title plate for
2 lines of 18 px text is 54 px high with its edge, so it does not fit
beside that window, and `DESIGN.md` allows no text over a picture except a
bubble. The plate stands above the window, and the window is lower:

| Part of a 180 x 224 px book, from the top | Height |
| :-- | --: |
| Cloth | 8 px |
| Title plate: 6 px, 2 lines of 18 px / 1.1 (40 px), 6 px | 52 px |
| Hard edge of the plate | 2 px |
| Cloth | 6 px |
| Picture window, 151 px wide | 148 px |
| Cloth | 8 px |
| Sum | 224 px |

The title stays 18 px on a smaller book. So the plate and its edge keep
54 px, and the cloth parts scale. With a book width `b` and `s = b / 180`,
the window is `151 s` wide and `202 s - 54` high.

**Crop.** `SceneView` gets a `fit` prop (design "5. Scene runtime"). A page
uses `contain`, and a cover uses `cover`: the frame covers the window, and
the window cuts the rest. The window of a 180 px book is 151 x 148 px, so
1224 of the 1600 stage units show: stage x 188 to 1412 (arithmetic:
151 / 148 x 1200). A smaller book has a wider window and shows more, so
this is the tightest case. The foot points come from
`packages/layout/src/templates.ts`:

| Slots, all 8 templates | Foot x | Foot to the cut |
| :-- | :-- | :-- |
| Character | 250 to 1350 | 62 units or more inside. `pos-1` and `pos-4` of `line-up` (250, 1350): 62. `left` and `right` of `circle-around-object` (360, 1240): 172. `left` and `right` of `three-friends` (380, 1220) and `friend` of `big-sky` (1220): 192. `hero` of `landscape` (420): 232 |
| Prop | 360 to 1350 | 62 or more inside. `prop-front` of `landscape` (1350): 62 |
| Scenery | 180 to 1370 | `side` of `landscape` (180) is 8 units outside. Every other foot is 42 or more inside |

A template gives a foot point only. The width of a figure comes from its
asset, so a figure in an outer slot can lose the part of its box beyond
x 188 or x 1412. This is accepted: a cover shows the book, and the page
shows the whole scene. The rule "the stage is never cropped" stays for the
picture area of a page.

The first text of this record kept the 151 x 208 px window. It showed
stage x 364 to 1236. The feet of 4 character slots were outside (`line-up`
and `circle-around-object`), and 3 more were 16 units inside
(`three-friends`, `big-sky`). The lower window is the reason for the wider
crop; no rule was added for it.

**Shelf load check (a gate).** A device test measures the shelf before the
shelf goes public, on the 4G profile of the page load test:

| Part | Value |
| :-- | :-- |
| Fixture | 6 books, each a different release. Page 1 of each uses a painted backdrop at full size |
| Viewports | The Wide layout with a shelf page of 6 drawn covers. A real phone in portrait and in landscape, each with the shelf page of its own layout |
| Cache | Empty |
| Start | The browser sends `GET /api/shelf` |
| End | The last cover of the first shelf page is drawn |
| Pass | 2 s or less in each viewport. On the phone, the browser does not reload the tab while the shelf shows its covers |
| Record | For each viewport: the time, the number of requests, and the bytes |

If the check fails, the shelf does not go public, and the cover method is
a new decision ("Still open"). This record defines no fallback, and
nothing is built for one. The shelf response keeps its three fields.

Arithmetic from the review, not measured, for the first Wide shelf page:

| Cost | Estimate |
| :-- | :-- |
| Request rounds, one after the other | 4: the shelf, 6 manifests, 6 page JSON files, then the picture files |
| Bytes | Up to 1.5 MB for 6 backdrop variants at the starting budget of 250 KB, plus the cut-outs: about 1.8 MB (review estimate) |
| Decoded backdrops | 2400 x 1200 px x 4 bytes is 11 MiB for one, and about 66 MiB for 6. This is the reason for the phone check |

A book page loads one backdrop.

### The shelf screen (decisions 4 to 6)

- A shelf page is the set of books that show at one time. In the Wide
  layout it holds 6 books: 2 boards of 3, as on the approved board. The
  counts for the Narrow and the Short layout are starting values in
  `DESIGN.md` section 12.1 (4 or 2, and 3). That section is the only place
  that defines them.
- The Player draws the ground of the shelf and the shelf itself (inline
  SVG and CSS). The shelf uses no registry file outside the covers,
  because a registry file is served only inside a release.
- With more books than one shelf page, the shelf shows a "previous" and a
  "next" round button. "Previous" is disabled on the first shelf page and
  "next" on the last. With one shelf page, neither is shown.
- A change of shelf page is a 200 ms cross-fade of the books. The shelf
  never scrolls.
- The shelf always opens on its first shelf page.
- In the Wide layout the name and a shelf page of 2 boards of 3 books fit
  the smallest Wide viewport, 900 x 600, and nothing scrolls. A book is
  180 x 224 px where the height allows it (`h` >= 612). Below that it is
  smaller with the same ratio: 175 x 218 px at `h` = 600. A book is never
  narrower than 128 px. The arithmetic is in `DESIGN.md` section 12.1; it
  is not measured in a browser.
- A book is a link to `/read/:releaseId`. The whole book is the target.
- Until the response arrives, the shelf shows no book and three waiting
  dots.
- The waiting, the empty, and the failed state draw the same shelf as the
  books state of the layout, with the same number of boards. So the shelf
  does not change its size when the books arrive.
- The shelf starts in the waiting state every time. So the focus goes to
  the shelf itself (`main`, `tabindex="-1"`) when the shelf is shown, and
  it does not move when the books arrive.
- The shelf has no Home control, no link out of the product, and no text
  that is the only way to move.

### Home (decision 8)

- The Start gate (Loading and Ready), the reading page, and the end page
  have the Home round button in the frame. The Resting state has a Home
  button with a label in the panel, and no round button.
- A tap on Home stops the narration and any sound effect, and shows the
  shelf at `/`. There is no question and no overlay.
- Home works during a page turn. The frame controls are above the page
  sheets in the stacking order: the page panel is a stacking context of
  its own, so a sheet that turns over the left gutter never covers Home.
- The Player keeps no reading position. A book that is opened again shows
  its Start gate.

### Resting (decision 9)

The Player shows the Resting state at `/read/:releaseId` when one of these
is true:

| Trigger | Detail |
| :-- | :-- |
| The release does not exist | `releaseId` is not a lower-case UUID version 7, or the request for `manifest.json` gives 404 |
| A request fails before "Start" | A request for the manifest, a page JSON, or a first-page file ends with a network error or a status that is not 2xx |
| A file cannot be used before "Start" | The manifest or a page JSON does not pass the release schema. Or a first-page file cannot be decoded (WebP), cannot be parsed, or does not pass the sanitiser (SVG). The status of the response can be 200 (`packages/scene-runtime/src/LayerView.tsx:101`, `:196`) |

- The first-page files are the backdrop variant of page 1, the file of the
  starting pose and expression of each layer of page 1, and the paper
  texture. The paper texture is a file of the app (implementation
  decision; the spec named no source for it).
- "Start" does not wait for a narration audio file. iOS Safari loads no
  audio before a user gesture, so that wait would not end, and Resting has
  no timer.
- It shows the Player frame, a night picture that is part of the app
  bundle, the line "This book is sleeping. Come back soon.", and a Home
  button. It has no "Start", "previous", "next", or progress pill, and no
  sound.
- The picture is not a registry asset. The Player draws it (inline SVG:
  the `night` sky colour, hills, and star shapes). It needs no request.
- There is no timer. A slow load stays in Loading, where Home is present.
- There is no automatic retry. The address does not change, so a reload
  tries again.
- After "Start", the Player never changes to Resting. An image that does
  not load follows the "Late images" rule: the narration and the paper
  colour show.
- A narration that cannot be loaded or played after "Start" changes
  nothing on the page: the picture, the text, and the controls stay. The
  Player plays no sound for that page, shows no fault sign, and does not
  try again by itself. A turn away and back sets the `src` again.
- The second audio element for `play_sfx` is not changed here. Its unlock
  problem stays open for #22 (design "Review record").

### Hit area of a tappable layer (decision 10)

In play mode, on the current page, a layer that has a tap interaction has
a hit area:

- The drawn box is the layout box of the layer, cut at the stage edge. A
  layout box can be larger than the stage: the bounds check lets a box go
  outside by up to 10 %, so a prop of 1700 units is legal.
- On an axis where the drawn box is less than 64 CSS px on the screen, the
  hit area is 64 CSS px, centred on the drawn box. The part beyond the box
  is the margin.
- The hit area is cut at the stage edge. It is never moved. A small layer
  at the stage edge has a hit area under 64 CSS px on that axis: a 30 px
  box that touches the edge gets 47 px.
- The margins are in one hit layer below every drawn layer. Each tappable
  layer has one element there, with the box of its hit area and the `z` of
  its layer.
- So a point inside the drawn box of one or more tappable layers belongs to
  the one with the highest `z`, and no margin wins there.
- A point that is in no such box, and inside one or more margins, belongs to
  the layer with the highest `z` among them.
- A layer without a tap interaction takes no tap and blocks none
  (`packages/scene-runtime/src/LayerView.tsx:150` does this today).
- A margin element is for a pointer only. The keyboard focus and a screen
  reader use the layer element.
- The size is in CSS px, so it is computed from the stage scale and again
  after a resize.
- It is a rule of the runtime only. It adds no validation rule and no DSL
  field, and the layout engine does not change. Edit mode and still mode
  have no hit layer.

Why a hit layer. Each layer element has its own `z-index`
(`LayerView.tsx:174-178`). A margin that is part of the layer element has
the `z` of that layer, so it lies over the drawn box of every lower layer.
The DOM cannot then give "a drawn box wins over a margin". With every
margin in one layer below the drawn layers, the stacking order gives both
rules, and no code tests a point.

With slot placement, the feet are at x 180 to 1370, and a cut is rare. A
manual `at` can put a small layer at the edge.

### Start gate and stage overlay (decisions 15 and 16)

Both come from the runtime refinement of #68.

- **Start gate.** In Ready, page 1 is drawn with `phase="incoming"`: its
  `loop` animations run, no `enter` animation runs, a layer with an
  `enter` `fade-in` is hidden, and no layer takes a tap or the focus. The
  tap on "Start" makes page 1 `current`. Its `enter` animations play once,
  and tap handling starts. The picture keeps its size and its place. The
  first text of `DESIGN.md` said "the picture does not change"; that is
  now true for its size only.
- **One panel height and one frame.** The text and the button of
  Loading, of Ready, and of Resting fit the narration panel in every
  layout. The panel of a book is never lower than they need: 232 px in
  Wide, 197 px in Narrow, and 112 px in Short (arithmetic in `DESIGN.md`
  section 12.2; starting values for Narrow and Short). The frame parts
  keep their place and their size in Loading, Ready, and Resting: the
  gutters of Wide, the top bar and the control row of Narrow, and the
  rails of Short. A part with no control is empty. So the picture has
  the same size before and after "Start".
- **Stage overlay.** One overlay lies above the stage container. It has
  the box of the stage, the clip of the stage does not cut it, and it
  takes no tap. A bubble is in it, in stage units, and is placed inside
  the stage area. The focus ring of a tappable layer is in it, in CSS px,
  and stays inside the stage area. The overlay turns with the page sheet.

### Night tint and moon (decisions 11 and 12)

- **No night tint.** Cut-outs keep their own colours in every sky (ADR 0016,
  decision C, stays). A CSS `filter` on a layer breaks the page-turn rule
  ("`transform` and `opacity` only, no filters"). One tint layer over the
  stage also darkens the painted night backdrop. To limit it to the
  cut-outs needs a mask for each layer or a blend mode; the frame cost of
  those during a page turn is not measured. Night versions of every asset
  file keep the rule, but they double the asset set and change the asset
  manifest.
- **No moon.** A night page shows `stars` on the `night` sky. A moon is a
  new Producer painting. The scenery boards have none; the moon on the
  night meadow of the UI board is part of that drawing, not an asset. If the Producer delivers one
  later, it is a new `scenery` asset for the `sky-*` slots and needs no
  spec change.

### Progress pill in the Wide layout (decision 13)

The pill moves to the top of the right gutter and shows the count only, the
form that the Short layout already has. The Narrow layout keeps the dots.

The pill is centred in the 96 px gutter, 44 px high and 26 px from the
top. Home is centred in the left gutter, 16 px from the top. At 900 x 600
Home is 40 px from "previous", and the pill is 50 px from "next". Both
are more than the 12 px that two child controls need (arithmetic in
`DESIGN.md` section 12.3).

Arithmetic, not measured in a browser. The pill with dots is about 179 px
(6 pages) to 207 px (8 pages) wide and stands 16 px from the left and the
top of the page panel.

| Viewport | Stage | Pill covers (stage units) | Of a `sky-1` object 200 units wide in `hero-and-object` |
| :-- | :-- | :-- | :-- |
| 1194 x 834 (board 3) | 771 x 578, starts 116 px from the panel edge | x 0 to 165-223, y 33 to 125 | At most its top left corner |
| 900 x 600 (smallest Wide) | 405 x 304, starts 151 px from the panel edge | x 0 to 172-282, y 63 to 237 | 0 % (6 pages) to 41 % (8 pages) of its width, over the top 68 % of its height |
| 900 x 827 (a picture area of 4:3) | 708 x 531, starts at the panel edge | x 36 to 441-504, y 36 to 136 | Its whole width, over the top 18 % of its height |

At 900 px wide the page panel is 708 px, the narration is 644 px wide, and
a 40-word page needs 6 lines. So the narration panel is 296 px, not the
256 px of board 3 (`DESIGN.md` section 12.3, "Wide"). The first text of
this record used 256 px at 900 x 600 and gave 22 % to 72 % of the width.
The right number is lower. The case for the move at 900 x 600 is weaker
than that text said; the rule "no frame part over the picture" does not
depend on it.

The slot is at foot (300, 300) with height 200
(`packages/layout/src/templates.ts:57`). The width of 200 units is an
assumed object. The board was drawn at one size, so the fault did not show
there. A count-only pill is about 77 px wide and fits the 96 px gutter.

## Reasons

- The shelf reads only `release` rows through the release pointer. A draft,
  a failed publish, and operator data cannot reach a child by construction
  (`AGENTS.md` section 5).
- The cover adds no asset and no publish step. A cover load is also the
  first part of the load of that book.
- Paging gives a fixed upper limit for the load of one shelf view: the
  covers of one shelf page.
- One Home control on each book screen, and none on the shelf, keeps every
  child screen at 3 controls or fewer.
- The Resting state and the two quiet shelf states need no request, so they
  show when the network is the fault.
- The hit area needs no hit testing in code. The drawn boxes keep the
  stacking order that they have today, and one hit layer below them
  holds every margin.
- The pill rule now has no exception: no frame part lies over the picture.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Shelf at `/shelf`, with `/` as a redirect | A second address for one screen, and a redirect on every visit |
| Title from `story.title` | Needs no migration, and the value is equal today. But it is a nullable draft column, and no spec rule keeps it equal to the title of a release. A later title edit would show on the shelf before it is published |
| Title from each `manifest.json` in R2 | One R2 read for each book on every shelf view |
| Order by the publish time of the latest release | A corrected old book jumps to the first place and looks new |
| A scrolling shelf | The covers that load are not limited, and the full-frame shelf scene of the board cannot stay in place |
| A cap on the number of books | An older published book drops off with no sign. The MVP makes one story for each click |
| Load the covers of the next shelf page ahead | Up to 1.5 MB more on 4G for a tap that may not come |
| A cover image at publish time from the start | A new asset and a new publish step before any measurement shows the need |
| Home only on the end page | A child who wants another book must finish this one first |
| Resting after a time limit in Loading | A slow network is not a fault, and Home is present in Loading |
| A hit area moved inside the stage, never cut | The first text of this record. A box can be wider than the stage (a legal prop of 1700 units), so it cannot always be inside. A moved area is also not centred on its drawing. The cost of the cut: a small layer at the edge has a target under 64 px on that axis |
| A margin as a part of each layer element | A margin then has the `z` of its layer and lies over the drawn box of a lower layer (`LayerView.tsx:174-178`). "A drawn box wins" would need hit testing in code |
| The nearest centre decides between two margins | Needs hit testing in code. In the hit layer, the stacking order decides by `z` |
| A fallback cover image, promised now for a failed load check | It had no size, no format, and no step that makes it. It needs a fourth field in a response of three fields, and it leaves earlier releases as they are. It is an open item |
| The focus ring in stage units, divided by the scale | The stage container still cuts it at the stage edge |
| The `enter` animations of page 1 play behind the Start gate | An exception to the phase rule, and "Start" then changes nothing that a child can see |
| A night tint by CSS `filter`, or by one layer over the stage | See decision 11 |
| Keep the pill over the picture | See decision 13 |
| The pill with dots in a top bar of the Wide layout | Takes about 60 px from the picture height on every page |

## Consequences

- `apps/storybook/worker`: the route `GET /api/shelf`; the column
  `release.title` with a migration; publish writes the title.
- `apps/storybook/src/player`: the shelf at `/` with its states (waiting,
  books, empty, failed); the Home control on each book screen; the Resting
  state; the bundled pictures of the shelf and of Resting.
- `packages/scene-runtime`: the `still` mode and the `fit` prop of
  `SceneView`; the hit layer in play mode; the stage overlay for a bubble
  and the focus ring.
- `packages/dsl`, `packages/layout`, `tools/assets`: no change. No new
  asset kind, no new asset.
- Deployment: `/` and `/api/shelf` are public. The Access paths do not
  change.
- Device test: the shelf load check joins the page load check. It is a
  gate before the shelf goes public.
- `DESIGN.md`: sections 12.1 and 12.2 and the hit area are rules now. The
  Wide layout differs from board 3 in the place and the form of the pill.
  Coral stays one of the cloth colours of a book, as on the board; the
  rule "no red on a child screen" is for a sign, not for decoration.
- ADR 0016: decision B has the new Home rule, and five items leave "Still
  open".
- Requirements: the hit area criterion no longer promises 64 px for a
  small layer at the stage edge.

## Still open

- The cover method, if the shelf load check fails. Not decided, and not
  built: a cover image that publish makes (a new asset, a publish step,
  a fourth field, and a rule for earlier releases), smaller files for a
  cover, or fewer covers on a shelf page.
- A low Narrow viewport, for example 568 x 320 (a small phone in
  landscape, under the 640 px of Short). The top bar, the control row,
  and the lowest narration panel need 365 px. No rule covers it.
- The friends by the shelf. The board has one or two characters beside the
  shelf, and a tap makes one say "Pick a story!". This record does not
  decide it. It needs a decision on the behaviour, and a source for a
  character file outside a release. `DESIGN.md` section 12.1 keeps it as a
  proposal.
- Taking a book off the shelf. The spec has no way to unpublish a story:
  `story.status` never goes back to `draft`. Today the operator can only
  publish a corrected release.
- A path that matches no route (for example `/abc`). The spec does not say
  what the app shows.
- The Narrow and the Short layout of the shelf have no approved board. The
  values in `DESIGN.md` section 12.1 are starting values.
- The `clouds` cut-out on the `dusk` sky, and indoor backdrops: still open
  in ADR 0016.
