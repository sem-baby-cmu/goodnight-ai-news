# PLY Player

A child reads a published release. Conventions: [README](README.md). The
spec decides the expected behaviour.

## PLY-01 Characters move and react to a tap

As a child, I want the characters to move and react when I tap them, so that
the story feels alive.

Spec: requirements US-5, "Core Features" 5 · design "4. Layout engine", "5. Scene runtime"

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

## PLY-02 Each page is read aloud

As a child, I want to hear each page read aloud, so that I can follow the
story without reading.

Spec: requirements US-6 · design "4. Layout engine", "5. Scene runtime"

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

Spec: requirements "Core Features" 5 · design "5. Scene runtime"

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
- Then "Start" is enabled only when every page JSON and the assets of page 1 are loaded
- Test: spec (to implement)

### PLY-04.S11 "Next" on the last page turns to the end page
- Given a book that was started, on its last page, with its narration playing
- When the child taps "next"
- Then the narration stops, no new `src` is set, and the page turns to an end page with the backdrop of the last page in its sky, no layers, "The end", "Read again", and "previous"; the end page has no "next", no progress pill, and no Home control while the shelf does not exist
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
