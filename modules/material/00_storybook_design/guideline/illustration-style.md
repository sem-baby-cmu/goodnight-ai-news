# Illustration Style

## Visual language

Combine tactile painted-paper texture, softly irregular hand-cut shapes, subtle crayon accents, and warm preschool-friendly colors. The image should feel assembled from refined paper pieces rather than rendered as a 3D toy.

Use a restrained texture level: visible enough to feel handmade, quiet enough that faces, type, and silhouettes stay clean. Prefer flat layers with faint contact shadows. Avoid glossy highlights, plastic, clay, thick foam, strong bevels, noisy fibers, and photoreal lighting.

## Character identity

- Read `storybook_main/00_prompt/character.md` for current names, hierarchy, and personalities.
- Use `storybook_main/00_storybook_design/character-board-*.png` as the canonical reference for proportions, facial language, clothing, color placement, and recognizable details.
- Keep black oval eyes, economical mouths, rounded silhouettes, and clearly separated color shapes unless a board establishes a specific exception.
- Express emotion through eyes, eyebrows, mouth, pose, and small hand gestures. Do not add excessive blush, eyelashes, accessories, or surface detail to make a character cute.
- Keep every recurring character recognizable from silhouette and palette at thumbnail size.

## Detail tiers

### Thumbnail, icon, or avatar

- One dominant subject and almost no environmental detail.
- Large face and clear silhouette; preserve comfortable crop safety.
- For a profile avatar, use a full warm-ivory field rather than a hard circular backplate unless explicitly requested.
- Three or four small paper sparkles may be used as quiet accents.

### Character board or reusable prop

- Plain warm-ivory background.
- Show only the views, expressions, actions, and palette needed for production consistency.
- Preserve moderate paper texture and clean separations so the asset can be layered or animated later.
- Props should be isolated, readable, and reusable across multiple aspect ratios.

### Storybook page

- Build the scene around one narrative beat, not a catalogue of objects.
- Use enough environment to establish place while preserving negative space for text and responsive cropping.
- Keep the main character action readable first, supporting characters second, and decorative atmosphere third.
- Complex scenes may use more layers, but texture intensity and facial simplicity must remain consistent with character boards.

## Composition by layout

- **Portrait:** favor a square or near-square illustration above the text. Keep the main action in the central safe area and preserve the feeling of a single page turning from the left.
- **Tablet or landscape:** use a book-like spread, typically a maximized 1:1 illustration on the left and a similarly weighted text area on the right. Center the spread and let it fill the viewport without unstable margins.
- Keep text out of faces, hands, and story-critical objects. When text overlays art, place it on a quiet opaque paper panel.
- Generate or compose layers separately when characters or objects must move independently. Do not simulate walking by moving one flattened scene.

## Reusable object system

Use the prop boards in `storybook_main/00_storybook_design/` for nature, buildings, robot-story objects, everyday interaction props, and atmosphere. Match their simplified silhouettes, paper texture, warm palette, and minimal contact shadows.

Prefer reusable objects over full fixed backgrounds when the same story must adapt to phone, tablet, portrait, landscape, or animation.

## Generation and review checks

- Identity matches the relevant board.
- Texture is tactile but not heavy.
- Shapes look hand-cut but not sloppy.
- The focal action reads at thumbnail size.
- Negative space supports the intended text placement.
- No extra limbs, facial features, buttons, or accessories appear.
- The scene remains compatible with the intended animation or responsive crop.
