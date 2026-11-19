# EDT Studio editing

See a draft, change one page, and regenerate one page target. Conventions:
[README](README.md). The spec decides the expected behaviour.

## EDT-01 See a story and the state of its pages

As the operator, I want to see every page and its state, so that I know which
pages need work. (Derived from core feature 4.)

Spec: requirements "Core Features" 4 · design "6. API", "Staleness"

### EDT-01.S1 The Studio lists the stories
- Given stories in the database
- When the Studio sends `GET /api/studio/stories`
- Then the response lists the stories
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-01.S2 A story view shows heads, page states, and releases
- Given a story with a draft
- When the Studio sends `GET /api/studio/stories/:id`
- Then the response has the heads with their content, a state for each page (`ok`, `stale`, `missing`, or `needs_review`), and the releases
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-01.S3 A changed page text makes the audio and the scene stale
- Given a page whose `audio` and `scene` heads have the basis `page_text:P = T1`
- When the `page_text` head of that page becomes `T2`
- Then the `audio` head and the `scene` head of that page are stale, because a basis entry is not the current head
- Test: @storybook/app · apps/storybook/worker/db/staleness.test.ts

## EDT-02 Change a page text and regenerate only its audio

As the operator, I want to change the text of one page and regenerate only
that page's audio, so that I keep the parts that are already good.

Spec: requirements US-2, AC-5 · design "3. Calls, revisions, and heads", "6. API", "2. StoryRun Workflow", "Storybook DSL", "Error Handling"

### EDT-02.S1 A saved text is a new human revision
- Given a page whose `page_text` head is `T1`
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/text` with `{ text, basedOn: T1 }`
- Then a new `page_text` revision with `origin = human` is saved, and the head moves to it by compare-and-set
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-02.S2 A save that is based on an old revision is refused
- Given a page whose head has moved since the operator loaded it
- When the operator saves with the old `basedOn`
- Then the API returns 409 with the current revision
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-02.S3 "Regenerate audio" changes one page only
- Given a draft where the operator changed the text of page 3
- When the operator starts a page run with scope `{ kind: "page", pageId: <page 3>, target: "audio" }`
- Then the run does `freeze`, `audio:<page 3>`, and `finish`; only the audio of page 3 gets a new revision, with the current page text as its basis; all other revisions and heads stay the same
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### EDT-02.S4 A page text that fails validation is refused
- Given a page whose `page_text` head has not moved since the operator loaded it, and an edited text that fails `PageText` validation, for example a text of 4 sentences or of more than 40 words
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/text` with `{ text, basedOn }`
- Then the API returns 422 with the error list; no revision is saved, and the `page_text` head does not move
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-02.S5 An old `basedOn` for a text is refused before validation
- Given a page whose `page_text` head has moved since the operator loaded it, and an edited text that also fails `PageText` validation
- When the operator saves the text with the old `basedOn`
- Then the API returns 409 with the current revision, not 422; the text is not validated, and no revision is saved
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

## EDT-03 Regenerate or edit the scene of one page

As the operator, I want to regenerate the scene of one page, so that I can
fix one bad page without a new story.

Spec: requirements US-3, "Core Features" 4 · design "2. StoryRun Workflow", "4. Layout engine", "5. Scene runtime", "6. API", "Storybook DSL", "Error Handling"

### EDT-03.S1 "Regenerate scene" runs one step for one page
- Given a draft
- When the operator sends `POST /api/studio/stories/:id/runs` with scope `{ kind: "page", pageId, target: "scene" }`
- Then the run does `freeze`, `scene:<pageId>`, and `finish`, and no other page step
- Test: @storybook/app · apps/storybook/worker/api/api.e2e.test.ts

### EDT-03.S2 "Still fits" makes a stale scene current
- Given a page whose scene is stale, has `status = ok`, and has not moved since the operator loaded it, whose `page_text` head is the revision that the operator saw, and whose copy passes the checks of `PUT .../scene` against the active registry
- When the operator sends `POST /api/studio/stories/:id/pages/:pageId/scene/still-fits` with `{ basedOn, textBasedOn }`
- Then the current scene is copied into a new human revision whose basis is the current page text, and the scene is not stale
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S3 An edited scene is validated, laid out, and saved
- Given a page in the editor
- When the operator changes the layout template, a character, a pose or expression, a prop, an animation, or a tap, and sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the scene is validated, laid out, and saved as a human `scene` revision whose basis is the current page text
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S4 A scene save that is based on an old revision is refused
- Given a page whose `scene` head has moved since the operator loaded it
- When the operator saves the scene with the old `basedOn`
- Then the API returns 409 with the current revision
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S5 A manual position overrides the slot
- Given a layer for which the operator set an `at` value in the Studio
- When the scene is laid out
- Then the manual `at` value overrides the slot for that layer
- Test: @storybook/layout · packages/layout/test/layout.test.ts

### EDT-03.S6 Edit mode has selection boxes and drag handles
- Given `SceneView` with `mode = "edit"`
- When the operator selects a layer and moves it
- Then the stage shows selection boxes and drag handles; `onSelectLayer` gets the `instanceId`, and `onMoveLayer` gets the `instanceId` and the new `at`
- Test: spec (to implement)

### EDT-03.S7 An edited scene that fails validation is refused
- Given a page in the editor whose `scene` head has not moved since the operator loaded it, and an edited scene that fails validation, for example a scene with no tap interaction
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the API returns 422 with the error list; no revision is saved, and the `scene` head does not move; no repair call is made
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S8 An edited scene with an asset that is not in the registry is refused
- Given a page in the editor whose `scene` head has not moved since the operator loaded it, and an edited scene with a `ref` that is not an active registry asset key
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the API returns 422 with the error list; no revision is saved
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S9 A layer with a manual position is not shrunk
- Given a page in the editor whose `scene` head has not moved since the operator loaded it, and an edited scene in which a layer with a manual `at` fails a layout check, and the check still fails after the engine shrinks the other layers involved
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the engine does not shrink that layer; the API returns 422 with the error list; no revision is saved
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S10 An old `basedOn` is refused before validation
- Given a page whose `scene` head has moved since the operator loaded it, and an edited scene that also fails validation
- When the operator saves the scene with the old `basedOn`
- Then the API returns 409 with the current revision, not 422; the scene is not validated, and no revision is saved
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S11 "Still fits" is refused for a scene that needs review
- Given a page whose `scene` head has `status = needs_review` and has not moved since the operator loaded it, and whose `page_text` head is the revision that the operator saw
- When the operator sends `POST /api/studio/stories/:id/pages/:pageId/scene/still-fits` with `{ basedOn, textBasedOn }`
- Then the API returns 409; nothing is copied, and the `scene` head does not move
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S12 The API assigns the ID of a layer that the operator adds
- Given a page in the editor whose `scene` head has not moved since the operator loaded it, and an edited scene that passes validation and has one layer without `instanceId`
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the API assigns the `instanceId` of that layer; the saved revision has an `instanceId` on every layer, and the ID of the new layer does not come from the Studio
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S13 An animation or tap cannot name a layer that is new in the same request
- Given a page in the editor whose `scene` head has not moved since the operator loaded it, and an edited scene with a layer without `instanceId` and an animation or a tap that names that layer
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the API returns 422 `unknown_target`; no revision is saved, and the `scene` head does not move
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S14 A manual scale below the slot's `minScale` is kept
- Given a page in the editor whose `scene` head has not moved since the operator loaded it, and an edited scene in which a layer has a manual `at` with `scale` greater than 0 and below its slot's `minScale`, and the layout checks pass
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the scene is saved, and the layer keeps the manual `at` with that `scale`
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S15 A manual scale that is not greater than 0 is refused
- Given a page in the editor whose `scene` head has not moved since the operator loaded it, and an edited scene in which a layer has a manual `at` with `scale` 0 or less
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the API returns 422 with the error list; no revision is saved
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S16 An edited scene uses the active registry versions
- Given a draft whose scenes were made with version `n` of an asset, version `n + 1` is now active, and a page in the editor whose `scene` head has not moved since the operator loaded it
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }` and a scene that uses that asset
- Then the enums and checks use version `n + 1`, and the saved revision records version `n + 1` for that asset in `asset_versions`
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S17 "Still fits" is refused when the copy fails against the active registry
- Given a page whose scene is stale, has `status = ok`, and has not moved since the operator loaded it, whose `page_text` head is the revision that the operator saw, and whose copy fails the checks of `PUT .../scene` against the active registry, for example because it uses a pose that the active version of its character does not have
- When the operator sends `POST /api/studio/stories/:id/pages/:pageId/scene/still-fits` with `{ basedOn, textBasedOn }`
- Then the API returns 422 `invalid_scene` with the error list; nothing is saved, and the `scene` head does not move
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S18 An old `basedOn` for "still fits" is refused first
- Given a page whose `scene` head has moved since the operator loaded it, whose `page_text` head is also not the revision that the operator saw, and whose current scene would also fail validation against the active registry
- When the operator sends `POST /api/studio/stories/:id/pages/:pageId/scene/still-fits` with the old `basedOn` and the old `textBasedOn`
- Then the API returns the 409 for `basedOn`, not 409 `head_moved` and not 422; nothing is copied, and the `scene` head does not move
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S19 A "still fits" copy records the active registry versions
- Given a page whose stale scene has `status = ok` and was made with version `n` of an asset, version `n + 1` is now active, its `scene` and `page_text` heads are the revisions that the operator saw, and the copy passes the checks of `PUT .../scene` against the active registry
- When the operator sends `POST /api/studio/stories/:id/pages/:pageId/scene/still-fits` with `{ basedOn, textBasedOn }`
- Then the new human revision records version `n + 1` for that asset in `asset_versions`
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S20 A malformed layer ID in an edited scene is refused
- Given a page in the editor whose `scene` head has not moved since the operator loaded it, and an edited scene with a layer whose `instanceId` is not a lower-case UUID v7
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the API returns 422 `unknown_instance`; no revision is saved, and the `scene` head does not move
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S21 A layer ID that is not in the edited revision is refused
- Given a page in the editor whose `scene` head has not moved since the operator loaded it, and an edited scene with a layer whose `instanceId` is a lower-case UUID v7 that is not the ID of a layer in the `basedOn` scene revision
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the API returns 422 `unknown_instance`; no revision is saved, and the `scene` head does not move
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S22 An operator save that loses the head race 5 times is answered busy
- Given a page whose head has not moved since the operator loaded it, and a compare-and-set loop that loses the race 5 times
- When the operator saves the page text, the scene, or "still fits"
- Then the API returns 503 `busy`; the human revision is kept, and the head does not move
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### EDT-03.S23 The operator changes the backdrop of a page
- Given a page whose scene uses the backdrop `meadow`
- When the operator saves the scene with another backdrop that has a variant for the page's `sky`
- Then the scene is validated, laid out, and saved as a human `scene` revision; its `asset_versions` records the active version of the new backdrop
- Test: spec (to implement)

### EDT-03.S24 The editor offers only the palettes of the chosen backdrop
- Given the page editor with the backdrop `meadow` and the sky `cloudy`
- When the operator picks a backdrop that has only `day`, `dusk`, and `night`
- Then the sky choices are `day`, `dusk`, and `night`, and the sky becomes `day` (implementation decision, design "6. API")
- Test: spec (to implement)

## EDT-04 A late result does not replace the operator's work

As the operator, I want my edit to stay when a run finishes later, so that a
result made from old text does not replace my work. (Derived from AC-8.)

Spec: requirements AC-8 · design "3. Calls, revisions, and heads", "Error Handling"

### EDT-04.S1 A scene made from old text is kept as `superseded`
- Given a full run that started `scene:<page 3>` with the basis `page_text:<page 3> = T1`, and an operator who then saved the new text `T2`
- When `scene:<page 3>` commits
- Then the scene revision is kept with `status = superseded`; the head does not move; the Studio shows page 3 as missing a current scene, and the operator can regenerate it
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts
