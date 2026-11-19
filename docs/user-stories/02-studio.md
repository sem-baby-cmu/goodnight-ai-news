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
- Test: spec (to implement)

### EDT-01.S2 A story view shows heads, page states, and releases
- Given a story with a draft
- When the Studio sends `GET /api/studio/stories/:id`
- Then the response has the heads with their content, a state for each page (`ok`, `stale`, `missing`, or `needs_review`), and the releases
- Test: spec (to implement)

### EDT-01.S3 A changed page text makes the audio and the scene stale
- Given a page whose `audio` and `scene` heads have the basis `page_text:P = T1`
- When the `page_text` head of that page becomes `T2`
- Then the `audio` head and the `scene` head of that page are stale, because a basis entry is not the current head
- Test: spec (to implement)

## EDT-02 Change a page text and regenerate only its audio

As the operator, I want to change the text of one page and regenerate only
that page's audio, so that I keep the parts that are already good.

Spec: requirements US-2, AC-5 · design "3. Calls, revisions, and heads", "6. API", "2. StoryRun Workflow"

### EDT-02.S1 A saved text is a new human revision
- Given a page whose `page_text` head is `T1`
- When the operator sends `PUT /api/studio/stories/:id/pages/:pageId/text` with `{ text, basedOn: T1 }`
- Then a new `page_text` revision with `origin = human` is saved, and the head moves to it by compare-and-set
- Test: spec (to implement)

### EDT-02.S2 A save that is based on an old revision is refused
- Given a page whose head has moved since the operator loaded it
- When the operator saves with the old `basedOn`
- Then the API returns 409 with the current revision
- Test: spec (to implement)

### EDT-02.S3 "Regenerate audio" changes one page only
- Given a draft where the operator changed the text of page 3
- When the operator starts a page run with scope `{ kind: "page", pageId: <page 3>, target: "audio" }`
- Then the run does `freeze`, `audio:<page 3>`, and `finish`; only the audio of page 3 gets a new revision, with the current page text as its basis; all other revisions and heads stay the same
- Test: spec (to implement)

## EDT-03 Regenerate or edit the scene of one page

As the operator, I want to regenerate the scene of one page, so that I can
fix one bad page without a new story.

Spec: requirements US-3, "Core Features" 4 · design "2. StoryRun Workflow", "4. Layout engine", "5. Scene runtime", "6. API"

### EDT-03.S1 "Regenerate scene" runs one step for one page
- Given a draft
- When the operator sends `POST /api/studio/stories/:id/runs` with scope `{ kind: "page", pageId, target: "scene" }`
- Then the run does `freeze`, `scene:<pageId>`, and `finish`, and no other page step
- Test: spec (to implement)

### EDT-03.S2 "Still fits" makes a stale scene current
- Given a page whose scene is stale
- When the operator sends `POST /api/studio/stories/:id/pages/:pageId/scene/still-fits`
- Then the current scene is copied into a new human revision whose basis is the current page text, and the scene is not stale
- Test: spec (to implement)

### EDT-03.S3 An edited scene is validated, laid out, and saved
- Given a page in the editor
- When the operator changes the layout template, a character, a pose or expression, a prop, an animation, or a tap, and sends `PUT /api/studio/stories/:id/pages/:pageId/scene` with `{ scene, basedOn }`
- Then the scene is validated, laid out, and saved as a human `scene` revision whose basis is the current page text
- Test: spec (to implement)

### EDT-03.S4 A scene save that is based on an old revision is refused
- Given a page whose `scene` head has moved since the operator loaded it
- When the operator saves the scene with the old `basedOn`
- Then the API returns 409 with the current revision
- Test: spec (to implement)

### EDT-03.S5 A manual position overrides the slot
- Given a layer for which the operator set an `at` value in the Studio
- When the scene is laid out
- Then the manual `at` value overrides the slot for that layer
- Test: spec (to implement)

### EDT-03.S6 Edit mode has selection boxes and drag handles
- Given `SceneView` with `mode = "edit"`
- When the operator selects a layer and moves it
- Then the stage shows selection boxes and drag handles; `onSelectLayer` gets the `instanceId`, and `onMoveLayer` gets the `instanceId` and the new `at`
- Test: spec (to implement)

## EDT-04 A late result does not replace the operator's work

As the operator, I want my edit to stay when a run finishes later, so that a
result made from old text does not replace my work. (Derived from AC-8.)

Spec: requirements AC-8 · design "3. Calls, revisions, and heads", "Error Handling"

### EDT-04.S1 A scene made from old text is kept as `superseded`
- Given a full run that started `scene:<page 3>` with the basis `page_text:<page 3> = T1`, and an operator who then saved the new text `T2`
- When `scene:<page 3>` commits
- Then the scene revision is kept with `status = superseded`; the head does not move; the Studio shows page 3 as missing a current scene, and the operator can regenerate it
- Test: spec (to implement)
