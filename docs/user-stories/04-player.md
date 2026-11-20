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
- Test: spec (to implement)

### PLY-01.S2 A page shows its layers on a scaled stage
- Given a release page with `svg-rig`, `svg`, and `webp` layers
- When the Player shows the page
- Then `svg` and `svg-rig` assets are inlined, and `webp` assets are `<img>` elements; the stage is 1600 x 1200 units, scaled to the container with CSS; the backdrop variant of the page is drawn in a frame of 2400 x 1200 units with the stage in the middle; the layers are in a stage container that clips them to 1600 x 1200; one paper texture image is tiled over the frame with `mix-blend-mode: multiply`, and no layer has an SVG filter
- Test: spec (to implement)

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
- Test: spec (to implement)

### PLY-01.S9 A hit area at the stage edge is cut, not moved
- Given a page in play mode, and a tappable layer whose drawn box is 30 x 30 CSS px and touches the left edge of the stage
- When the hit area of the layer is computed
- Then it is 47 CSS px wide and 64 CSS px high: it starts at the left edge of the stage and ends 17 CSS px right of the box; no part of it is outside the stage, and it is not moved to the right
- Test: spec (to implement)

### PLY-01.S10 A drawn box wins over the margin of another layer
- Given two tappable layers, where the margin of the small layer A covers a part of the drawn box of layer B, and A has the higher `z`
- When the child taps a point in that part
- Then the actions of B run, and the actions of A do not
- Test: spec (to implement)

### PLY-01.S11 The higher layer wins between two margins
- Given two tappable layers whose margins overlap, and a point there that is in no drawn box of a tappable layer
- When the child taps that point
- Then the actions of the layer with the higher `z` run
- Test: spec (to implement)

### PLY-01.S12 A box that is wider than the stage is cut at the stage edge
- Given a page in play mode, and a tappable prop whose layout box is 1700 stage units wide and centred on the stage (it passes the bounds check)
- When the hit area of the layer is computed
- Then its drawn box is the layout box cut at the stage edge, 1600 stage units wide; the hit area is that box, no part of it is outside the stage, and nothing is moved
- Test: spec (to implement)

### PLY-01.S13 The keyboard focus is on the layer, not on its margin
- Given a page in play mode, and a small tappable layer that has a margin in the hit layer
- When a keyboard user moves the focus with Tab
- Then the focus is on the layer element, which has the role and the name; the margin element has no role, is not in the tab order, and is hidden from assistive technology
- Test: spec (to implement)

### PLY-01.S14 The focus ring of a layer is drawn in the stage overlay
- Given a stage that is 390 CSS px wide, and a tappable layer whose drawn box touches the left edge of the stage
- When the layer gets the keyboard focus
- Then its focus ring is in the stage overlay, around the drawn box: 3 CSS px Ink, 3 CSS px away, and 3 CSS px Sun yellow, not scaled with the stage; the clip of the stage does not cut it, and it stays inside the stage area
- Test: spec (to implement)

## PLY-02 Each page is read aloud

As a child, I want to hear each page read aloud, so that I can follow the
story without reading.

Spec: requirements US-6 · design "4. Layout engine", "5. Scene runtime" · ADR 0017 "Progress pill in the Wide layout"

### PLY-02.S1 "Start" unlocks the audio
- Given a release open in the Player, with one `<audio>` element for the whole book
- When the child taps "Start"
- Then that tap unlocks the element, and the narration of the first page starts
- Test: spec (to implement)

### PLY-02.S2 A page turn plays the narration of the new page
- Given a book that was started
- When the child taps to turn the page
- Then the tap handler sets the new `src` and calls `play()` in the same handler, and the narration continues on each page turn
- Test: spec (to implement)

### PLY-02.S3 Sound effects use a second shared element
- Given a book that was started
- When a tap runs a `play_sfx` action
- Then the sound plays on a second shared audio element, which is unlocked in the same way
- Test: spec (to implement)

### PLY-02.S4 The narration text is below the stage
- Given a page in the Player
- When the device is in portrait, and then in landscape
- Then the narration is HTML outside the stage, below it in both orientations; the stage keeps 4:3 and is never cropped; the bleed fills the width up to 2:1 and the paper colour fills the rest; the narration font is at least 18 px (ADR 0016)
- Test: spec (to implement)

### PLY-02.S5 No frame part lies over the picture
- Given a reading page in the Player
- When it is shown in the Wide, the Narrow, and the Short layout
- Then no control and no status of the frame (Home, "previous", "next", the progress pill) lies over the picture area
- Test: spec (to implement)

### PLY-02.S6 The frame controls keep their gaps at 900 x 600
- Given the Wide layout at 900 x 600, and a reading page with a 40-word text
- When the page is shown
- Then Home, "previous", "next", and the progress pill are in the gutters, no two of them are less than 12 CSS px apart, and none lies over the picture
- Test: spec (to implement)

## PLY-03 The story runs on phones and tablets

As a child, I want the story to run well on a family phone or tablet, so that
I can read it where I am. (Derived from AC-14 and the performance
requirement.)

Spec: requirements AC-14, "Non-functional Requirements" · design "Testing Strategy"

### PLY-03.S1 The Player works in Safari on iPad and iPhone
- Given a fixture release, and WebKit with the iPad and iPhone profiles
- When the Player runs the release
- Then the pages render; taps fire their actions; reduced motion stops the loops; the audio starts on "Start" and continues on each page turn
- Test: spec (to implement)

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
- Test: spec (to implement)

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
- Test: spec (to implement)

### PLY-04.S15 The `enter` animations of page 1 wait for "Start"
- Given the Start gate in Ready, for a book whose page 1 has a `loop` animation, an `enter` animation, and a tap interaction
- When the child taps "Start"
- Then the `enter` animations of page 1 play once and tap handling starts; before the tap the `loop` animation ran, no `enter` animation ran, and no layer took a tap or the focus
- Test: spec (to implement)

### PLY-04.S16 The picture keeps its size and its place at "Start"
- Given the Narrow layout at 390 x 844, and the Start gate in Ready
- When the child taps "Start"
- Then the picture area has the same size and the same place before and after the tap; the top bar and the control row had their full height in Loading and in Ready
- Test: spec (to implement)

### PLY-04.S17 The Start gate fits its panel in every layout
- Given the viewports 900 x 600 (Wide), 844 x 600 and 375 x 553 (Narrow), and 667 x 375 (Short), and a book with a title of 2 lines
- When the Start gate is shown in Loading, in Ready, and in the Resting state
- Then the text and the button of each state are inside the narration panel; nothing is cut, nothing lies over another part, and nothing scrolls
- Test: spec (to implement)

## PLY-05 A child picks a book from the shelf

As a child, I want to pick a book from a shelf, so that I can choose my
story without help. (Owner decision 2026-11-19, ADR 0017.)

Spec: requirements US-8, AC-17, "Core Features" 6 · design "9. Player screens" (Shelf, Cover, Shelf load check), "5. Scene runtime" (Still mode, Fit), "6. API" (Shelf) · ADR 0017 "Cover", "The shelf screen"

### PLY-05.S1 The shelf is the home of the Player
- Given two published stories
- When a child opens `/`
- Then the Player sends `GET /api/shelf` one time, and shows one book for each story with its title and a cover; the shelf has no Home control
- Test: spec (to implement)

### PLY-05.S2 The shelf waits with dots
- Given a shelf request that has no response yet
- When the shelf is shown
- Then it shows no book and three waiting dots
- Test: spec (to implement)

### PLY-05.S3 A tap on a book opens its release
- Given the shelf with a book whose `releaseId` is `R`
- When the child taps the book
- Then the Player shows `/read/R` with its Start gate; the whole book is the target, and its accessible name is "Open the book" and the title
- Test: spec (to implement)

### PLY-05.S4 The books stand in the order of the response
- Given a shelf response with the books A, B, and C in that order
- When the shelf shows them
- Then A is the first book of the first shelf page, B is the second, and C is the third
- Test: spec (to implement)

### PLY-05.S5 More books than one shelf page
- Given the Wide layout, and a shelf response with 7 books
- When the shelf is shown
- Then the first shelf page shows books 1 to 6, a "previous" round button that is disabled, and a "next" round button; nothing on the shelf scrolls
- Test: spec (to implement)

### PLY-05.S6 "Next" shows the next shelf page
- Given the Wide layout, 7 books, and the first shelf page
- When the child taps "next"
- Then book 7 replaces books 1 to 6 with a 200 ms cross-fade; "next" is disabled and "previous" is enabled
- Test: spec (to implement)

### PLY-05.S7 One shelf page has no arrows
- Given the Wide layout, and a shelf response with 6 books
- When the shelf is shown
- Then "previous" and "next" are not shown
- Test: spec (to implement)

### PLY-05.S8 An empty shelf is quiet
- Given a shelf response of 200 with `{ "books": [] }`
- When the shelf is shown
- Then it shows the shelf of the layout with all its boards and no book, the day sign, and the line "New stories are coming soon."; it has no control and no fault sign
- Test: spec (to implement)

### PLY-05.S9 A shelf that cannot be loaded is quiet
- Given `GET /api/shelf` answers 500
- When the shelf is shown
- Then it shows the shelf of the layout with all its boards and no book, the night sign, the line "The books are sleeping. Come back soon.", and one "Look again" button; it has no fault wording
- Test: spec (to implement)

### PLY-05.S10 "Look again" sends the request again
- Given the shelf in its failed state, and `GET /api/shelf` now answers 200 with one book
- When the child taps "Look again"
- Then the Player sends `GET /api/shelf` again, and shows the book
- Test: spec (to implement)

### PLY-05.S11 A cover is the page 1 scene as a still picture
- Given a book whose first page has a `loop` animation, a layer with an `enter` `fade-in`, and a tap interaction
- When its cover is shown
- Then the cover is that scene drawn with `mode="still"` and `fit="cover"`: the backdrop variant and every layer at its `at`; no animation runs; the `fade-in` layer is visible; no layer takes a tap, has a role, or is in the tab order
- Test: spec (to implement)

### PLY-05.S12 A book shows before its cover is loaded
- Given a book whose cover files are not loaded yet
- When the shelf shows the book
- Then the book shows its title and a picture window in the paper colour, and it can be opened; when every file of the cover is loaded, the picture appears as a whole with a 200 ms fade, and without a fade with `prefers-reduced-motion`
- Test: spec (to implement)

### PLY-05.S13 A cover that fails to load keeps the paper colour
- Given a book whose page 1 JSON request gives 500
- When the shelf shows the book
- Then the picture window stays in the paper colour with no fault sign, and a tap on the book still opens `/read/:releaseId`
- Test: spec (to implement)

### PLY-05.S14 Only the covers of the shown shelf page are loaded
- Given the Wide layout, and a shelf response with 7 books
- When the first shelf page is shown
- Then the Player requests the release files of books 1 to 6 only; it requests the files of book 7 when the second shelf page is shown
- Test: spec (to implement)

### PLY-05.S15 The shelf opens on its first shelf page
- Given 7 books, and a child who opened book 7 from the second shelf page
- When the child taps Home
- Then the shelf shows its first shelf page
- Test: spec (to implement)

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
- Then the Player requests the manifest, the page 1 JSON, the backdrop variant, and the file of the starting pose and expression of each layer; it requests no other page JSON, no audio file, no `sfx` file, and no file of the other pose
- Test: spec (to implement)

### PLY-05.S20 A cover fills its window and is cut at the sides
- Given a book of 180 x 224 CSS px, whose picture window is 151 x 148 CSS px
- When its cover is shown
- Then the stage has the height of the window and is centred in it; the window cuts the stage at the left and the right and shows stage x 188 to 1412 (rounded); no paper colour shows beside the picture, and the picture is not stretched
- Test: spec (to implement)

### PLY-05.S21 The Wide shelf fits 900 x 600
- Given the Wide layout at 900 x 600, and a shelf response with 6 books
- When the shelf is shown
- Then the name and 2 boards of 3 books are inside the viewport and nothing scrolls; each book has its title plate above its picture window, and no part of the plate lies over the window
- Test: spec (to implement)

## PLY-06 A way back to the shelf from every screen of a book

As a child, I want a way back to the shelf from every screen of a book, so
that I am never stuck. (Derived from AC-18, ADR 0017.)

Spec: requirements AC-18 · design "9. Player screens" (Home, Resting), "5. Scene runtime" (Loading, Narration that fails, Frame parts, End page, Late images), "Error Handling"

### PLY-06.S1 Each screen of a book has one Home control
- Given a published release open in the Player
- When the Start gate (Loading, then Ready), the reading page, and the end page are shown in turn
- Then each of them has exactly one Home control, the Home round button in the frame
- Test: spec (to implement)

### PLY-06.S2 Home on the reading page shows the shelf
- Given a book that was started, on page 3, with its narration playing
- When the child taps Home
- Then the narration and any sound effect stop, and the Player shows `/`; there is no question and no overlay
- Test: spec (to implement)

### PLY-06.S3 Home works during a page turn
- Given a forward turn that has run for 200 ms
- When the child taps Home
- Then the narration stops, and the Player shows the shelf
- Test: spec (to implement)

### PLY-06.S4 A book that is opened again shows its Start gate
- Given a child who left a book on page 3 with Home
- When the child opens the same book from the shelf
- Then the Start gate is shown; the Player kept no reading position
- Test: spec (to implement)

### PLY-06.S5 A release that does not exist shows the Resting state
- Given no `release` row with the ID `R`, so that `GET /content/releases/R/manifest.json` gives 404
- When a child opens `/read/R`
- Then the Player shows the Resting state: the Player frame, a night picture from the app bundle (no request is sent for it), the line "This book is sleeping. Come back soon.", and one Home button with a label; it has no "Start", "previous", "next", progress pill, Home round button, or sound; the address stays `/read/R`
- Test: spec (to implement)

### PLY-06.S6 An ID that is not a UUID version 7 shows the Resting state
- Given the path `/read/abc`
- When a child opens it
- Then the Player shows the Resting state
- Test: spec (to implement)

### PLY-06.S7 A file that "Start" waits for fails to load
- Given a release whose manifest loads, and whose request for one page JSON gives 500
- When the Start gate is in Loading
- Then the Player shows the Resting state; "Start" is not enabled, and no request is sent again
- Test: spec (to implement)

### PLY-06.S8 Home in the Resting state shows the shelf
- Given the Resting state
- When the child taps Home
- Then the Player shows `/`
- Test: spec (to implement)

### PLY-06.S9 A slow load does not rest
- Given a release whose page JSON requests have no response for 60 s
- When the Start gate is in Loading for those 60 s
- Then the Player stays in Loading with the Home round button, and does not show the Resting state
- Test: spec (to implement)

### PLY-06.S10 A failed image after "Start" does not rest
- Given a book that was started, and an image of page 3 that fails to load
- When the child turns to page 3
- Then the narration plays and the paper colour shows in place of the image; the Player does not show the Resting state
- Test: spec (to implement)

### PLY-06.S11 A narration that fails after "Start" does not rest
- Given a book that was started, and a narration file of page 2 that gives 404
- When the child turns to page 2
- Then page 2 shows with its picture, its text, and its controls; there is no sound, no fault sign, no thrown error, and no request is sent again by itself; the Player does not show the Resting state, and the child can turn the page
- Test: spec (to implement)

### PLY-06.S12 A backdrop that cannot be decoded shows the Resting state
- Given a release whose manifest and page JSON files load, and whose backdrop variant of page 1 answers 200 with bytes that the browser cannot decode as an image
- When the Start gate is in Loading
- Then the Player shows the Resting state; "Start" is not enabled
- Test: spec (to implement)

### PLY-06.S13 A layer file that the sanitiser refuses shows the Resting state
- Given a release whose manifest and page JSON files load, and whose SVG file of one layer of page 1 answers 200 with a text that cannot be parsed or that the sanitiser refuses
- When the Start gate is in Loading
- Then the Player shows the Resting state; "Start" is not enabled
- Test: spec (to implement)

### PLY-06.S14 A turning sheet does not lie over a frame control
- Given the Wide layout, and a forward turn in which the sheet swings past the left edge of the page panel
- When the element at the middle of Home and at the middle of "previous" is read at each frame of the turn
- Then it is the control every time, and a tap there reaches the control
- Test: spec (to implement)

### PLY-06.S15 Home moves the focus to the shelf
- Given a book on page 3, with the keyboard focus on Home
- When the user activates Home
- Then the focus is on the shelf itself (`main`, `tabindex="-1"`) at once, while the shelf is in its waiting state; the focus does not move when the books arrive, and the next Tab goes to the first book
- Test: spec (to implement)
