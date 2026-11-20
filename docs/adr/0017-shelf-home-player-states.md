# ADR 0017: The shelf, the Home control, and the remaining Player rules

- Status: Accepted
- Date: 2026-11-19
- Decided by: Jinyu Liu (owner). The owner put the shelf into the spec,
  accepted the planning recommendations (shelf data, cover, home route), and
  delegated the UI and design choices to a Fable 5.2 design pass (#70).
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
  paper title label, in an upright window of 151 x 208 px. The board places
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
| 3 | Order of books | Newest story first, by the publish time of the first release of the story. A new release of a story keeps the place of its book | A child finds a book where it was. A correction of an old book is not a new book |
| 4 | More books than fit | Shelf pages with "previous" and "next" round buttons. Nothing scrolls. No cap on the number of books | Paging limits the covers that load at one time, and it uses the two arrows a child knows from a book. A cap would hide a published book without a sign |
| 5 | Empty shelf | The shelf without books and one quiet line. No control | An empty shelf is a true picture, not a fault |
| 6 | The shelf request fails | The shelf without books, a quiet line, and one "Look again" button | A person can try again without the reload control of the browser. No failure wording |
| 7 | How covers load | Only the covers of the shelf page that is shown. A book shows at once with its title and a Paper picture window. The picture fades in when its files are loaded. A cover that fails keeps the Paper window | A child can open a book before its picture arrives. No red and no fault sign |
| 8 | Home | Every Player screen of a book has exactly one Home control. The shelf has none | One way back from every screen. The frame stays at 3 controls |
| 9 | Resting state | Shown when a release does not exist, or when a file that "Start" waits for fails. A night picture from the app bundle, "This book is sleeping. Come back soon.", and a Home button | A fault shows as a quiet state with one way out. The picture needs no request, so it shows with no network |
| 10 | Hit area of a tappable layer | At least 64 x 64 CSS px in play mode. Moved inside the stage, never cut. A drawn box wins over a grown margin | The child target rule also holds for a small cut-out on a phone |
| 11 | Night tint for cut-outs | Rejected for the MVP | No way keeps the page-turn rule without a second set of asset files |
| 12 | Moon | No moon asset in the MVP | `stars` and the `night` palette already say night. The scenery boards have no moon asset |
| 13 | Progress pill in the Wide layout | Moved off the picture: the count only, at the top of the right gutter | On a small Wide viewport the pill hides a large part of a `sky-1` object. Now no frame part lies over the picture in any layout |
| 14 | Indoor backdrops | Stay out of the MVP | ADR 0016; no new evidence |

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

- One entry for each story whose `published_release_id` is set. The entry is
  the release that the pointer names. The pointer moves only to a higher
  release number (design "7. Publish"), so that release is the latest.
- `title` is `release.title`. `publishedAt` is `release.created_at`.
- An entry has these three fields only. No story ID, no revision ID, no run,
  no head, no status, and nothing of a story that has no release.
- Order: by the `created_at` of the first release of the story, newest
  first. Ties are in story ID order, so the order is stable.
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
  then the backdrop variant and the layer files of that page. All of them
  come through the content route, so the browser caches them as immutable
  files. To open the book then needs no second download of page 1.
- Caching of covers (implementation decision): no rule beyond the content
  route. The Player keeps a loaded cover in memory while the shelf is open.
- The picture window of a book is upright, and the stage is 4:3. The stage
  gets the height of the window and is centred, and its left and right
  parts are cut. The middle 872 of the 1600 stage units show (arithmetic:
  151 / 208 x 1200). In `hero-and-object` the hero foot is at x 520 and the
  object foot at x 1120 (`packages/layout/src/templates.ts:53-54`), so both
  are inside. The window shows stage x 364 to 1236. Every template has a
  character slot with its foot inside. The outer slots of `line-up` (x 250
  and 1350) and of `circle-around-object` (x 360 and 1240) are outside, so
  a character there is cut or not shown on the cover. This is accepted: a
  cover shows the book, and the page shows the whole scene. The rule "the stage is never cropped" stays for the picture
  area of a page.
- A cover has no filter and no hand-placed art. That differs from the
  board (`DESIGN.md` section 16, "Differences").

**Shelf load check.** A device test measures the shelf on the 4G profile of
the page load test:

| Part | Value |
| :-- | :-- |
| Fixture | 6 books, each a different release. Page 1 of each uses a painted backdrop at full size |
| Cache | Empty |
| Start | The browser sends `GET /api/shelf` |
| End | The last cover of the first shelf page is drawn |
| Pass | 2 s or less |

**Fallback rule.** If the check fails, publish stores one cover image in the
release, the shelf entry gets a `cover` field with its path, and the shelf
shows that image instead of the still scene. A release has no cover image
when it was published before that change, because a release never changes;
the shelf draws its page 1 scene as before. The fallback is not built now.

Arithmetic, not measured: a shelf page of 6 covers loads up to 6 backdrop
variants, 1.5 MB at the starting budget of 250 KB, plus the cut-outs. A
book page loads one.

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
- A book is a link to `/read/:releaseId`. The whole book is the target.
- Until the response arrives, the shelf shows no book and three waiting
  dots.
- The shelf has no Home control, no link out of the product, and no text
  that is the only way to move.

### Home (decision 8)

- The Start gate (Loading and Ready), the reading page, and the end page
  have the Home round button in the frame. The Resting state has a Home
  button with a label in the panel, and no round button.
- A tap on Home stops the narration and any sound effect, and shows the
  shelf at `/`. There is no question and no overlay.
- Home works during a page turn.
- The Player keeps no reading position. A book that is opened again shows
  its Start gate.

### Resting (decision 9)

The Player shows the Resting state at `/read/:releaseId` when one of these
is true:

| Trigger | Detail |
| :-- | :-- |
| The release does not exist | `releaseId` is not a lower-case UUID version 7, or the request for `manifest.json` gives 404 |
| The release fails to load before "Start" | A request for the manifest, a page JSON, or an asset of page 1 ends with a network error or a status that is not 2xx; or the manifest or a page JSON does not pass the release schema |

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

### Hit area of a tappable layer (decision 10)

In play mode, a layer that has a tap interaction has a hit area:

- It is the drawn box of the layer. On an axis where the box is less than
  64 CSS px on the screen, the hit area is 64 CSS px, centred on the box.
  The part beyond the box is the margin.
- A hit area that would go outside the stage is moved along that axis until
  it is inside. It is not cut.
- A point inside the drawn box of one or more tappable layers belongs to the
  one with the highest `z`.
- A point that is in no such box, and inside one or more margins, belongs to
  the layer with the highest `z` among them.
- A layer without a tap interaction takes no tap and blocks none
  (`packages/scene-runtime/src/LayerView.tsx:150` does this today).
- The size is in CSS px, so it is computed from the stage scale and again
  after a resize.
- It is a rule of the runtime only. It adds no validation rule and no DSL
  field, and the layout engine does not change. Edit mode has no margin.

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

Arithmetic, not measured in a browser. The pill with dots is about 179 px
(6 pages) to 207 px (8 pages) wide and stands 16 px from the left and the
top of the page panel.

| Viewport | Stage | Pill covers (stage units) | Of a `sky-1` object 200 units wide in `hero-and-object` |
| :-- | :-- | :-- | :-- |
| 1194 x 834 (board 3) | 771 x 578, starts 116 px from the panel edge | x 0 to 165-223, y 33 to 125 | At most its top left corner |
| 900 x 600 (smallest Wide) | 459 x 344, starts 125 px from the panel edge | x 0 to 245-343, y 56 to 209 | 22 % to 72 % of its width, over the top 55 % of its height |

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
- The hit area rule matches what the DOM does today for boxes. Only the
  margin is new.
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
| A hit area cut at the stage edge | A small layer at the edge gets a target under 64 px, which is the case the rule is for |
| The nearest centre decides between two margins | Needs hit testing in code. `z` order is what the DOM gives |
| A night tint by CSS `filter`, or by one layer over the stage | See decision 11 |
| Keep the pill over the picture | See decision 13 |
| The pill with dots in a top bar of the Wide layout | Takes about 60 px from the picture height on every page |

## Consequences

- `apps/storybook/worker`: the route `GET /api/shelf`; the column
  `release.title` with a migration; publish writes the title.
- `apps/storybook/src/player`: the shelf at `/` with its states (waiting,
  books, empty, failed); the Home control on each book screen; the Resting
  state; the bundled pictures of the shelf and of Resting.
- `packages/scene-runtime`: the `still` mode of `SceneView`; the hit area of
  a tappable layer in play mode.
- `packages/dsl`, `packages/layout`, `tools/assets`: no change. No new
  asset kind, no new asset.
- Deployment: `/` and `/api/shelf` are public. The Access paths do not
  change.
- Device test: the shelf load check joins the page load check.
- `DESIGN.md`: sections 12.1 and 12.2 and the hit area are rules now. The
  Wide layout differs from board 3 in the place and the form of the pill.
  Coral stays one of the cloth colours of a book, as on the board; the
  rule "no red on a child screen" is for a sign, not for decoration.
- ADR 0016: decision B has the new Home rule, and five items leave "Still
  open".
- The fallback cover image, if the check fails, is a separate change. That
  change defines how the image is made.

## Still open

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
