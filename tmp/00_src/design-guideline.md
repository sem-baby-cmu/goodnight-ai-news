# Lullabyte Design Guideline

## Brand promise

Lullabyte turns real-world AI and technology news into warm, understandable storybook experiences for children while giving caregivers clear, trustworthy context.

## Design principles

1. **Warm before technical.** Technology should feel approachable, helpful, and grounded in everyday life.
2. **Clear before decorative.** One focal idea per view; decoration supports comprehension.
3. **Tactile, not heavy.** Use painted-paper texture and hand-cut character, but keep surfaces bright and readable.
4. **Playful, not noisy.** Use small moments of surprise and motion instead of constant stimulation.
5. **Made for children and grown-ups.** Child-facing areas invite exploration; caregiver areas become calmer and more informational without feeling like a different brand.
6. **Responsive by composition.** Recompose for portrait and landscape instead of merely shrinking the same canvas.

## Core color tokens

Use these as the shared product and brand foundation. Story illustrations may add scene-specific colors while preserving the same warmth and saturation discipline.

| Token | Hex | Primary use |
| --- | --- | --- |
| Paper cream | `#FAF8F3` | Main canvas and reader background |
| Raised paper | `#FFF8EC` | Cards, controls, text panels |
| Soft cream | `#EFE4D0` | Secondary surfaces and separators |
| Ink | `#3A2E25` | Primary text and dark linework |
| Soft ink | `#7A6656` | Secondary text and metadata |
| Lullabyte teal | `#21A193` | Primary actions and brand highlights |
| Deep teal | `#137A70` | Headings, active states, strong accents |
| Cobalt | `#2350C8` | Character and informational accent |
| Sun yellow | `#E2AE4A` | Warm highlight, badge, sparkle |
| Coral | `#C9694F` | Emotional accent and secondary action |
| Wood | `#B8774A` | Shelves and book-like structures |
| Light wood | `#D29A68` | Wood highlights |
| Deep wood | `#8E5533` | Wood shadows and structure |

Do not use pure black for normal text, neon colors, icy white backgrounds, or large gradients. Check text contrast; use Ink or Deep teal on light surfaces rather than yellow or coral for body copy.

## Typography

- **Display, navigation, and controls:** `Baloo 2`, weights 600 and 800.
- **Traditional Chinese UI and story copy:** `Huninn`; fall back to `PingFang TC`, `Noto Sans TC`, then system sans serif.
- **English narrative and caregiver editorial copy:** `Literata`, weights 400 and 500.
- Use no more than two visible font families on a screen.
- Prefer sentence case. Avoid long all-caps labels; reserve uppercase or letter-spaced labels for short caregiver metadata.
- Child story text must remain comfortably readable: generous line height, short line length, and no text over detailed artwork without an opaque paper panel.

## Shape and depth

- Favor rounded rectangles, circles, pills, and slightly imperfect cut-paper contours.
- Recommended radii: 14 px for compact controls, 18 px for cards, 24–28 px for panels, and full pills for primary actions.
- Use shallow, warm shadows. Typical depth is a 1–3 px contact edge plus a soft 6–18 px lift shadow.
- Avoid glassmorphism, metallic gloss, sharp futuristic corners, thick bevels, inflated foam, and large dark shadows.

## Spacing and hierarchy

- Use a 4 px base rhythm, typically `4, 8, 12, 16, 24, 32, 48`.
- Give the focal character, book, or story action more room than supporting decoration.
- Keep generous safe space around text and interactive controls.
- On small screens, remove secondary decoration before reducing readable type or touch targets.

## Icons and graphic accents

- Icons should be rounded, simple, and readable without labels where common conventions are clear.
- Small paper sparkles, dots, stitched lines, leaves, and stars may create delight, but use them sparingly.
- Do not use generic corporate technology motifs, dense circuit patterns, or sci-fi chrome.

## Accessibility baseline

- Interactive targets should be at least 44 × 44 CSS px.
- Provide visible keyboard focus and meaningful accessible names.
- Do not rely on color alone to communicate state.
- Respect reduced-motion preferences and ensure narration, sound, and autoplay can be controlled.
- Keep essential text as real text whenever possible rather than embedding it in raster artwork.

## Consistency decision

When two references conflict, prefer the most recently user-approved artifact, then the current character board, then this guideline. Flag meaningful conflicts instead of silently blending them.
