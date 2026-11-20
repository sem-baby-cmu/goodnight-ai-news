# PUB Publish and releases

From a checked draft to a release that never changes, to a book on the
shelf, and off the shelf again. Conventions:
[README](README.md). The spec decides the expected behaviour.

## PUB-01 Publish a draft as a release that never changes

As the operator, I want to publish a draft as a release that never changes,
so that what I checked is what a child sees.

Spec: requirements US-4, AC-10, AC-11 · design "7. Publish", "Release layout (R2)", "6. API"

### PUB-01.S1 Publishing writes a release under a new prefix
- Given a draft where every page has a current text, scene, and audio, none is `needs_review`, and none is stale
- When the operator sends `POST /api/studio/stories/:id/releases`
- Then a new prefix `releases/<releaseId>/` holds `manifest.json`, `pages/<pageId>.json`, `audio/`, and `assets/<key>/v<n>/`; a `release` row is inserted; `story.published_release_id` is set by compare-and-set
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-01.S2 A release is built from one snapshot of the heads
- Given a draft that can be published
- When publish runs
- Then it reads the story row (`heads`, `heads_version`) one time, and builds the page JSON and the manifest from the revisions of that snapshot
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-01.S3 A release holds copies of everything its pages use
- Given a published release
- When the objects under its prefix are listed
- Then the prefix holds a copy of every asset version, sound, and audio file that its pages reference
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-01.S4 A later release does not change an earlier one
- Given release 1 of a story
- When the operator publishes release 2
- Then there are two prefixes; the prefix of release 1 is byte-for-byte unchanged; the Player of release 1 shows the same content as before
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-01.S5 The manifest is written last
- Given a publish in progress
- When it writes the release, and a step fails before the `release` row is inserted
- Then the page JSON is written before the manifest and the manifest is written last; the prefix of a failed publish stays unreferenced, and the Player never sees it
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-01.S6 A release has its own ID and number
- Given a published release
- When its row and its prefix are read
- Then `releaseId` is a UUID v7; the prefix has no story ID; the `release` row keeps the story ID; the pair (`story_id`, `number`) is unique
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-01.S7 A release page carries final positions and its assets
- Given a published release
- When the manifest and a page JSON are read
- Then the manifest has `format = "storybook-mvp"`, `formatVersion = 1`, `storyId`, `releaseId`, `number`, `title`, and the pages with relative paths; each page has `pageId`, `text`, a relative `audio` path, a `scene` in which every layer has `at`, and the assets it uses, with its `sfx` assets
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-01.S8 A release is served with an immutable cache header
- Given a published release
- When a client sends `GET /content/releases/<releaseId>/manifest.json`
- Then the response is the manifest, with `Cache-Control: public, max-age=31536000, immutable`
- Test: @storybook/app · apps/storybook/worker/publish/content.test.ts

### PUB-01.S9 A release copies the asset versions that its scenes record
- Given a draft that can be published, where the `scene` revision of one page records version `n` of an asset in `asset_versions`, and the `scene` revision of another page records version `n + 1`
- When the operator sends `POST /api/studio/stories/:id/releases`
- Then the release prefix holds a copy of version `n` and of version `n + 1` under `assets/<key>/v<n>/`, and each page uses the version that its scene revision records
- Test: spec (to implement)

### PUB-01.S10 A release holds the backdrop of each page
- Given a draft whose scenes use two backdrops
- When the operator publishes the draft
- Then the release prefix holds a copy of each backdrop version that a snapshot `scene` revision records, and each release page lists its backdrop in `assets`
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-01.S11 The release row keeps the title of the manifest
- Given a draft that can be published
- When the operator publishes the draft
- Then `release.title` is the `title` in `manifest.json` of that release
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-01.S12 A release holds the cover file of a backdrop variant
- Given a draft that can be published, whose scenes record a backdrop version with a manifest that names a `coverFile` for each variant
- When the operator publishes the draft
- Then the release prefix holds each cover file under `assets/<key>/v<n>/`, beside its variant file; the publish result has no other new object, and `GET /api/shelf` has the same three fields
- Test: spec (to implement)

## PUB-02 Publishing is blocked while a page is not ready

As the operator, I want publishing blocked while a page is incomplete, so
that a child never gets a page without text, picture, or sound. (Derived from
AC-9.)

Spec: requirements AC-9 · design "7. Publish", "Staleness", "Error Handling"

### PUB-02.S1 A page without audio blocks publishing
- Given a draft where TTS failed for page 5
- When the operator publishes
- Then the API returns 409 with "page 5: missing audio"
- Test: @storybook/app · apps/storybook/worker/api/api.e2e.test.ts

### PUB-02.S2 A page without a text or a scene head blocks publishing
- Given a draft where one page has no `page_text` head or no `scene` head
- When the operator publishes
- Then the API returns 409, and the list names that page and the reason
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### PUB-02.S3 A `needs_review` head blocks publishing
- Given a draft where one head of a page has `status = needs_review`
- When the operator publishes
- Then the API returns 409, and the list names that page and the reason
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-02.S4 A stale audio blocks publishing
- Given a draft where the text of a page changed after its audio was made
- When the operator publishes
- Then the API returns 409, and the list names that page and the reason
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### PUB-02.S5 A stale scene blocks publishing
- Given a draft where the text of a page changed after its scene was made
- When the operator publishes
- Then the API returns 409; the page stays blocked until the operator regenerates the scene or marks it "still fits"
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### PUB-02.S6 "Still fits" unblocks a stale scene
- Given a draft where page 2 text changed, page 2 audio regenerated, the only blocking reason is one stale scene, and a "still fits" copy of that scene that passed its checks
- When the operator marks that scene "still fits" and publishes
- Then publishing succeeds, and the scene revision in the release is the human copy
- Test: @storybook/app · apps/storybook/worker/api/api.e2e.test.ts

### PUB-02.S7 The answer lists every blocking page
- Given a draft with more than one blocking page
- When the operator publishes
- Then the API returns 409 with the list of the blocking pages and their reasons
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

## PUB-03 A published story is a book on the shelf

As the operator, I want a published story to be on the shelf with no other
step, so that a child can find it. (Derived from AC-16, ADR 0017.)

Spec: requirements AC-16 · design "6. API" (Shelf), "7. Publish", "D1 tables"

### PUB-03.S1 The shelf lists the latest release of each published story
- Given two published stories and one draft story
- When a client sends `GET /api/shelf`
- Then the response is 200 with two entries; each has `releaseId` (the release that `story.published_release_id` names), `title` (the `title` in the manifest of that release), and `publishedAt` (the `created_at` of that release); the draft story is not in the list
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S2 An entry has three fields only
- Given a published story
- When a client sends `GET /api/shelf`
- Then its entry has exactly the keys `releaseId`, `title`, and `publishedAt`; the response has no story ID, no revision ID, no run, no head, no status, and no source
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S3 The newest story is first
- Given story A with its first release, and then story B with its first release
- When a client sends `GET /api/shelf`
- Then the entry of B is before the entry of A
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S4 A new release keeps the place of its book
- Given story A and then story B, each with one release, and then release 2 of story A
- When a client sends `GET /api/shelf`
- Then the entry of B is still before the entry of A; the entry of A has the `releaseId` and the `publishedAt` of release 2, and release 1 of A is not in the list
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S5 A failed publish is not on the shelf
- Given a story with no release, and a publish of it that failed before the `release` row was inserted
- When a client sends `GET /api/shelf`
- Then the story is not in the list
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S6 An empty shelf is an empty list
- Given no published story
- When a client sends `GET /api/shelf`
- Then the response is 200 with `{ "books": [] }`
- Test: @storybook/app · apps/storybook/worker/api/shelf-empty.test.ts

### PUB-03.S7 The shelf response is not stored
- Given a published story
- When a client sends `GET /api/shelf`
- Then the response has `Cache-Control: no-store`
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S8 A database failure gives 500
- Given a database that fails
- When a client sends `GET /api/shelf`
- Then the response is 500 with `{ error: "internal" }`
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S9 The shelf route is read-only
- Given the shelf route
- When a client sends `POST /api/shelf`
- Then the response is 404 with `{ error: "not_found" }`, and no row changes
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S10 Stories with the same first release time are in descending story ID order
- Given story A and story B whose first releases have the same `created_at`, and the ID of B is greater than the ID of A
- When a client sends `GET /api/shelf`
- Then the entry of B is before the entry of A
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S11 A pointer to a missing release gives no entry
- Given a sound published story A, and a story B whose `published_release_id` names no `release` row
- When a client sends `GET /api/shelf`
- Then the response is 200 with the entry of A only; the route writes one log line with the ID of B, the release ID, and the reason `missing_release`, with no title and no text; no draft value of B is read
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

### PUB-03.S12 A pointer to a release of another story gives no entry
- Given a sound published story A, and a story B whose `published_release_id` names a `release` row of story A
- When a client sends `GET /api/shelf`
- Then the response is 200 with one entry, the entry of A; the route writes one log line with the ID of B, the release ID, and the reason `wrong_story`, with no title and no text
- Test: @storybook/app · apps/storybook/worker/api/shelf.test.ts

## PUB-04 Take a book off the shelf

As the operator, I want to take a book off the shelf, so that a child can
no longer open a story that should not be read.

Spec: requirements US-9, AC-20, AC-10 · design "6. API" (Taking a book off the shelf, Shelf), "7. Publish", "D1 tables", "Error Handling" · ADR 0017 "Taking a book off the shelf (decision 20)"

### PUB-04.S1 A take-off records the number of the published release
- Given a story with releases 1 and 2, where `published_release_id` names release 2 and `withdrawn_through` is 0
- When the operator sends `POST /api/studio/stories/:id/withdrawal` with `{ releaseId }` of release 2
- Then the response is 200 with `{ storyId, releaseId, withdrawnThrough: 2 }`, and `story.withdrawn_through` is 2
- Test: spec (to implement)

### PUB-04.S2 A story that was taken off is not in the shelf list
- Given a published story A, and a published story B that was taken off the shelf
- When a client sends `GET /api/shelf`
- Then the response is 200 with the entry of A only, and the route writes no log line for B
- Test: spec (to implement)

### PUB-04.S3 The content route does not serve a withdrawn release
- Given a story with releases 1 and 2 and `withdrawn_through` = 2
- When a client sends `GET /content/releases/<id>/manifest.json` for release 1 and for release 2
- Then each response is 404 with `{ error: "not_found" }`, the same answer as for a release that does not exist
- Test: spec (to implement)

### PUB-04.S4 A take-off changes no release
- Given a story with releases 1 and 2, and a list of every `release` row and of every object under the two release prefixes, with their digests
- When the operator takes the story off the shelf
- Then every `release` row and every object is unchanged; `story.published_release_id`, `story.status`, `heads`, and `heads_version` are unchanged
- Test: spec (to implement)

### PUB-04.S5 The same take-off again changes nothing
- Given a story that was taken off the shelf with release 2
- When the operator sends the same request again
- Then the response is 200 with the same body, and `withdrawn_through` is still 2
- Test: spec (to implement)

### PUB-04.S6 A take-off of a release that is not the published one is refused
- Given a story whose `published_release_id` names release 2
- When the operator sends the take-off with the ID of release 1
- Then the response is 409 with `{ error: "release_moved", current }`, where `current` is the ID of release 2; `withdrawn_through` is unchanged, and the story is in the shelf list
- Test: spec (to implement)

### PUB-04.S7 A take-off of a story with no release is refused
- Given a draft story with no release
- When the operator sends the take-off with a UUID as `releaseId`
- Then the response is 409 with `{ error: "not_published" }`, and no row changes
- Test: spec (to implement)

### PUB-04.S8 A take-off of an unknown story gives 404
- Given no story with the ID in the path
- When the operator sends the take-off
- Then the response is 404 with `{ error: "not_found" }`
- Test: spec (to implement)

### PUB-04.S9 A take-off with a bad body gives 400
- Given a published story
- When the operator sends the take-off with a body that has no `releaseId`, or a `releaseId` that is not a UUID
- Then the response is 400 with `{ error: "bad_request", issues }`, and no row changes
- Test: spec (to implement)

### PUB-04.S10 A new release puts the story back on the shelf
- Given story A and then story B, each published; story A has releases 1 and 2 and was taken off the shelf with release 2
- When the operator publishes story A again
- Then release 3 is in the shelf list, after the entry of B (the old place of A); the content route serves release 3; releases 1 and 2 still give 404, and `withdrawn_through` is still 2
- Test: spec (to implement)

### PUB-04.S11 A take-off writes one log line with no title
- Given a published story
- When the operator takes it off the shelf
- Then the route writes one log line with the story ID, the release ID, and the release number; the line has no title and no text
- Test: spec (to implement)

### PUB-04.S12 The Studio routes say what is on the shelf
- Given a story with releases 1, 2, and 3 and `withdrawn_through` = 2
- When the operator sends `GET /api/studio/stories/:id`, and `GET /api/studio/stories`
- Then the story has `onShelf: true` in both responses; in the first, releases 1 and 2 have `withdrawn: true` and release 3 has `withdrawn: false`
- Test: spec (to implement)

### PUB-04.S13 A page JSON of a withdrawn release gives 404
- Given a story with releases 1 and 2 and `withdrawn_through` = 2
- When a client sends `GET /content/releases/<id>/pages/<pageId>.json` for a page of release 1 and for a page of release 2
- Then each response is 404 with `{ error: "not_found" }` and `Cache-Control: no-store`; no response has a part of the page JSON
- Test: spec (to implement)

### PUB-04.S14 An image of a withdrawn release gives 404
- Given a story with releases 1 and 2 and `withdrawn_through` = 2
- When a client sends `GET /content/releases/<id>/assets/<key>/v<n>/<file>` for an image of release 1 and for an image of release 2
- Then each response is 404 with `{ error: "not_found" }` and `Cache-Control: no-store`; no response has a byte of the image
- Test: spec (to implement)

### PUB-04.S15 A `Range` request for an audio file of a withdrawn release gives 404
- Given a story with releases 1 and 2 and `withdrawn_through` = 2
- When a client sends `GET /content/releases/<id>/audio/<file>` with `Range: bytes=0-` for an audio file of release 1 and for one of release 2
- Then each response is 404 with `{ error: "not_found" }` and `Cache-Control: no-store`; no response is 206, and none has a `Content-Range` header or a byte of the file
- Test: spec (to implement)

### PUB-04.S16 A conditional request for a file of a withdrawn release gives 404
- Given a story with releases 1 and 2, and the `ETag` that the content route gave for the manifest, a page JSON, an image, and an audio file of each release; the story was then taken off the shelf with release 2
- When a client requests each of these files again with `If-None-Match` and its `ETag`
- Then each response is 404 with `{ error: "not_found" }` and `Cache-Control: no-store`; no response is 304
- Test: spec (to implement)
