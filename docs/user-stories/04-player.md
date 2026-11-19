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
- Then `svg` and `svg-rig` assets are inlined, and `webp` assets are `<img>` elements; the stage is 1600 x 1200 units, scaled to the container with CSS; one paper texture image covers the whole stage with `mix-blend-mode: multiply`, and no layer has an SVG filter
- Test: spec (to implement)

### PLY-01.S3 Animations run on their target layers
- Given a page with animations
- When the Player shows the page
- Then each animation runs with the Web Animations API on its layer element, or on the named parts of an `svg-rig` asset
- Test: spec (to implement)

### PLY-01.S4 A tap runs the actions of the layer
- Given a page in play mode with an interaction on a layer
- When the child taps that layer
- Then the actions of the interaction run: `play_animation`, `play_sfx`, `show_bubble`, `set_expression`, or `set_pose`
- Test: spec (to implement)

### PLY-01.S5 A new expression is shown in the way of the renderer
- Given a `set_expression` action on a layer
- When the action runs
- Then on `svg-rig` it swaps the face parts; on `svg` and `webp` it swaps the image
- Test: spec (to implement)

### PLY-01.S6 Reduced motion turns looping animations off
- Given a device with `prefers-reduced-motion` set
- When the Player shows a page with looping animations
- Then the looping animations are off
- Test: spec (to implement)

### PLY-01.S7 A bubble text is shown over the stage
- Given a tap interaction with a `show_bubble` action
- When the child taps its layer
- Then the text of the bubble is an HTML element over the stage; it is not part of the stage image
- Test: spec (to implement)

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

### PLY-02.S4 The narration text is outside the stage
- Given a page in the Player
- When the device is in portrait, and then in landscape
- Then the narration is HTML outside the stage: below it in portrait, beside it in landscape
- Test: spec (to implement)

## PLY-03 The story runs on phones and tablets

As a child, I want the story to run well on a family phone or tablet, so that
I can read it where I am. (Derived from AC-12 and the performance
requirement.)

Spec: requirements AC-12, "Non-functional Requirements" · design "Testing Strategy"

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
