# DESIGN.md — Lullabyte front end

The design system for every page the Lullabyte Worker serves: the landing
page, parent pages, the reviewer page, and the story reader.

This file is the spec for the look of the product. Aesthetic rules are in
`TASTES.md`. Product features are decided in `integration/` and the issues,
not here.

In one line: hand-painted watercolor countryside skies for everyday screens,
a deep night-blue stage for reading, round friendly characters, soft motion.
The product is English only.

## 1. Stack

| Layer | Choice |
| :-- | :-- |
| Hosting | One Cloudflare Worker serves the front end (Static Assets) and the API |
| Build | Vite with `@cloudflare/vite-plugin` |
| UI | React 19, TanStack Router (file-based routes, single-page app) |
| Components | shadcn with the Base UI base (`@base-ui/react`); character comes from tokens |
| Styling | Tailwind CSS v4; tokens are CSS variables in `app/src/styles.css` |
| Fonts | Kiwi Maru 400/500 (display); Nunito 400/600/700/800 (UI and story text) |
| 3D | three.js, one bundled script, child screens only (section 11) |

`ghibli-ui` is not used: version 0.1.0 needs React 18 and ships no types.

## 2. Color

### Palette

| Name | Hex | Use |
| :-- | :-- | :-- |
| Sky | `#7EBDE6` | Skies, illustration only |
| Meadow | `#86B562` | Hills, illustration only |
| Forest | `#3F6E2E` | Primary action, selected state |
| Paper | `#F7F1E3` | Page ground |
| Ink | `#23354A` | Headings |
| Night | `#1B2440` | Reading stage |
| Lamp | `#F5C35B` | Badges, highlight, tap ring |
| Roof red | `#C8553D` | Accent, sparingly. Never text, never errors |

### Supporting values

| Token | Hex | Use |
| :-- | :-- | :-- |
| `--card` | `#FFFDF7` | Raised paper |
| `--border` | `#EADFC6` | Card edge, 1px |
| `--paper-edge` | `#E3D8BF` | Edge on paper-colored shapes |
| `--divider` | `#EFE6D2` | Lines inside a card |
| `--text` | `#2B3A4A` | Body text |
| `--text-2` | `#44525E` | Secondary body text |
| `--label` | `#5B6B78` | Labels, captions |
| `--link` | `#2E4A6E` | Links, secondary button ("Read to me") |
| `--forest-edge` | `#2B4E20` | Hard edge under the primary button |
| `--highlight` | `#FFE08A` | Word highlight while narrating |
| `--moss-text` | `#2F5233` | Titles on meadow-tinted panels |
| `--tint-sky` / `--tint-meadow` / `--tint-sand` | `#E3ECF6` / `#EEF3E4` / `#F3ECDD` | Chip and panel fills; text on them: `#2E4A6E` / `#3F6E2E` / `#6A5636` |
| `--night-card` | `rgba(255,253,247,.08)` | Card on the night stage |
| `--night-label` | `#C9D3E6` | Labels on night |
| `--night-title` | `#FFE7A3` | Small titles on night |

### Contrast (computed)

| Pair | Ratio |
| :-- | :-- |
| Ink on Paper | 11.1 |
| Body `#2B3A4A` on Paper | 10.3 |
| Label `#5B6B78` on Paper | 4.9 |
| White on Forest | 6.0 |
| White on `#2E4A6E` | 9.1 |
| Paper on Night | 13.6 |
| Ink on `#FFE08A` highlight | 9.7 |
| Chip texts on their tints | 5.3 to 7.6 |
| Roof red on Paper | **3.9: not for text** |
| Sky or Meadow on Paper | 1.8 / 2.1: not for text |

Every new pair needs 4.5:1 for text, 3:1 for large text and icons.

### Two grounds

| Ground | Used for |
| :-- | :-- |
| **Paper + painted sky** | Landing, home, parent and reviewer pages |
| **Night stage** | The story reader, always |

There is no automatic dark mode. Night is a place in the product (the reading
stage), not a system setting.

## 3. Type

| Role | Font | Size / line height | Weight |
| :-- | :-- | :-- | :-- |
| Page title | Kiwi Maru | 40px / 1.2 | 500 |
| Section title | Kiwi Maru | 24px / 1.3 | 500 |
| Card title (display) | Kiwi Maru | 30px / 1.2 | 400 |
| Story text | Nunito | 27px / 1.6 | 700 |
| Body | Nunito | 16px / 1.6 | 400 |
| UI text | Nunito | 15 to 18px | 600 to 800 |
| Label | Nunito | 12px, letter spacing 2px, upper case | 800 |
| Caption | Nunito | 13px / 1.55 | 400 |

- While narrating, the current word gets the `--highlight` fill with an 8px
  radius and a 3px spread of the same color.
- On phones, the page title drops to 32px.

## 4. Shape

| Thing | Value |
| :-- | :-- |
| Large card or panel | radius `22px`, 1px `--border`, padding 22px |
| Inner card | radius `16px`, no border, padding 14px |
| Color swatch, icon tile | radius `16px` |
| Buttons and chips | fully round (`999px`) |
| Shadows | None, except the primary button's hard edge `0 5px 0 var(--forest-edge)` |

### Buttons

| Variant | Look | Example |
| :-- | :-- | :-- |
| Primary | Forest fill, white text, 800, 16px, min height 52px, padding 0 20px, hard edge | "Start reading" |
| Secondary | `#2E4A6E` fill, white text, no edge | "Read to me" |
| Outline | white fill, 2px `#2E4A6E` border and text | "I'll read" |

Press: the button squishes (scale 0.96) and the primary's edge shrinks to
2px. No hover-only states.

### Chips

13px, weight 800, padding 6px 11px, round, on a tint (`Space` on sky tint,
`Ages 5 to 10` on meadow tint, `Parent approved` on sand tint).

### Switch

64 x 38px track in Forest, 30px knob in `--card`.

## 5. Motion

| Motion | Value |
| :-- | :-- |
| Page turn | 0.55s, slight `rotateY`, like a pop-up book |
| Tap response | 0.7s jelly bounce, overshoot at most 18% |
| Tap ring on a tappable object | Lamp ring, 3px, scale 0.92 to 1.2 and fade, 1.8s, ease-out, repeats until tapped |
| Ambient clouds | drift across in 120 to 180s; almost still at a glance |
| Characters | float 8px up and down on a 4s loop (ease-in-out) |
| UI state changes | 160ms, `cubic-bezier(0.2, 0.8, 0.2, 1)` |

- Pip floats on the 4s loop and blinks wherever Pip appears. The float
  replaces Producer's 2.0s breath on the site, so two loops never compete.
- Tapping an object: it answers with the jelly bounce.
- Reduced motion: one still frame. No drift, no float, no bursts; state
  changes become fades.

## 6. Components

shadcn Base UI components, styled by the tokens above.

| Need | Component | Note |
| :-- | :-- | :-- |
| Actions | `Button` | `default` = primary, `secondary`, `outline`, `ghost`, `link` |
| Containers | `Card` | Section 4 radii, no shadow |
| Tags | `Badge` | The chip style |
| Settings | `Switch` | Section 4 |
| Overlays | `Dialog`, `Sheet` | Parent pages only |

## 7. Layout

| Width | Layout |
| :-- | :-- |
| Phone (from 390px) | One column, side padding 16px |
| Tablet and desktop | Content max width 1168px, side padding 56px from 1024px |

Mobile first: parents open the site on a phone at bedtime.
Spacing (px): 4, 6, 8, 10, 12, 14, 20, 22, 26, 48.

## 8. Imagery

- Watercolor countryside: sky, clouds, meadow hills. Painted SVG, not photos.
- Pip is the only character. Use Producer's SVG Pip (`producer/scene/pip.py`)
  so the site and the story match.
- Nothing frightening. No photos of children. No stock photos.

## 9. Writing on the page

- Plain English. Short sentences. Talk to the parent on parent pages.
- No emoji in body text. No made-up words.
- Every story links to its real news source. Say so on the landing page.
- Story text rules (words per page, reading level) are in
  `integration/storytelling.md` section 4.

## 10. Child surfaces (ages 5 to 7 first)

Two audiences use the product. Parents read the landing page and the parent
pages. Children use the story reader and the games. Many 5 to 7 year olds are
still learning to read, so a child surface must work for a child who cannot
read yet.

| Rule | How |
| :-- | :-- |
| Hear first, read along second | Every page plays its narration. The word being read is highlighted. Text is never the only way to get the story. |
| No reading to move around | Controls are pictures, not words: play, next, back, home. |
| Big, few targets | Child targets at least `64px`, at least 12px apart. At most three controls on screen at once. No hover-only states. |
| One thing per page | One picture, one or two short sentences. No scrolling inside a story page. |
| Spoken questions | A quiz question is read aloud. For 5 to 7 the answers are pictures. |
| Safe to tap anything | A wrong tap never punishes. No timers, no losing, no red error states. |
| No outbound links for children | Source links, sharing, and settings live on parent pages only. |

Parent pages: touch targets at least 44px.

## 11. 3D layer (three.js)

A three.js layer sits behind the scene on child pages only, for depth: a
parallax sky, drifting stars, soft particles. Parent and reviewer pages stay
flat. Proposed for Producer in issue #3.

- Pip and the scene stay SVG on top of the layer, so Pip is the same in the
  reader, the cards, and the site.
- Text and buttons are never inside the 3D layer.
- No WebGL: the SVG sky shows instead.
- Reduced motion: one still frame.
- Pauses when off screen. Pixel ratio capped at 2.
