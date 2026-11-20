# REG Character registry and assets

Characters, props, scenery, and sounds as versioned registry rows.
Conventions: [README](README.md). The spec decides the expected behaviour.

## REG-01 Replace a character asset with a new version

As the designer, I want to replace a character asset with a new version, so
that new stories use it and old releases stay the same.

Spec: requirements US-7, "Core Features" 3 · design "2. StoryRun Workflow", "8. Asset pipeline", "D1 tables", "6. API"

### REG-01.S1 The registry holds every Producer character
- Given the asset pipeline has published the Producer boards
- When the registry is read
- Then all 13 Producer characters, their props, and their poses and expressions are rows in the database with versioned asset files; each asset has a unique readable `key`
- Test: @storybook/assets-tools · tools/assets/test/build.test.ts

### REG-01.S2 A new version is published without a code change
- Given an asset with version `n`
- When the designer publishes version `n + 1` with the asset pipeline
- Then the files are uploaded to `assets/<key>/v<n + 1>/`; the `asset` and `asset_version` rows are upserted; the pair (`asset_id`, `version`) is unique; the asset has one active version; no code changes
- Test: @storybook/assets-tools · tools/assets/test/publish.test.ts

### REG-01.S3 A new story uses the new version
- Given an asset whose active version is the new one
- When a new run starts
- Then its `freeze` step records the new version as the active registry version
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### REG-01.S4 An old release keeps the old version
- Given a release that was published before the new version
- When the new version becomes active
- Then the release still holds its copy of the old version, and its content does not change
- Test: @storybook/app · apps/storybook/worker/publish/publish.test.ts

### REG-01.S5 The Studio reads the active registry
- Given a registry with assets, sounds, and templates
- When the Studio sends `GET /api/studio/registry`
- Then the response has the active assets, sounds, and templates
- Test: @storybook/app · apps/storybook/worker/api/routes.test.ts

### REG-01.S6 A page run after a new version uses the new version
- Given a draft whose scenes were made with version `n` of an asset, and version `n + 1` is now active
- When the operator starts a page run for the scene of one page
- Then its `freeze` step records version `n + 1`, and the new scene is made with it; the other scenes of the draft do not change; the draft can hold scenes made with both versions
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

## REG-02 Asset files are cut out, measured, and safe

As the designer, I want the pipeline to cut out, measure, and sanitise the
assets, so that the layout engine and the browser can use them. (Derived from
the asset pipeline design and the rule "No generated code runs in the
browser".)

Spec: requirements "Non-functional Requirements" · design "8. Asset pipeline" (Cover files), "Asset manifest" · ADR 0017 "Cover file (decision 17)"

### REG-02.S1 Each pose and expression becomes a transparent WebP
- Given a Producer board and its tracked crop map
- When the cut-out step runs
- Then each named pose and expression becomes a transparent WebP: the background is flood filled from the box edges, the image is trimmed, and the edge has a 2 px feather
- Test: @storybook/assets-tools · tools/assets/test/image.test.ts

### REG-02.S2 The manifest holds measured values
- Given a cut-out asset
- When the measure step runs
- Then the manifest values come from the image and the crop map: the alpha bounds, the foot point (lowest opaque row, centre), and the face box (from the crop map)
- Test: @storybook/assets-tools · tools/assets/test/image.test.ts

### REG-02.S3 An SVG is sanitised before upload
- Given a hand-cleaned SVG source in `assets/<key>/v<n>/`
- When the SVG step runs
- Then the output has no scripts and no event attributes
- Test: @storybook/assets-tools · tools/assets/test/svg.test.ts

### REG-02.S4 A character moves from WebP to SVG as a new version
- Given a character whose active version has the renderer `webp`
- When an SVG version is ready and is published
- Then it is a new asset version of the same asset; the renderer supports both formats
- Test: @storybook/assets-tools · tools/assets/test/publish.test.ts

### REG-02.S5 The registry holds a small sound set
- Given the asset pipeline has run its sound step
- When the registry is read
- Then it holds a small set (about 8) of short sound effects synthesised in code (no third-party audio), normalised, as `sfx` assets
- Test: @storybook/assets-tools · tools/assets/test/sfx.test.ts

### REG-02.S6 The code-made backdrop has all four palettes
- Given the asset pipeline
- When the code backdrop step runs
- Then the registry holds the backdrop `meadow`, renderer `svg`, with one variant for each of `day`, `cloudy`, `dusk`, and `night`, each 2400 x 1200 units
- Test: @storybook/assets-tools · tools/assets/test/backdrop.test.ts

### REG-02.S7 A painted backdrop is scaled, compressed, and reviewed
- Given a painting for each variant of a backdrop
- When the painted backdrop step runs
- Then each variant is a WebP of 2400 x 1200 px within the file budget, and a review sheet shows the slot envelopes of all templates over each variant; a slot envelope is the union of the boxes of every active asset of the slot's kind placed in that slot at scale 1, with and without flip
- Test: @storybook/assets-tools · tools/assets/test/painted.test.ts

### REG-02.S8 A backdrop without a matching approval is not published
- Given a backdrop version whose approval file is missing, or lists a SHA-256 that does not match a variant file or the template list
- When the developer runs publish
- Then publish refuses the backdrop version with an error and uploads nothing for it
- Test: @storybook/assets-tools · tools/assets/test/publish.test.ts

### REG-02.S9 The cover file step makes one cover file for each painted variant
- Given a painted backdrop with a painting for each of its variants, and the code backdrop `meadow`
- When the cover file step of the asset pipeline runs
- Then a new version of the painted backdrop has, for each variant, a file `cover-<sky>.webp` beside the variant file: a lossy WebP of 800 x 400 px with no alpha, within the cover file budget; the manifest names it in `variants[].coverFile`; `meadow` gets no cover file, and no existing version changes
- Test: spec (to implement)

### REG-02.S10 The approval record covers the cover files
- Given a backdrop version with cover files, whose approval record lists a SHA-256 that does not match one cover file
- When the developer runs publish
- Then publish refuses the backdrop version with an error and uploads nothing for it
- Test: spec (to implement)
