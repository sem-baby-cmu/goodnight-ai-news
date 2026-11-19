# RUN Production run

From a news text to a draft. Conventions: [README](README.md). The spec
decides the expected behaviour.

## RUN-01 Start a full run from pasted text

As the operator, I want to paste a news text and get a draft storybook, so
that I can test a story with children without manual drawing.

Spec: requirements US-1, AC-1, AC-2 · design "2. StoryRun Workflow", "6. API", "Storybook DSL"

### RUN-01.S1 A pasted text starts a full run
- Given a news text of 200 to 2,000 words
- When the operator sends `POST /api/studio/stories` with `{ text }`
- Then the API creates a story with `heads = {}` and `heads_version = 0`, a `source` revision, and a full run; it returns 202 with `{ storyId, runId }`
- Test: spec (to implement)

### RUN-01.S2 A full run gives a draft of 6 to 8 pages
- Given a full run on an empty database, with model outputs that pass validation
- When the run ends
- Then the story has 6 to 8 pages; every page has a current `page_text`, `scene`, and `audio` head
- Test: spec (to implement)

### RUN-01.S3 Each draft page can be seen, heard, and touched
- Given a draft from a full run
- When its pages are read
- Then each page has narration text, one audio file, at least one character layer, at least one animation, and at least one tap interaction
- Test: spec (to implement)

### RUN-01.S4 The script step writes the outline and every page text
- Given a run after its `freeze` step
- When the `script` step runs and the model output passes validation
- Then one model call gives the outline (title, cast, 6 to 8 page beats) and the text of every page; the step writes 1 `outline` revision and 1 `page_text` revision per page; each page text has 1 to 3 sentences and at most 40 words
- Test: spec (to implement)

### RUN-01.S5 Code creates every page ID
- Given a script output from the model
- When the `script` step stores it
- Then code gives each page a new UUID v7 `pageId`; no `pageId` comes from the model; the step names `scene:<pageId>` and `audio:<pageId>` are unique
- Test: spec (to implement)

### RUN-01.S6 Page steps run at most 4 pages at a time
- Given a full run with 6 to 8 pages
- When the `scene:*` and `audio:*` steps run
- Then they run in parallel, and at most 4 pages run at the same time
- Test: spec (to implement)

### RUN-01.S7 The Studio shows the progress of a run
- Given a run that is in progress
- When the Studio sends `GET /api/studio/runs/:id`
- Then the response has the run status and the step progress
- Test: spec (to implement)

### RUN-01.S8 A run does not wait for a person
- Given a run whose page steps are complete
- When the `finish` step runs
- Then it checks that every page has current text, scene, and audio, and sets the run status; the run ends at `draft_ready` or `needs_review` and does not wait for a person
- Test: spec (to implement)

## RUN-02 Start a full run from a URL

As the operator, I want to give one URL instead of a pasted text, so that I
do not copy the article by hand. (Derived from the scope table.)

Spec: requirements "Scope" · design "6. API" (URL input), "Error Handling", "Testing Strategy"

### RUN-02.S1 An article URL starts a full run
- Given an `http` or `https` page whose `<p>` elements inside `article` or `main` hold 200 to 2,000 words
- When the operator sends `POST /api/studio/stories` with `{ url }`
- Then the text of the story comes from those `<p>` elements; the API creates a story, a `source` revision, and a full run; it returns 202 with `{ storyId, runId }`
- Test: spec (to implement)

### RUN-02.S2 Only `http` and `https` are fetched
- Given a URL, or a redirect target, with a scheme that is not `http` or `https`
- When the API handles the request
- Then the API does not fetch that URL (the response status is open question Q6)
- Test: spec (to implement)

### RUN-02.S3 A chain of 4 redirects is refused
- Given a URL that answers with a chain of 4 redirects
- When the API fetches it
- Then the API follows at most 3 redirects and refuses the chain; it returns 422, and the Studio asks for pasted text
- Test: spec (to implement)

### RUN-02.S4 The fetch stops after 10 s
- Given a URL that does not answer in 10 s
- When the API fetches it
- Then the fetch fails; the API returns 422, and the Studio asks for pasted text
- Test: spec (to implement)

### RUN-02.S5 The body is read up to 2 MB
- Given a URL with a body of 3 MB
- When the API reads the body as a stream
- Then it stops at 2 MB and uses only the part it read
- Test: spec (to implement)

### RUN-02.S6 A short article is refused
- Given a URL whose extracted text has fewer than 200 words
- When the API handles the request
- Then it returns 422, and the Studio asks for pasted text
- Test: spec (to implement)

### RUN-02.S7 A long article is cut
- Given a URL whose extracted text has more than 2,000 words
- When the API handles the request
- Then the text is cut at 2,000 words, and the Studio shows a note
- Test: spec (to implement)

## RUN-03 A scene uses only what the registry holds

As the system, I want a model to choose only from closed lists, so that every
layer of a draft exists in the registry. (Derived from AC-3 and the rule
"Models choose, code places".)

Spec: requirements AC-3 · design "2. StoryRun Workflow", "5. Scene runtime", "Storybook DSL"

### RUN-03.S1 A run freezes its inputs at the start
- Given a new run
- When the `freeze` step runs
- Then it records the source revision, the active registry versions, and the current heads as the run basis
- Test: spec (to implement)

### RUN-03.S2 The model schema is built from the frozen registry
- Given a run with a frozen registry and the template list
- When a `scene:<pageId>` step calls the model
- Then the JSON schema it sends is built at run time from the frozen registry and the template list; `ref`, `pose`, `expression`, `slot`, `sfx`, and `templateId` are enums in that schema
- Test: spec (to implement)

### RUN-03.S3 Every layer references the frozen registry
- Given a draft from a run
- When its scenes are read
- Then every layer references a character, pose, expression, or prop that exists in the registry version that the run froze at its start
- Test: spec (to implement)

### RUN-03.S4 An illegal pose and expression pair fails validation
- Given a scene with a character layer whose pose and expression pair is not legal for that character
- When the scene is validated
- Then validation fails for that layer
- Test: spec (to implement)

### RUN-03.S5 A layer in a slot of another kind fails validation
- Given a scene with a layer whose `kind` does not match the `accepts` value of its slot
- When the scene is validated
- Then validation fails for that layer
- Test: spec (to implement)

### RUN-03.S6 A flip on an asset that cannot flip fails validation
- Given a scene with `flip` set on a layer whose asset is not flippable
- When the scene is validated
- Then validation fails for that layer
- Test: spec (to implement)

### RUN-03.S7 A primitive that the renderer does not support fails validation
- Given a scene with `blink` or `wave` on a layer whose renderer is not `svg-rig`, as an animation or as a `play_animation` tap action
- When the scene is validated
- Then validation rejects that primitive
- Test: spec (to implement)

### RUN-03.S8 A target that names no layer fails validation
- Given a scene with an animation or an action whose `target` names no layer of the page
- When the scene is validated
- Then validation fails for that animation or action
- Test: spec (to implement)

### RUN-03.S9 A sound that is not in the registry fails validation
- Given a scene with a `play_sfx` action whose `sfx` is not a key of an active `sfx` asset
- When the scene is validated
- Then validation fails for that action
- Test: spec (to implement)

### RUN-03.S10 A bubble text of more than 60 characters fails validation
- Given a scene with a `show_bubble` action whose text has more than 60 characters
- When the scene is validated
- Then validation fails for that action
- Test: spec (to implement)

### RUN-03.S11 A tap that makes an illegal pair fails validation
- Given a scene with a `set_expression` action where the pair (current pose, new expression) is not legal, or a `set_pose` action where the pair (new pose, current expression) is not legal
- When the scene is validated
- Then validation fails for that action
- Test: spec (to implement)

### RUN-03.S12 Code assigns every layer ID
- Given a scene output in which the model names layers by their slot
- When code stores the scene
- Then code assigns each `instanceId` and rewrites `target` and `on.tap` to those values; no `instanceId` comes from the model
- Test: spec (to implement)

## RUN-04 Code places the layers

As the system, I want code to compute and check every position, so that
faces stay visible and characters do not cover each other. (Derived from the
rule "Models choose, code places".)

Spec: design "4. Layout engine", "Error Handling"

### RUN-04.S1 The engine places each layer from its slot
- Given a valid scene and a layout template
- When the layout engine runs
- Then for each layer it takes the slot, reads the foot point and height of the asset from the registry, and computes `x`, `y`, `scale`, and `z`
- Test: spec (to implement)

### RUN-04.S2 A hidden face fails the face check
- Given a placed scene where a character's face box is outside the stage, or more than 30% covered by a layer with a higher `z`
- When the engine checks the scene
- Then the "Face visible" check fails
- Test: spec (to implement)

### RUN-04.S3 Two characters that overlap too much fail the overlap check
- Given a placed scene where two character boxes overlap by more than 15% of the smaller box
- When the engine checks the scene
- Then the "Overlap" check fails
- Test: spec (to implement)

### RUN-04.S4 A layer too far outside the stage fails the bounds check
- Given a placed scene where a box goes outside the stage by more than 10%
- When the engine checks the scene
- Then the "Bounds" check fails
- Test: spec (to implement)

### RUN-04.S5 The engine shrinks layers before it reports a failure
- Given a placed scene that fails a check
- When the engine shrinks the layers involved step by step, down to the `minScale` of each slot, and checks again
- Then the scene passes if the checks pass at a scale that is not below `minScale`
- Test: spec (to implement)

### RUN-04.S6 A layout that still fails counts as a validation failure
- Given a placed scene that still fails a check with every layer involved at its `minScale`
- When the `scene:<pageId>` step continues
- Then the page counts as a validation failure, and the repair rule of RUN-05 applies
- Test: spec (to implement)

## RUN-05 A failure goes to a person

As the operator, I want a failed page kept with its errors, so that I decide
how to correct it and nothing changes silently. (Derived from AC-4.)

Spec: requirements AC-4 · design "2. StoryRun Workflow", "Error Handling"

### RUN-05.S1 One repair call corrects an invalid scene
- Given a first scene output that fails validation, a provider 429 between the first call and the repair call, and a repair output that passes
- When the `scene:<pageId>` step runs
- Then the model is called two times in total (first, repair); the repair call has `purpose = repair` and carries the error list; the repaired scene is the head
- Test: spec (to implement)

### RUN-05.S2 A scene that still fails is kept as `needs_review`
- Given a scene output that fails validation, and a repair output that also fails
- When the `scene:<pageId>` step ends
- Then the candidate is saved with `status = needs_review` and its errors; no layer is dropped and no character is swapped; there is no second repair
- Test: spec (to implement)

### RUN-05.S3 A script that still fails makes the run fail
- Given a script output that fails validation, and a repair output that also fails
- When the `script` step ends
- Then the run fails with the errors
- Test: spec (to implement)

### RUN-05.S4 A provider 429 or 5xx is retried by the platform
- Given a model step where the provider answers 429 or 5xx
- When the step throws
- Then the platform retries the step: 3 tries, exponential back-off, starting at 10 s; a stored result is not requested again
- Test: spec (to implement)

### RUN-05.S5 Another provider 4xx is not retried
- Given a model step for a page where the provider answers a 4xx that is not 429
- When the step handles the answer
- Then the error is non-retryable, and the page goes to `needs_review` with the provider message
- Test: spec (to implement)

### RUN-05.S6 A failed narration leaves the page without audio
- Given an `audio:<pageId>` step where TTS fails after the retries
- When the run ends
- Then the page has no `audio` head; the run ends at `needs_review`; the Studio offers "regenerate audio"
- Test: spec (to implement)

### RUN-05.S7 A failed run can be started again
- Given a run that failed
- When the operator opens it in the Studio
- Then `run.status` is `failed` with the error; the Studio shows the error and can start a new run with the same scope
- Test: spec (to implement)

## RUN-06 The scene approach holds on real news

As the operator, I want real news texts to pass with the real models, so that
I know the template approach works before the full build. (Derived from the
design, product premise S2.)

Spec: design "Testing Strategy"

### RUN-06.S1 At least 90% of pages pass with at most one repair
- Given 3 real news texts and the real models
- When each text runs through the outline, the page texts, and the scenes
- Then at least 90% of the pages pass validation and layout with at most one repair
- Test: spec (to implement)

### RUN-06.S2 Real model outputs stay valid as fixtures
- Given the model outputs recorded in S2, kept as fixtures
- When a schema changes
- Then the fixtures stay valid, or they are updated on purpose
- Test: spec (to implement)
