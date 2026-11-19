# PUB Publish and releases

From a checked draft to a release that never changes. Conventions:
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
