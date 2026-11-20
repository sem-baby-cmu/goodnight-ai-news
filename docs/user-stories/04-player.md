# PLY Player

A child picks a book from the shelf and reads a published release. Conventions: [README](README.md). The
spec decides the expected behaviour.

## PLY-01 Characters move and react to a tap

As a child, I want the characters to move and react when I tap them, so that
the story feels alive.

Spec: requirements US-5, AC-19, "Core Features" 5 · design "4. Layout engine", "5. Scene runtime" (Hit area, Stage overlay)

### PLY-01.S1 The Player reads one release
- Given a published release
- When a child opens `/read/:releaseId`
- Then the Player reads that one release, and shows its pages with animation, narration, and tap reactions
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-01.S2 A page shows its layers on a scaled stage
- Given a release page with `svg-rig`, `svg`, and `webp` layers
- When the Player shows the page
- Then `svg` and `svg-rig` assets are inlined, and `webp` assets are `<img>` elements; the stage is 1600 x 1200 units, scaled to the container with CSS; the backdrop variant of the page is drawn in a frame of 2400 x 1200 units with the stage in the middle; the layers are in a stage container that clips them to 1600 x 1200; one paper texture image is tiled over the frame with `mix-blend-mode: multiply`, and no layer has an SVG filter
- Test: @storybook/scene-runtime · packages/scene-runtime/test/scene-view.test.tsx

### PLY-01.S3 Animations run on their target layers
- Given a page with animations
- When the Player shows the page
- Then each animation runs with the Web Animations API on its layer element, or on the named parts of an `svg-rig` asset
- Test: @storybook/scene-runtime · packages/scene-runtime/test/scene-view.test.tsx

### PLY-01.S4 A tap runs the actions of the layer
- Given a page in play mode with an interaction on a layer
- When the child taps that layer
- Then the actions of the interaction run: `play_animation`, `play_sfx`, `show_bubble`, `set_expression`, or `set_pose`
- Test: @storybook/scene-runtime · packages/scene-runtime/test/scene-view.test.tsx

### PLY-01.S5 A new expression is shown in the way of the renderer
- Given a `set_expression` action on a layer
- When the action runs
- Then on `svg-rig` it swaps the face parts; on `svg` and `webp` it swaps the image
- Test: @storybook/scene-runtime · packages/scene-runtime/test/scene-view.test.tsx

### PLY-01.S6 Reduced motion turns looping animations off
- Given a device with `prefers-reduced-motion` set
- When the Player shows a page with looping animations
- Then the looping animations are off
- Test: @storybook/scene-runtime · packages/scene-runtime/test/scene-view.test.tsx

### PLY-01.S7 A bubble text is shown over the stage
- Given a tap interaction with a `show_bubble` action
- When the child taps its layer
- Then the text of the bubble is an HTML element over the stage; it is not part of the stage image
- Test: @storybook/scene-runtime · packages/scene-runtime/test/scene-view.test.tsx

### PLY-01.S8 A small tappable layer has a hit area of 64 x 64 CSS px
- Given a page in play mode, and a tappable layer whose drawn box is 30 x 40 CSS px on the screen and is not near the stage edge
- When the child taps a point 10 CSS px outside the box
- Then the actions of the layer run; its hit area is 64 x 64 CSS px, centred on the box
- Test: @storybook/scene-runtime · packages/scene-runtime/test/browser/hit-layer.browser.test.tsx

### PLY-01.S9 A hit area at the stage edge is cut, not moved
- Given a page in play mode, and a tappable layer whose drawn box is 30 x 30 CSS px and touches the left edge of the stage
- When the hit area of the layer is computed
- Then it is 47 CSS px wide and 64 CSS px high: it starts at the left edge of the stage and ends 17 CSS px right of the box; no part of it is outside the stage, and it is not moved to the right
- Test: @storybook/scene-runtime · packages/scene-runtime/test/hit-area.test.ts

### PLY-01.S10 A drawn box wins over the margin of another layer
- Given two tappable layers, where the margin of the small layer A covers a part of the drawn box of layer B, and A has the higher `z`
- When the child taps a point in that part
- Then the actions of B run, and the actions of A do not
- Test: @storybook/scene-runtime · packages/scene-runtime/test/browser/hit-layer.browser.test.tsx

### PLY-01.S11 The higher layer wins between two margins
- Given two tappable layers whose margins overlap, and a point there that is in no drawn box of a tappable layer
- When the child taps that point
- Then the actions of the layer with the higher `z` run
- Test: @storybook/scene-runtime · packages/scene-runtime/test/browser/hit-layer.browser.test.tsx

### PLY-01.S12 A box that is wider than the stage is cut at the stage edge
- Given a page in play mode, and a tappable prop whose layout box is 1700 stage units wide and centred on the stage (it passes the bounds check)
- When the hit area of the layer is computed
- Then its drawn box is the layout box cut at the stage edge, 1600 stage units wide; the hit area is that box, no part of it is outside the stage, and nothing is moved
- Test: @storybook/scene-runtime · packages/scene-runtime/test/hit-area.test.ts

### PLY-01.S13 The keyboard focus is on the layer, not on its margin
- Given a page in play mode, and a small tappable layer that has a margin in the hit layer
- When a keyboard user moves the focus with Tab
- Then the focus is on the layer element, which has the role and the name; the margin element has no role, is not in the tab order, and is hidden from assistive technology
- Test: @storybook/scene-runtime · packages/scene-runtime/test/scene-view.test.tsx

### PLY-01.S14 The focus ring of a layer is drawn in the stage overlay
- Given a stage that is 390 CSS px wide, and a tappable layer whose drawn box touches the left edge of the stage
- When the layer gets the keyboard focus
- Then its focus ring is in the stage overlay, around the drawn box: 3 CSS px Ink, 3 CSS px away, and 3 CSS px Sun yellow, not scaled with the stage; the clip of the stage does not cut it, and it stays inside the stage area
- Test: @storybook/scene-runtime · packages/scene-runtime/test/browser/hit-layer.browser.test.tsx

## PLY-02 Each page is read aloud

As a child, I want to hear each page read aloud, so that I can follow the
story without reading.

Spec: requirements US-6 · design "4. Layout engine", "5. Scene runtime" (Audio, Sound-effect unlock) · ADR 0017 "Progress pill in the Wide layout", "Unlock of the sound-effect element (decision 25)"

### PLY-02.S1 "Start" unlocks the audio
- Given a release open in the Player, with one `<audio>` element for the narration of the whole book
- When the child taps "Start"
- Then that tap unlocks the element, and the narration of the first page starts
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-02.S2 A page turn plays the narration of the new page
- Given a book that was started
- When the child taps to turn the page
- Then the tap handler sets the new `src` and calls `play()` in the same handler, and the narration continues on each page turn
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-02.S3 Sound effects use a second shared element
- Given a book that was started
- When a tap runs a `play_sfx` action
- Then the sound plays on a second shared audio element, the one that "Start" unlocked with the silent clip (PLY-02.S7); it is the same DOM element as on the Start gate, and the narration element is too; the narration element keeps its `src` and goes on
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-02.S4 The narration text is below the stage
- Given a page in the Player
- When the device is in portrait, and then in landscape
- Then the narration is HTML outside the stage, below it in both orientations; the stage keeps 4:3 and is never cropped; the bleed fills the width up to 2:1 and the paper colour fills the rest; the narration font is at least 18 px (ADR 0016)
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-02.S5 No frame part lies over the picture
- Given a reading page in the Player
- When it is shown in the Wide, the Narrow, and the Short layout
- Then no control and no status of the frame (Home, "previous", "next", the progress pill) lies over the picture area
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-02.S6 The frame controls keep their gaps at 900 x 600
- Given the Wide layout at 900 x 600, and a reading page with a 40-word text
- When the page is shown
- Then Home, "previous", "next", and the progress pill are in the gutters, no two of them are less than 12 CSS px apart, and none lies over the picture
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-02.S7 "Start" plays a silent clip on the sound-effect element
- Given a release open in the Player, in the Ready state
- When the child taps "Start"
- Then the handler of that tap calls `play()` on the narration element with the narration of page 1, and then `play()` on the sound-effect element with the silent clip of the app, both before it returns; the clip is a `data:audio/wav` URL of a PCM WAV file with 1 sample or more, and no request is sent for it
- Test: @storybook/app · apps/storybook/src/player/BookRoute.test.tsx

### PLY-02.S8 A silent clip that cannot play shows nothing
- Given a browser that rejects the `play()` of the silent clip
- When the child taps "Start"
- Then the narration of page 1 starts, and the reading page shows; there is no fault sign, no thrown error, and no second try
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-02.S9 A sound effect that cannot play is quiet
- Given a book that was started, and a tap with a `play_sfx` action and a `show_bubble` action (`target`: a layer of the page, `text`: "Hello!"), where the `sfx` file gives 404
- When the child taps the layer
- Then the bubble of the `show_bubble` action shows "Hello!" at its target layer; there is no sound effect, no fault sign, no thrown error, and no second try; the narration goes on
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

## PLY-03 The story runs on phones and tablets

As a child, I want the story to run well on a family phone or tablet, so that
I can read it where I am. (Derived from AC-14 and the performance
requirement.)

Spec: requirements AC-14, "Non-functional Requirements" · design "Testing Strategy"

### PLY-03.S1 The Player works in Safari on iPad and iPhone
- Given a fixture release, and WebKit with the iPad and iPhone profiles
- When the Player runs the release
- Then the pages render; taps fire their actions; reduced motion stops the loops; the audio starts on "Start" and continues on each page turn
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-03.S2 The Player works in Chrome on Android
- Given a published release, and current Chrome on an Android device
- When a person reads the release
- Then the pages render, the taps react, and the narration plays
- Test: manual · not run

### PLY-03.S3 An animated page holds the frame time target
- Given an animated page on a mid-range phone
- When the frame time is measured
- Then the frame time p95 is 33 ms or less
- Test: manual · not run

### PLY-03.S4 The assets of a page load in 2 s on 4G
- Given a page of a published release, on a throttled 4G profile
- When the page loads
- Then its assets load in 2 s or less
- Test: manual · not run

### PLY-03.S5 A sound effect plays after "Start" on an iPad and an iPhone
- Given a published release whose page 1 has a tap with a `play_sfx` action, on a real iPad and a real iPhone in Safari
- When a person taps "Start" and then taps that layer while the narration plays
- Then the sound effect is heard, and the narration goes on; the record names each device and its iOS version
- Test: manual · not run

## PLY-04 A page turns like a page of a book

As a child, I want the page to turn like paper when I go on, so that the
story feels like a real book. (Owner decision 2026-11-19, ADR 0016.)

Spec: requirements "Core Features" 5 · design "5. Scene runtime" (Loading, Start gate) · ADR 0017 "Start gate and stage overlay"

### PLY-04.S1 A forward turn shows the page-turn transition
- Given a book that was started, on page 2
- When the child taps "next"
- Then the page sheet (backdrop frame, stage, and narration on opaque paper) turns about the left edge of the page panel for 500 ms and shows page 3 below it; the transition changes only `transform` and `opacity`
- Test: spec (to implement)

### PLY-04.S2 A backward turn runs the other way
- Given a book that was started, on page 3
- When the child taps "previous"
- Then page 2 turns back over page 3 for 500 ms
- Test: spec (to implement)

### PLY-04.S3 The narration does not wait for the turn
- Given a book that was started
- When the child taps "next"
- Then the tap handler sets the `src` of the new page and calls `play()` before the transition ends
- Test: spec (to implement)

### PLY-04.S4 Loops stop when the turn starts
- Given a page with looping animations and a next page with `enter` animations
- When the child taps "next"
- Then the looping animations and bubbles of the old page stop when the turn starts; the `enter` animations of the new page run once, when it is `current` and its assets are loaded; a layer with an `enter` `fade-in` is hidden until then
- Test: spec (to implement)

### PLY-04.S5 A tap during a turn starts the next turn
- Given a forward turn from page 2 to page 3 that has run for 200 ms
- When the child taps "next" again
- Then the turn to page 3 ends at once, the turn to page 4 starts, and the narration of page 4 plays
- Test: spec (to implement)

### PLY-04.S6 Reduced motion gives a cross-fade
- Given a device with `prefers-reduced-motion` set
- When the child taps "next"
- Then the new page cross-fades in for 200 ms, with no rotation
- Test: spec (to implement)

### PLY-04.S7 A page whose images are not loaded yet still shows
- Given a next page whose images are not loaded
- When the child turns to it
- Then its narration text and the paper colour show at once (not a sky colour), and each image fades in for 200 ms when it is loaded; with reduced motion it appears without a fade
- Test: spec (to implement)

### PLY-04.S8 "Previous" during a forward turn turns back from the current page
- Given a forward turn from page 2 to page 3 that has run for 200 ms
- When the child taps "previous"
- Then the turn to page 3 ends at once, a backward turn from page 3 to page 2 starts, and the narration of page 2 plays
- Test: spec (to implement)

### PLY-04.S9 Taps on layers are ignored during a turn
- Given a turn that is running
- When the child taps a character that has a tap interaction
- Then no action runs
- Test: spec (to implement)

### PLY-04.S10 "Start" waits for the page data
- Given a release whose manifest is loaded and whose page JSON files are still loading
- When the Start gate is shown
- Then "Start" is enabled only when every page JSON and the first-page files are loaded: the backdrop variant of page 1, the file of the starting pose and expression of each layer of page 1, and the paper texture
- Test: @storybook/app · apps/storybook/src/player/BookRoute.test.tsx

### PLY-04.S11 "Next" on the last page turns to the end page
- Given a book that was started, on its last page, with its narration playing
- When the child taps "next"
- Then the narration stops, no new `src` is set, and the page turns to an end page with the backdrop of the last page in its sky, no layers, "The end", "Read again", and "previous"; the end page has no "next" and no progress pill, and it has the Home round button (ADR 0017)
- Test: spec (to implement)

### PLY-04.S12 "Read again" starts page 1 without the Start gate
- Given the end page
- When the child taps "Read again"
- Then the tap handler sets the `src` of page 1 and calls `play()`, page 1 replaces the end page with a 200 ms cross-fade, and the Start gate is not shown; a tap on "next" during the cross-fade ends it at once and turns to page 2
- Test: spec (to implement)

### PLY-04.S13 "Previous" on the end page returns to the last page
- Given the end page, or the turn to it that has run for 200 ms
- When the child taps "previous"
- Then the page turns back to the last page, and the tap handler sets its `src` and calls `play()`
- Test: spec (to implement)

### PLY-04.S14 "Start" does not wait for audio
- Given a release whose manifest, page JSON files, and first-page files are loaded, and whose narration and `sfx` requests have no response
- When the Start gate is shown
- Then "Start" is enabled; the Player waits for no audio file, no `sfx` file, no swap file of a tap, and no file of another page
- Test: @storybook/app · apps/storybook/src/player/BookRoute.test.tsx

### PLY-04.S15 The `enter` animations of page 1 wait for "Start"
- Given the Start gate in Ready, for a book whose page 1 has a `loop` animation, an `enter` animation, and a tap interaction
- When the child taps "Start"
- Then the `enter` animations of page 1 play once and tap handling starts; before the tap the `loop` animation ran, no `enter` animation ran, and no layer took a tap or the focus
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-04.S16 The picture keeps its size and its place at "Start"
- Given the Narrow layout at 390 x 844, and the Start gate in Ready
- When the child taps "Start"
- Then the picture area has the same size and the same place before and after the tap, and the narration panel has the same height; the top bar and the control row had their full height (84 px each) in Loading and in Ready
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-04.S17 The Start gate fits its panel in every layout
- Given the viewports 900 x 600 (Wide), 844 x 600 and 375 x 553 (Narrow), and 667 x 375 (Short), and a book with a title of 2 lines
- When the Start gate is shown in Loading, in Ready, and in the Resting state
- Then the text and the button of each state are inside the narration panel; nothing is cut, nothing lies over another part, and nothing scrolls
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-04.S18 The panel has the height of the longest page before Ready
- Given the Narrow layout at 390 x 844, and a book with one legal page of 40 words whose text needs more lines than the reference text of the Player
- When the Start gate changes from Loading to Ready
- Then the narration panel has the height of that page in Ready, on every page, and on the end page; the whole text of that page shows, nothing is cut, and nothing scrolls; the picture area has the same size from Ready on
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

## PLY-05 A child picks a book from the shelf

As a child, I want to pick a book from a shelf, so that I can choose my
story without help. (Owner decision 2026-11-19, ADR 0017.)

Spec: requirements US-8, AC-17, "Core Features" 6 · design "9. Player screens" (Shelf, Cover, Shelf load check), "5. Scene runtime" (Still mode, Fit), "6. API" (Shelf), "8. Asset pipeline" (Cover files) · ADR 0017 "Cover", "The shelf screen", "Cover file (decision 17)"

### PLY-05.S1 The shelf is the home of the Player
- Given two published stories
- When a child opens `/`
- Then the Player sends `GET /api/shelf` one time, and shows one book for each story with its title and a cover; the shelf has no Home control
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S2 The shelf waits with dots
- Given a shelf request that has no response yet
- When the shelf is shown
- Then it shows no book and three waiting dots
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S3 A tap on a book opens its release
- Given the shelf with a book whose `releaseId` is `R`
- When the child taps the book
- Then the Player shows `/read/R` with its Start gate; the whole book is the target, and its accessible name is "Open the book" and the title
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S4 The books stand in the order of the response
- Given a shelf response with the books A, B, and C in that order
- When the shelf shows them
- Then A is the first book of the first shelf page, B is the second, and C is the third
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S5 More books than one shelf page
- Given the Wide layout, and a shelf response with 7 books
- When the shelf is shown
- Then the first shelf page shows books 1 to 6, a "previous" round button that is disabled, and a "next" round button; nothing on the shelf scrolls
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S6 "Next" shows the next shelf page
- Given the Wide layout, 7 books, and the first shelf page
- When the child taps "next"
- Then book 7 replaces books 1 to 6 with a 200 ms cross-fade; "next" is disabled and "previous" is enabled
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S7 One shelf page has no arrows
- Given the Wide layout, and a shelf response with 6 books
- When the shelf is shown
- Then "previous" and "next" are not shown
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S8 An empty shelf is quiet
- Given a shelf response of 200 with `{ "books": [] }`
- When the shelf is shown
- Then it shows the shelf of the layout with all its boards and no book, the day sign, and the line "New stories are coming soon."; it has no control and no fault sign
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S9 A shelf that cannot be loaded is quiet
- Given `GET /api/shelf` answers 500
- When the shelf is shown
- Then it shows the shelf of the layout with all its boards and no book, the night sign, the line "The books are sleeping. Come back soon.", and one "Look again" button; it has no fault wording
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S10 "Look again" sends the request again
- Given the shelf in its failed state, and `GET /api/shelf` now answers 200 with one book
- When the child taps "Look again"
- Then the Player sends `GET /api/shelf` again, and shows the book
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S11 A cover is the page 1 scene as a still picture
- Given a book whose first page has a `loop` animation, a layer with an `enter` `fade-in`, and a tap interaction
- When its cover is shown
- Then the cover is that scene drawn with `mode="still"` and `fit="cover"`: the backdrop variant and every layer at its `at`; no animation runs; the `fade-in` layer is visible; no layer takes a tap, has a role, or is in the tab order
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S12 A book shows before its cover is loaded
- Given a book whose cover files are not loaded yet
- When the shelf shows the book
- Then the book shows its title and a picture window in the paper colour, and it can be opened; when every file of the cover is loaded, the picture appears as a whole with a 200 ms fade, and without a fade with `prefers-reduced-motion`
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S13 A cover that fails to load keeps the paper colour
- Given a book whose page 1 JSON request gives 500
- When the shelf shows the book
- Then the picture window stays in the paper colour with no fault sign, and a tap on the book still opens `/read/:releaseId`
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S14 Only the covers of the shown shelf page are loaded
- Given the Wide layout, and a shelf response with 7 books
- When the first shelf page is shown
- Then the Player requests the release files of books 1 to 6 only; it requests the files of book 7 when the second shelf page is shown
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S15 The shelf opens on its first shelf page
- Given 7 books, and a child who opened book 7 from the second shelf page
- When the child taps Home
- Then the shelf shows its first shelf page
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S16 The first shelf page loads in 2 s on 4G
- Given the Wide layout, and 6 books, each a different release whose page 1 uses a painted backdrop at full size; an empty cache; the throttled 4G profile of PLY-03.S4; the shelf is not public yet
- When the shelf loads
- Then the time from the start of the `GET /api/shelf` request to the drawing of the last of the 6 covers is 2 s or less; the record has the time, the number of requests, and the bytes
- Test: manual · not run

### PLY-05.S17 The shelf loads in 2 s on a phone in portrait
- Given a real phone in portrait (the Narrow layout), and the books, the cache, and the profile of PLY-05.S16
- When the shelf loads
- Then the time to the drawing of the last cover of the first shelf page is 2 s or less, and the browser does not reload the tab while the shelf shows its covers
- Test: manual · not run

### PLY-05.S18 The shelf loads in 2 s on a phone in landscape
- Given a real phone in landscape (the Short layout), and the books, the cache, and the profile of PLY-05.S16
- When the shelf loads
- Then the time to the drawing of the last cover of the first shelf page is 2 s or less, and the browser does not reload the tab while the shelf shows its covers
- Test: manual · not run

### PLY-05.S19 A cover loads only the files of its picture
- Given a book whose page 1 has a tap interaction with a `set_pose` action and a `play_sfx` action, and a narration
- When its cover is loaded
- Then the Player requests the manifest, the page 1 JSON, the backdrop variant (or its cover file, PLY-05.S22), and the file of the starting pose and expression of each layer; it requests no other page JSON, no audio file, no `sfx` file, and no file of the other pose
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S20 A cover fills its window and is cut at the sides
- Given a book of 180 x 224 CSS px, whose picture window is 151 x 148 CSS px
- When its cover is shown
- Then the stage has the height of the window and is centred in it; the window cuts the stage at the left and the right and shows stage x 188 to 1412 (rounded); no paper colour shows beside the picture, and the picture is not stretched
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S21 The Wide shelf fits 900 x 600
- Given the Wide layout at 900 x 600, and a shelf response with 6 books
- When the shelf is shown
- Then the name and 2 boards of 3 books are inside the viewport and nothing scrolls; each book has its title plate above its picture window, and no part of the plate lies over the window
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-05.S22 A cover draws the cover file of its backdrop
- Given a release whose page 1 JSON holds, in `assets`, a backdrop manifest that names a `coverFile` for the variant of page 1
- When the cover of the book is loaded on the shelf
- Then the Player requests that cover file and draws it as the backdrop; it does not request the `file` of the variant, and it requests no asset manifest
- Test: spec (to implement)

### PLY-05.S23 A cover with no cover file draws the full-size backdrop
- Given a release whose page 1 JSON holds a backdrop manifest that names no `coverFile`
- When the cover of the book is loaded on the shelf
- Then the Player requests the `file` of the variant and draws it, as before
- Test: spec (to implement)

### PLY-05.S24 A book draws the full-size backdrop
- Given the release of PLY-05.S22
- When a child opens the book, and the Start gate loads
- Then the Player requests the `file` of the variant for page 1, and the picture of the Start gate and of the reading page uses it, not the cover file
- Test: spec (to implement)

### PLY-05.S25 After a failed shelf load check, the check runs again with cover files
- Given a record in which PLY-05.S16, PLY-05.S17, or PLY-05.S18 failed; and 6 books that were published again, each with a painted backdrop version that has cover files
- When the three checks run again
- Then each time is 2 s or less; the record has both runs, with the time, the number of requests, and the bytes of each; if a check fails again, the shelf does not go public
- Test: manual · not run

## PLY-06 A way back to the shelf from every screen of a book

As a child, I want a way back to the shelf from every screen of a book, so
that I am never stuck. (Derived from AC-18, ADR 0017.)

Spec: requirements AC-18, AC-20, AC-21 · design "9. Player screens" (Home, Resting, A book that was taken off the shelf, Unknown path), "5. Scene runtime" (Loading, Narration that fails, Frame parts, End page, Late images), "Error Handling"

### PLY-06.S1 Each screen of a book has one Home control
- Given a published release open in the Player
- When the Start gate (Loading, then Ready), the reading page, and the end page are shown in turn
- Then each of them has exactly one Home control, the Home round button in the frame
- Test: spec (to implement)

### PLY-06.S2 Home on the reading page shows the shelf
- Given a book that was started, on page 3, with its narration playing
- When the child taps Home
- Then the narration and any sound effect stop, and the Player shows `/`; there is no question and no overlay
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S3 Home works during a page turn
- Given a forward turn that has run for 200 ms
- When the child taps Home
- Then the narration stops, and the Player shows the shelf
- Test: spec (to implement)

### PLY-06.S4 A book that is opened again shows its Start gate
- Given a child who left a book on page 3 with Home
- When the child opens the same book from the shelf
- Then the Start gate is shown; the Player kept no reading position
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-06.S5 A release that does not exist shows the Resting state
- Given no `release` row with the ID `R`, so that `GET /content/releases/R/manifest.json` gives 404
- When a child opens `/read/R`
- Then the Player shows the Resting state: the Player frame, a night picture from the app bundle (no request is sent for it), the line "This book is sleeping. Come back soon.", and one Home button with a label; it has no "Start", "previous", "next", progress pill, Home round button, or sound; the address stays `/read/R`
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S6 An ID that is not a UUID version 7 shows the Resting state
- Given the path `/read/abc`
- When a child opens it
- Then the Player shows the Resting state
- Test: @storybook/app · apps/storybook/src/player/loadRelease.test.tsx

### PLY-06.S7 A file that "Start" waits for fails to load
- Given a release whose manifest loads, and whose request for one page JSON gives 500
- When the Start gate is in Loading
- Then the Player shows the Resting state; "Start" is not enabled, and no request is sent again
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S8 Home in the Resting state shows the shelf
- Given the Resting state
- When the child taps Home
- Then the Player shows `/`
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S9 A slow load does not rest
- Given a release whose page JSON requests have no response for 60 s
- When the Start gate is in Loading for those 60 s
- Then the Player stays in Loading with the Home round button, and does not show the Resting state
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S10 A failed image after "Start" does not rest
- Given a book that was started, and an image of page 3 that fails to load
- When the child turns to page 3
- Then the narration plays and the paper colour shows in place of the image; the Player does not show the Resting state
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S11 A narration that fails after "Start" does not rest
- Given a book that was started, and a narration file of page 2 that gives 404
- When the child turns to page 2
- Then page 2 shows with its picture, its text, and its controls; there is no sound, no fault sign, no thrown error, and no request is sent again by itself; the Player does not show the Resting state, and the child can turn the page
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S12 A backdrop that cannot be decoded shows the Resting state
- Given a release whose manifest and page JSON files load, and whose backdrop variant of page 1 answers 200 with bytes that the browser cannot decode as an image
- When the Start gate is in Loading
- Then the Player shows the Resting state; "Start" is not enabled
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S13 A layer file that the sanitiser refuses shows the Resting state
- Given a release whose manifest and page JSON files load, and whose SVG file of one layer of page 1 answers 200 with a text that cannot be parsed or that the sanitiser refuses
- When the Start gate is in Loading
- Then the Player shows the Resting state; "Start" is not enabled
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S14 A turning sheet does not lie over a frame control
- Given the Wide layout, and a forward turn in which the sheet swings past the left edge of the page panel
- When the element at the middle of Home and at the middle of "previous" is read at each frame of the turn
- Then it is the control every time, and a tap there reaches the control
- Test: spec (to implement)

### PLY-06.S15 Home moves the focus to the shelf
- Given a book on page 3, with the keyboard focus on Home
- When the user activates Home
- Then the focus is on the shelf itself (`main`, `tabindex="-1"`) at once, while the shelf is in its waiting state; the focus does not move when the books arrive, and the next Tab goes to the first book
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-06.S16 A release that was taken off the shelf shows the Resting state
- Given a release `R` of a story that was taken off the shelf, so that `GET /content/releases/R/manifest.json` gives 404
- When a child opens `/read/R`
- Then the Player shows the Resting state of PLY-06.S5; no page text, no picture, and no sound of the book is shown or played
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S17 A withdrawn book that the browser holds shows the Resting state
- Given a browser that read release `R` before, so that its HTTP cache holds the files of `R`; the story was then taken off the shelf
- When a child opens `/read/R`
- Then the Player requests `manifest.json` first, with the fetch cache mode `no-cache`; the content route answers 404, and the Player shows the Resting state; it requests and shows no other file of `R`
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S18 A book that is open stays open after a take-off
- Given a book that was started, on page 2; the story is then taken off the shelf, so that the narration file of page 3 gives 404
- When the child turns to page 3
- Then page 3 shows with its text and its controls and no sound; the Player does not show the Resting state
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S19 A path that matches no route shows the shelf
- Given the paths `/abc`, `/read`, and `/read/<a release ID>/more`
- When a child opens each of them
- Then the Player shows the shelf each time; the address is `/`, and the history has no new entry for it
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-06.S20 A book in Ready stays open after a take-off
- Given a release open in the Player, in the Ready state; the story is then taken off the shelf, so that the narration file of page 1 gives 404
- When the child taps "Start"
- Then page 1 shows with its text, its picture, and its controls, and no sound; the Player sends no new request for `manifest.json`, and it does not show the Resting state
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

## PLY-07 Every viewport has a layout

As a child, I want the book to fit the screen that I hold, so that no
control and no text is cut. (Derived from AC-22, ADR 0017 decision 18.)

Spec: requirements AC-22 · design "9. Player screens" (Small screen), "5. Scene runtime" (Frame parts) · ADR 0017 "Low viewports and the Small screen state (decision 18)"

### PLY-07.S1 A viewport under 365 px high uses the Short layout
- Given a reading page in a viewport of 568 x 320
- When the page is shown
- Then the layout is Short: a control rail at each side, no top bar, and no control row; Home, "previous", "next", and the progress pill are whole and inside the viewport
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-07.S2 A 40-word page fits at 568 x 320
- Given a reading page with a 40-word text in a viewport of 568 x 320
- When the page is shown
- Then the whole text shows at 18 px or more, nothing scrolls, no frame part lies over the picture area, and the picture area is 64 CSS px high or more
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-07.S3 The Start gate of a Short viewport under 640 px wide is a stack
- Given a release in the Ready state in a viewport of 568 x 320
- When the Start gate is shown
- Then the title stands above the Start button; both are whole and inside the panel, and the Home round button is whole
- Test: @storybook/app · apps/storybook/e2e/player.spec.ts

### PLY-07.S4 The shelf at 568 x 320 has 2 books
- Given a shelf response with 6 books, in a viewport of 568 x 320
- When the shelf is shown
- Then the shelf page has 2 books on 1 board, each 128 CSS px wide or more; the arrows are shown, and nothing scrolls; the name "Lullabyte" is whole and lies on the ground, and the shelf screen has no Paper rail
- Test: @storybook/app · apps/storybook/e2e/shelf.spec.ts

### PLY-07.S5 A viewport that cannot hold the frame shows the Small screen state
- Given a release in a viewport of 400 x 300
- When a child opens `/read/<releaseId>`
- Then the Player shows the Small screen state: the paper colour, the sign of a book in a frame with four arrows that point outward, and the line "This screen is too small for the book."; it has exactly one control, the Home round button, and it starts no sound; Home is whole, 16 CSS px from the top and from the left; the sign and the line stand right of Home and do not lie over it, and the sign takes no tap and no focus; no part of the book frame is drawn
- Test: spec (to implement)

### PLY-07.S6 The Small screen state keeps the page and the narration
- Given a book on page 3 in a viewport of 667 x 375, with its narration playing
- When the viewport changes to 400 x 300, and then back to 667 x 375
- Then at 400 x 300 the Small screen state shows and the narration goes on; at 667 x 375 page 3 shows again as it was, and no release file is requested again
- Test: spec (to implement)

### PLY-07.S7 A small picture is not a Small screen
- Given a reading page with the 40-word reference text of the Player in a viewport of 320 x 480
- When the page is shown
- Then the Narrow layout shows with the whole text and every frame control; the picture area is 64 CSS px high or more, and the Small screen state is not shown
- Test: spec (to implement)

### PLY-07.S8 The shelf shows the Small screen state
- Given a viewport of 240 x 200, which cannot hold the name, one book of 128 x 159 CSS px on a board, and the arrows
- When a child opens `/`
- Then the Player shows the Small screen state with no control; when the viewport changes to 568 x 320, the shelf shows with its books
- Test: spec (to implement)

### PLY-07.S9 The Small screen state takes the focus and gives it back
- Given a reading page with the keyboard focus on "next"
- When the viewport changes so that the Small screen state shows, and then so that it ends
- Then the focus is on the state itself (`main`, `tabindex="-1"`) while it shows, the next Tab goes to Home, and no control of the page takes a tap, a key, or the focus; when it ends, the focus is on the `main` of the reading page
- Test: spec (to implement)

### PLY-07.S10 Home in the Small screen state shows the shelf
- Given a book on page 3 with its narration playing, in a viewport of 400 x 300, so that the Small screen state shows
- When the child taps Home
- Then the narration stops, and the Player shows `/`
- Test: spec (to implement)

### PLY-07.S11 A picture area under 64 CSS px shows the Small screen state
- Given a release in a viewport of 500 x 365, where the top bar, the control row, and the narration panel of the Narrow layout take the whole height
- When a child opens `/read/<releaseId>`
- Then the Player shows the Small screen state with the Home round button; the Narrow layout is not drawn with a picture area under 64 CSS px
- Test: spec (to implement)

### PLY-07.S12 A shelf plate that does not fit shows the Small screen state
- Given `GET /api/shelf` answers 500, in a viewport of 320 x 400, which cannot hold the plate of the Failed state uncut between the name band and the arrow row
- When a child opens `/`
- Then the Player shows the Small screen state with no control, and no part of the plate is drawn; when the viewport changes to 390 x 844, the shelf shows the plate with its "Look again" button
- Test: spec (to implement)
