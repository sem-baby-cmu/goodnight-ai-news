# RUN Production run

From a news text to a draft. Conventions: [README](README.md). The spec
decides the expected behaviour.

## RUN-01 Start a full run from pasted text

As the operator, I want to paste a news text and get a draft storybook, so
that I can test a story with children without manual drawing.

Spec: requirements US-1, AC-1, AC-2, AC-23 · design "2. StoryRun Workflow", "6. API", "Storybook DSL"

### RUN-01.S1 A pasted text starts a full run
- Given a news text of 200 to 2,000 words
- When the operator sends `POST /api/studio/stories` with `{ text }`
- Then the API creates, in one batch, a story with `heads = { source: <source revision ID> }` and `heads_version = 0`, the `source` revision, and a full run; it returns 202 with `{ storyId, runId }`
- Test: @storybook/app · apps/storybook/worker/db/stories.test.ts

### RUN-01.S2 A full run gives a draft of 6 to 8 pages
- Given a full run on an empty database, with model outputs that pass validation
- When the run ends
- Then the story has 6 to 8 pages; every page has a current `page_text`, `scene`, and `audio` head; the run ends at `draft_ready`
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-01.S3 Each draft page can be seen, heard, and touched
- Given a draft from a full run
- When its pages are read
- Then each page has narration text, one audio file, at least one character layer, at least one animation, and at least one tap interaction
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-01.S4 The script step writes the outline and every page text
- Given a run after its `freeze` step
- When the `script` step runs and the model output passes validation
- Then one model call gives the outline (title, cast, 6 to 8 page beats) and the text of every page; the step writes 1 `outline` revision and 1 `page_text` revision per page; each page text has 1 to 3 sentences and at most 40 words
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-01.S5 Code creates every page ID
- Given a script output from the model
- When the `script` step stores it
- Then code gives each page a new UUID v7 `pageId`; no `pageId` comes from the model; the step names `scene:<pageId>` and `audio:<pageId>` are unique
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-01.S6 Scene steps run one at a time, audio steps at most 4 pages at a time
- Given a full run with 6 to 8 pages
- When the `scene:*` and `audio:*` steps run
- Then the `scene:*` steps run one at a time in page order; then the `audio:*` steps run in parallel, and at most 4 pages run at the same time
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-01.S7 The Studio shows the progress of a run
- Given a run that is in progress
- When the Studio sends `GET /api/studio/runs/:id`
- Then the response has the run status and the step progress
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-01.S8 A run does not wait for a person
- Given a run whose page steps are complete
- When the `finish` step runs
- Then it checks that every page has current text, scene, and audio, and sets the run status; the run ends at `draft_ready` or `needs_review` and does not wait for a person
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-01.S9 A short pasted text is refused
- Given a pasted news text of fewer than 200 words
- When the operator sends `POST /api/studio/stories` with `{ text }`
- Then the API returns 422 and starts no run
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-01.S10 A long pasted text is cut
- Given a pasted news text of more than 2,000 words
- When the operator sends `POST /api/studio/stories` with `{ text }`
- Then the text is cut at 2,000 words, and the Studio shows a note
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-01.S11 A missing or `needs_review` head gives a `needs_review` run
- Given a run whose page steps are complete, and, when `finish` reads the heads, one page has no `page_text`, `scene`, or `audio` head, or has one of these heads with `status = needs_review`
- When the `finish` step runs
- Then the run ends at `needs_review`
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-01.S12 A stale head gives a `needs_review` run
- Given a page run for the audio of a page whose text changed, so that its old `audio` head is stale, and TTS fails after the retries
- When the `finish` step runs
- Then the run ends at `needs_review`
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-01.S13 A script sentence of more than 12 words fails script validation
- Given a script output whose page text has a sentence of 13 words
- When the `script` step checks the output
- Then it reports `sentence_too_long` for that page text, and the repair rule applies
- Test: @storybook/dsl · packages/dsl/src/script-text.test.ts

### RUN-01.S14 A script with more than 2 real-world names fails script validation
- Given a script output whose page texts hold 3 real-world names (capitalised words inside a sentence that are not cast keys)
- When the `script` step checks the output
- Then it reports `too_many_names` with the 3 names, and the repair rule applies
- Test: @storybook/dsl · packages/dsl/src/script-text.test.ts

### RUN-01.S15 The story view shows the note for a cut text
- Given a story whose `source` revision has `truncated: true`, because the pasted text or the article had more than 2,000 words
- When the operator opens the story view
- Then the Studio shows the notice "The text had more than 2,000 words. Only the first 2,000 were used."; for a `source` revision with `truncated: false`, the notice is absent
- Test: @storybook/app · apps/storybook/src/studio/StoryPage.test.tsx

### RUN-01.S16 The "Run" card shows the progress of each step kind
- Given a run of a story with 2 pages, whose `script` step is done, whose `scene` steps are one done and one failed, and whose `audio` steps are one done and one pending
- When the story view gets the run with `GET /api/studio/runs/:id`
- Then the "Run" card has one row for each step kind; the `scene` row has one solid "failed" cell, the note "1 of 2 done, 1 failed", and the label "scene: 1 of 2 done, 1 failed"
- Test: @storybook/app · apps/storybook/src/studio/StoryPage.test.tsx

### RUN-01.S17 Each scene step sees the scenes of the earlier pages
- Given a full run
- When the `scene:<pageId>` step of page n calls the model
- Then the scene steps run in page order, and the prompt lists, for pages 1 to n-1, the template, sky, and scenery keys of the `ok` scene head, and "This page: n of N"
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-01.S18 The "Run" card at rest shows the latest run
- Given a story whose latest run ended (`draft_ready`, `needs_review`, or `failed`), and a story view opened with no `runId`
- When the operator opens the story view
- Then the Studio sends one `GET /api/studio/runs/:id` for that run and no second one; the "Run" card has one row for each step kind of the answer, a failed step has a solid "failed" cell, and the card does not say "No run is in progress."
- Test: @storybook/app · apps/storybook/src/studio/StoryPage.test.tsx

## RUN-02 Start a full run from a URL

As the operator, I want to give one URL instead of a pasted text, so that I
do not copy the article by hand. (Derived from the scope table.)

Spec: requirements "Scope" · design "6. API" (URL input), "Error Handling", "Testing Strategy"

### RUN-02.S1 An article URL starts a full run
- Given an `http` or `https` page whose `<p>` elements inside `article` or `main` hold 200 to 2,000 words
- When the operator sends `POST /api/studio/stories` with `{ url }`
- Then the text of the story comes from those `<p>` elements; the API creates a story, a `source` revision, and a full run; it returns 202 with `{ storyId, runId }`
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-02.S2 Only `http` and `https` are fetched
- Given a URL, or a redirect target, with a scheme that is not `http` or `https`
- When the API handles the request
- Then the API does not fetch that URL; it returns 422, and the Studio asks for pasted text
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-02.S3 A chain of 4 redirects is refused
- Given a URL that answers with a chain of 4 redirects
- When the API fetches it
- Then the API follows at most 3 redirects and refuses the chain; it returns 422, and the Studio asks for pasted text
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-02.S4 The fetch stops after 10 s
- Given a URL that does not answer in 10 s
- When the API fetches it
- Then the fetch fails; the API returns 422, and the Studio asks for pasted text
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-02.S5 The body is read up to 2 MB
- Given a URL with a body of 3 MB
- When the API reads the body as a stream
- Then it stops at 2 MB and uses only the part it read
- Test: @storybook/app · apps/storybook/worker/api/source.test.ts

### RUN-02.S6 A short article is refused
- Given a URL whose extracted text has fewer than 200 words
- When the API handles the request
- Then it returns 422, and the Studio asks for pasted text
- Test: @storybook/app · apps/storybook/worker/api/source.test.ts

### RUN-02.S7 A long article is cut
- Given a URL whose extracted text has more than 2,000 words
- When the API handles the request
- Then the text is cut at 2,000 words, and the Studio shows a note
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-02.S8 The Studio asks for pasted text when a URL is refused
- Given the "New story" form in "Article URL" mode with an `https` URL
- When the operator selects "Make story", and the API answers 422 `source_rejected`
- Then the form switches to "Paste text" and keeps the URL; a notice with `role="alert"` says "Could not read enough text from that page." and "No run was started. Paste the text instead."
- Test: @storybook/app · apps/storybook/src/studio/NewStoryForm.test.tsx

## RUN-03 A scene uses only what the registry holds

As the system, I want a model to choose only from closed lists, so that every
layer of a draft exists in the registry. (Derived from AC-3 and the rule
"Models choose, code places".)

Spec: requirements AC-3 · design "2. StoryRun Workflow", "5. Scene runtime", "Storybook DSL"

### RUN-03.S1 A run freezes its inputs at the start
- Given a new run
- When the `freeze` step runs
- Then it records the source revision, the active registry versions, and the current heads as the run basis
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-03.S2 The model schema is built from the model view of the frozen registry
- Given a run with a frozen registry and the template list
- When a `scene:<pageId>` step calls the model
- Then the JSON schema it sends is built at run time from the model view of the frozen registry (`modelRegistry`) and the template list; `ref`, `pose`, `expression`, `slot`, `sfx`, and `templateId` are enums in that schema
- Test: @storybook/dsl · packages/dsl/src/json-schema.test.ts

### RUN-03.S3 Every layer references the frozen registry
- Given a draft from a run
- When its scenes are read
- Then every layer references a character, pose, expression, or prop that exists in the registry version that the run froze at its start
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-03.S4 An illegal pose and expression pair fails validation
- Given a scene with a character layer whose pose and expression pair is not legal for that character
- When the scene is validated
- Then validation fails for that layer
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S5 A layer in a slot of another kind fails validation
- Given a scene with a layer whose `kind` does not match the `accepts` value of its slot
- When the scene is validated
- Then validation fails for that layer
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S6 A flip on an asset that cannot flip fails validation
- Given a scene with `flip` set on a layer whose asset is not flippable
- When the scene is validated
- Then validation fails for that layer
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S7 A primitive that the renderer does not support fails validation
- Given a scene with `blink` or `wave` on a layer whose renderer is not `svg-rig`, as an animation or as a `play_animation` tap action
- When the scene is validated
- Then validation rejects that primitive
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S8 A target that names no layer fails validation
- Given a scene with an animation or an action whose `target` names no layer of the page
- When the scene is validated
- Then validation fails for that animation or action
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S9 A sound that is not in the registry fails validation
- Given a scene with a `play_sfx` action whose `sfx` is not a key of an active `sfx` asset
- When the scene is validated
- Then validation fails for that action
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S10 A bubble text of more than 40 characters fails validation
- Given a scene with a `show_bubble` action whose text has more than 40 characters
- When the scene is validated
- Then validation fails for that action
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S11 A tap that makes an illegal pair fails validation
- Given a scene with a `set_expression` action where the pair (current pose, new expression) is not legal, or a `set_pose` action where the pair (new pose, current expression) is not legal
- When the scene is validated
- Then validation fails for that action
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S12 Code assigns every layer ID
- Given a scene output in which the model names layers by their slot
- When code stores the scene
- Then code assigns each `instanceId` and rewrites `target` and `on.tap` to those values; no `instanceId` comes from the model
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-03.S13 A page without a character, an animation, or a tap fails validation
- Given a scene output with no character layer, no animation, or no tap interaction
- When it is validated
- Then validation fails, and the repair rule applies (RUN-05)
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-03.S14 An animation parameter outside its bounds fails validation
- Given a scene output with an animation parameter outside the bounds of its primitive, for example `float` with a period of 8 s
- When it is validated
- Then validation fails, and the repair rule applies (RUN-05); code does not clamp the parameter to the bounds
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-03.S15 A backdrop without a variant for the sky fails validation
- Given a backdrop whose manifest has the variants `day` and `night`
- When a scene names that backdrop with `sky = dusk`
- Then the scene fails validation with `backdrop_sky_mismatch`
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S16 The model picks the backdrop from the frozen registry
- Given a run that froze the registry with its backdrops
- When the `scene:<pageId>` step builds the model schema
- Then `backdrop` is an enum of the frozen backdrop keys, and the prompt gives the `description` and the palettes of each backdrop
- Test: @storybook/app · apps/storybook/worker/workflow/prompts.test.ts

### RUN-03.S17 A bubble text that does not end with a full stop, "!", or "?" fails validation
- Given a scene with a `show_bubble` action whose text does not end with `.`, `!`, or `?`
- When the scene is validated
- Then validation fails for that action with `bubble_no_end_mark`
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

### RUN-03.S18 A bubble text with a character outside printable ASCII fails validation
- Given a scene with a `show_bubble` action whose text has a character outside U+0020 to U+007E
- When the scene is validated
- Then validation fails for that action with `bubble_not_ascii`
- Test: @storybook/dsl · packages/dsl/src/validate.test.ts

## RUN-04 Code places the layers

As the system, I want code to compute and check every position, so that
faces stay visible and characters do not cover each other. (Derived from the
rule "Models choose, code places".)

Spec: design "4. Layout engine", "Error Handling"

### RUN-04.S1 The engine places each layer from its slot
- Given a valid scene and a layout template
- When the layout engine runs
- Then for each layer it reads the foot point and box of the asset, and the slot's height and width, and computes `x`, `y`, `scale`, and `z`
- Test: @storybook/layout · packages/layout/test/layout.test.ts

### RUN-04.S2 A hidden face fails the face check
- Given a placed scene where a character's face box is outside the stage, or more than 30% covered by a layer with a higher `z`
- When the engine checks the scene
- Then the "Face visible" check fails
- Test: @storybook/layout · packages/layout/test/checks.test.ts

### RUN-04.S3 Two characters that overlap too much fail the overlap check
- Given a placed scene where two character boxes overlap by more than 15% of the smaller box
- When the engine checks the scene
- Then the "Overlap" check fails
- Test: @storybook/layout · packages/layout/test/checks.test.ts

### RUN-04.S4 A layer too far outside the stage fails the bounds check
- Given a placed scene where a box goes outside the stage by more than 10%
- When the engine checks the scene
- Then the "Bounds" check fails
- Test: @storybook/layout · packages/layout/test/checks.test.ts

### RUN-04.S5 The engine shrinks layers before it reports a failure
- Given a placed scene that fails a check
- When the engine shrinks the layers involved step by step, down to the `minScale` of each slot, and checks again
- Then the scene passes if the checks pass at a scale that is not below `minScale`
- Test: @storybook/layout · packages/layout/test/layout.test.ts

### RUN-04.S6 A layout that still fails counts as a validation failure
- Given a placed scene that still fails a check with every layer involved at its `minScale`
- When the `scene:<pageId>` step continues
- Then the page counts as a validation failure, and the repair rule of RUN-05 applies
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-04.S7 A layer is centred on its slot and fits the slot's width and height
- Given a slot with a height and, for scenery, a width, and an asset whose foot point is not at the centre of its box
- When the layout engine places the layer
- Then the scale is the smaller of slot height / box height and slot width / box width, the box is centred on the slot's `footX` with its foot on `footY`, and a flipped layer gets the same box
- Test: @storybook/layout · packages/layout/test/layout.test.ts

## RUN-05 A failure goes to a person

As the operator, I want a failed page kept with its errors, so that I decide
how to correct it and nothing changes silently. (Derived from AC-4.)

Spec: requirements AC-4 · design "2. StoryRun Workflow", "6. API", "Error Handling"

### RUN-05.S1 One repair call corrects an invalid scene
- Given a first scene output that fails validation, a provider 429 between the first call and the repair call, and a repair output that passes
- When the `scene:<pageId>` step runs
- Then the model is called two times in total (first, repair); the repair call has `purpose = repair` and carries the error list; the repaired scene is the head
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-05.S2 A scene that still fails is kept as `needs_review`
- Given a scene output that fails validation, and a repair output that also fails
- When the `scene:<pageId>` step ends
- Then the candidate is saved with `status = needs_review` and its errors; no layer is dropped and no character is swapped; there is no second repair
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-05.S3 A script that still fails makes the run fail
- Given a script output that fails validation, and a repair output that also fails
- When the `script` step ends
- Then the run fails with the errors
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-05.S4 A provider 429 or 5xx is retried by the platform
- Given a model step where the provider answers 429 or 5xx
- When the step throws
- Then the platform retries the step: 3 tries, exponential back-off, starting at 10 s; a stored result is not requested again
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-05.S5 Another provider 4xx is not retried
- Given a model step for a page where the provider answers a 4xx that is not 429
- When the step handles the answer
- Then the error is non-retryable; the step stores the provider error once in `call_log` as `result = { providerError: { status, message } }` and writes a `needs_review` revision with `content = null` and `error = { providerError: { status, message } }`, with `message` cut to 300 characters, and that revision becomes the head; a replay of the step does not call the model again
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-05.S6 A failed narration leaves the page without audio
- Given an `audio:<pageId>` step where TTS fails after the retries
- When the run ends
- Then the page has no `audio` head; the run ends at `needs_review`; the Studio offers "regenerate audio"
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-05.S7 A failed run can be started again
- Given a run that failed
- When the operator opens it in the Studio
- Then `run.status` is `failed` with the error; the Studio shows the error; a run whose `script` step failed can restart as a full run, and a run whose page step failed can restart that page with a page run
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-05.S8 A provider 4xx in the script step makes the run fail
- Given a `script` step where the provider answers a 4xx that is not 429
- When the step handles the answer
- Then the error is non-retryable, and the run fails with the provider message
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### RUN-05.S9 A full run can start again when the script step never succeeded
- Given a story with no `outline` head, because its `script` step failed, and no run of the story is `queued` or `running`
- When the operator sends `POST /api/studio/stories/:id/runs` with `{ scope: { kind: "full" } }`
- Then the API starts a new full run
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-05.S10 A full run is refused when the story has an outline
- Given a story with an `outline` head, and no run of the story is `queued` or `running`
- When the operator sends `POST /api/studio/stories/:id/runs` with `{ scope: { kind: "full" } }`
- Then the API returns 409 `full_run_not_allowed`, and no run starts
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-05.S11 A full run is refused while a run is still running
- Given a story with no `outline` head, and a run of the story with `status = queued` or `status = running`
- When the operator sends `POST /api/studio/stories/:id/runs` with `{ scope: { kind: "full" } }`
- Then the API returns 409 `full_run_not_allowed`, and no run starts
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### RUN-05.S12 A page run is refused while a run is queued or running
- Given a story with a run of the story with `status = queued` or `status = running`
- When the operator sends `POST /api/studio/stories/:id/runs` with a page scope
- Then the API returns 409 `run_active` with the `runId` of the active run, and no run starts
- Test: @storybook/app · apps/storybook/worker/api/api.e2e.test.ts

### RUN-05.S13 A failed run of a story with no outline offers "Start again"
- Given a story with no `outline` head, whose latest run failed in the `script` step
- When the operator opens the story view
- Then the "Run" card has a notice "The run failed." with one line for each error, for example "script: <message>", and a "Start again" button that sends `POST /api/studio/stories/:id/runs` with `{ scope: { kind: "full" } }`
- Test: @storybook/app · apps/storybook/src/studio/StoryPage.test.tsx

### RUN-05.S14 A failed run of a story with an outline points to the pages
- Given a story with an `outline` head, whose latest run failed in the `scene` step of page 2
- When the operator opens the story view
- Then the "Run" card has a notice "The run failed." with the line "scene, page 2: <message>" and the line "Open a page to make its scene or audio again."; the notice has no "Start again" button
- Test: @storybook/app · apps/storybook/src/studio/StoryPage.test.tsx

### RUN-05.S15 A repair call stores the issues of the attempt it repairs
- Given a `script` or `scene:<pageId>` first output that fails the checks
- When the step makes the repair call
- Then the `repair` row in `call_log` stores in `repair_issues` the issue list that the repair prompt gives, also when the repair gets a provider 4xx; the `first` row has `repair_issues` null; no row is updated
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

## RUN-06 The scene approach holds on real news

As the operator, I want real news texts to pass with the real models, so that
I know the template approach works before the full build. (Derived from the
design, product premise S2.)

Spec: design "Testing Strategy"

### RUN-06.S1 At least 90% of pages pass with at most one repair
- Given 3 real news texts and the real models
- When each text runs through the outline, the page texts, and the scenes
- Then at least 90% of the pages pass validation and layout with at most one repair
- Test: manual · docs/specs/storybook-mvp/results/s2.md

### RUN-06.S2 Real model outputs stay valid as fixtures
- Given the model outputs recorded in S2, kept as fixtures
- When a schema changes
- Then the fixtures stay valid, or they are updated on purpose
- Test: @storybook/app · apps/storybook/test/model-contract/fixtures.test.ts
