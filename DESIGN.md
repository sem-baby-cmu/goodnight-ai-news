# DESIGN.md — Lullabyte front end

The design system for every page that the Lullabyte Worker serves: the
landing page, the parent pages, the reviewer page, and the story reader.
Aesthetic rules that are not about one component are in `TASTES.md`.

## 1. Stack

| Layer | Choice |
| :-- | :-- |
| Hosting | One Cloudflare Worker serves the front end (Static Assets) and the API |
| Build | Vite with `@cloudflare/vite-plugin` |
| UI | React 19, TanStack Router (file-based routes, single-page app) |
| Components | shadcn with the Base UI base (`@base-ui/react`) |
| Styling | Tailwind CSS v4; the theme is CSS variables in `app/src/styles.css` |
| Font | Nunito (Google Fonts), one family for all text |

`ghibli-ui` is not used. Version 0.1.0 bundles React 18's JSX runtime, which
reads React 18 internals, and it ships no TypeScript types. We take its look
(warm palette, rounded forms, sticker buttons) and build it with shadcn
components and our own tokens.

## 2. Two themes: Day and Night

The product has two moods. Parents read the day pages. Children read the
story at night. Each mood is one theme.

| Theme | Used for | Source |
| :-- | :-- | :-- |
| **Day** (light) | Landing page, parent pages, reviewer page | The warm storybook palette of `ghibli-ui` |
| **Night** (dark) | Story reader, always. Other pages when the system is in dark mode. | Producer's palette (`producer/style_guide.md`) |

### Day tokens

| Token | Value | Use |
| :-- | :-- | :-- |
| `--background` | `#F7F3E8` | Paper |
| `--foreground` | `#5C4A32` | Bark ink. Contrast on paper 7.6:1 |
| `--card` | `#FFFCF4` | Raised paper |
| `--primary` | `#E8C47C` | Honey. Text on it: `--foreground` |
| `--primary-edge` | `#C9A24F` | Sticker edge under a primary button |
| `--secondary` | `#A8C5A0` | Moss. Text on it: `#2F4A2C` |
| `--accent` | `#E8B4B8` | Blush. Small marks only |
| `--muted` | `#EFE8D6` | Quiet fills |
| `--muted-foreground` | `#7A6648` | Secondary text. Contrast on paper 4.9:1 |
| `--border` | `#E2D6BC` | Hairlines |
| `--ring` | `#C9A24F` | Focus ring |
| `--destructive` | `#A8443C` | Errors. Contrast on paper 5.3:1 |

### Night tokens

| Token | Value | Use |
| :-- | :-- | :-- |
| `--background` | `#1A1A2E` | Night sky |
| `--foreground` | `#FFF8E6` | Cream ink |
| `--card` | `#222240` | Raised night |
| `--primary` | `#FFD23F` | Lamp glow. Text on it: `#1A1A2E` |
| `--primary-edge` | `#C9A21F` | Sticker edge |
| `--secondary` | `#6C8BEF` | Pip blue. Text on it: `#121A33` |
| `--accent` | `#F48FB1` | Pink. Small marks only |
| `--muted` | `#2A2A48` | Quiet fills |
| `--muted-foreground` | `#B9B3C9` | Secondary text |
| `--border` | `#34345A` | Hairlines |
| `--ring` | `#FFD23F` | Focus ring |
| `--destructive` | `#F07A6E` | Errors |

Check every new color pair for at least 4.5:1 contrast for text, 3:1 for
large text and icons, in both themes.

## 3. Type

One family: Nunito, weights 400, 600, 800.

| Size | Line height | Use |
| :-- | :-- | :-- |
| `12px` | 16px | Captions, legal text |
| `14px` | 20px | Controls, labels, table text |
| `16px` | 24px | Body text |
| `32px` | 40px | Page title (one per page), weight 800 |

No other sizes. A section title is `16px` weight 800, not a bigger size.
The story reader is the one exception: page text is set by the reader, not by
this scale, because a child reads it from a distance.

## 4. Shape and depth

- Base radius `16px` for cards. Nested shapes use concentric radii:
  inner radius = outer radius − padding.
- Controls: radius `12px`, height at least `44px` (a child's finger).
- Borders and dividers: `0.5px` hairline in `--border`.
- **Sticker button.** The one signature shape. A button has a flat fill, a
  `1px` edge in `--primary-edge`, and one hard shadow `0 3px 0` in the same
  edge color. On press it moves down `2px` and the shadow shrinks to
  `0 1px 0`. No blur shadows anywhere else.
- Cards: flat `--card` fill and a hairline border. No shadow.

## 5. Motion

- UI transitions: `160ms`, `cubic-bezier(0.2, 0.8, 0.2, 1)`. Only on state
  change (hover, press, open, close).
- Child surfaces (reader, games) use motion on purpose: Pip breathes and
  blinks, stars drift, a tapped prop answers with a bounce. Motion tells a
  child what is alive and what can be tapped.
- Loops share Producer's 2.0 s period, so a page reads as one slow breath.
  Bedtime pace: slow and soft, no flashing, no fast spins.
- Parent pages keep motion to state changes only.
- Rendering: SVG for Pip and the scene, animated with CSS and the Web
  Animations API. A three.js layer behind the scene is proposed for depth
  (parallax sky, drifting stars, soft particles). Pip stays SVG so it is the
  same Pip on every page and in the cards. Load three.js only on child pages.
- Respect `prefers-reduced-motion`: turn off transforms, keep opacity fades.

## 6. Components

Use shadcn Base UI components as they come. Give them character through the
tokens, not by changing their structure.

| Need | Component | Note |
| :-- | :-- | :-- |
| Actions | `Button` | Variants: `default` (sticker, honey), `secondary` (sticker, moss), `ghost`, `link` |
| Containers | `Card` | Hairline, no shadow |
| Status | `Badge` | Story rating: green / yellow / red use moss / honey / `--destructive` |
| Dialogs | `Dialog` | Parent confirmations |
| Forms | `Input`, `Select`, `Switch`, `Label` | Reviewer page |
| Hints | `Tooltip` | Carries explanations, so the page text stays short |

New components go in `app/src/components/ui/` through the shadcn CLI
(`npx shadcn@latest add <name>`). Product components go in
`app/src/components/`.

## 7. Layout

- One reading column, max width `1040px`, side padding `16px` on phones,
  `24px` from `768px` up.
- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48. Section gap: 48.
- Mobile first. Parents open the site on a phone at bedtime.

## 8. Imagery

- Pip is the only character. Use Producer's SVG Pip (`producer/scene/pip.py`)
  so the site and the story match.
- No stock photos. No photos of children.
- Illustrations follow `producer/style_guide.md`: rounded shapes, one warm
  light source, nothing frightening.

## 9. Writing on the page

- Plain English. Short sentences. Talk to the parent.
- No emoji in body text. No made-up words.
- Every story links to its real news source. Say so on the landing page.

## 10. Child surfaces (ages 5 to 7 first)

Two audiences use the product. Parents read the landing page, the parent
card, and the review pages. Children use the story reader and the games. Many
5 to 7 year olds are still learning to read, so a child surface must work for
a child who cannot read yet.

| Rule | How |
| :-- | :-- |
| Hear first, read along second | Every page plays its narration. The word being read is highlighted. Text is never the only way to get the story. |
| No reading to move around | Controls are pictures, not words: play, next, back, home. Each control speaks its name when pressed and held. |
| Big, few targets | Touch targets are at least `64px` in the reader (small hands, less precise taps). At most three controls on screen at once. |
| One thing per page | One picture, one or two short sentences. No scrolling inside a story page. |
| Reader type | Page text is `28px` / `40px` line height for 5 to 7 and `22px` / `32px` for 8 to 10, weight 600, high contrast on Night tokens. These are starting values to test on a phone at arm's length. |
| Spoken questions | A quiz question is read aloud. For 5 to 7 the answers are three pictures, not words. |
| Safe to tap anything | A wrong tap never punishes. No timers, no losing, no red error states in the reader. |
| No dead ends | Every screen has a big home control. Leaving the reader is one tap for a parent and needs no reading. |
| No outbound links for children | Source links, sharing, and settings live on parent pages only. |

The landing page is a parent page and follows sections 3 to 9. Its one link
into a story (when the reader exists) is a large Pip picture, so a child
sitting with a parent can start the story without reading.
