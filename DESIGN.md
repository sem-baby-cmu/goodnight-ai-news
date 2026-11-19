# DESIGN.md — Storybook MVP front end

The design source for the front end in `apps/storybook`: the Player (for
children, public) and the Studio (for the operator, behind Access).

In one line: a paper-craft picture book. Cream paper, teal actions, the
Baloo 2 typeface, cut-out characters in front of a painted backdrop, hard
paper edges, and pages that turn like paper. The product is English only.

How this file relates to the other documents:

| Document | Role |
| :-- | :-- |
| [ADR 0015](docs/adr/0015-storybook-mvp-reset.md), [ADR 0016](docs/adr/0016-backdrops-page-turn.md), [`docs/specs/storybook-mvp/`](docs/specs/storybook-mvp/) | Decide behaviour. Where this file disagrees with them, they win and this file has a defect. |
| This file | Decides the look: tokens, components, screens, and states. |
| The UI boards that the owner approved (HTML mocks, not in the repository) | The source of the values in this file. Section 16 lists each place where this file differs from a board, with the reason. |
| `modules/material/00_storybook_design/guideline/` | The Producer style source for illustration. Where it disagrees with a board, the board wins (the guideline says: the most recently approved artifact first). |
| `TASTES.md` (repository) and the owner's general taste rules | Section 16 lists the conflicts and which side wins. |

`app/` is the earlier Worker. It keeps the earlier Lullabyte look (Kiwi Maru,
Nunito, a night reading stage) until the MVP Worker replaces it. Comments in
`app/` cite sections of the earlier version of this file (git history,
`3d6ef6c`). Sections 1 to 11 keep their numbers and their subjects.

## 1. Stack

| Layer | Choice |
| :-- | :-- |
| Hosting | One Cloudflare Worker serves the front end (Static Assets) and the API |
| Build | Vite with `@cloudflare/vite-plugin` |
| UI | React 19, TanStack Router, code-based routes in `apps/storybook/src/router.tsx` |
| Components | shadcn with the Base UI base (`@base-ui/react`); character comes from tokens |
| Styling | Tailwind CSS v4; tokens are CSS variables in `apps/storybook/src/styles.css` |
| Font | Baloo 2, weights 500, 600, 700, 800, bundled with the app (`@fontsource/baloo-2`). No request to a font service from a child screen |
| Scene | `packages/scene-runtime` draws the stage. No three.js (section 11) |

## 2. Color

### Palette

| Name | Variable | Hex | Use |
| :-- | :-- | :-- | :-- |
| Desk | `--desk` | `#F6EBDA` | Ground of the Studio, and the ground around the page panel in the Player |
| Paper | `--paper` | `#FFF8EC` | The page sheet, the narration panel, the Studio header, fields. This is "the paper colour" of the spec |
| Card | `--card` | `#FFFDF8` | Cards, round buttons, bubbles, text on Deep teal |
| Soft cream | `--cream` | `#EFE4D0` | Dividers, the track of a segmented control, the "missing" state |
| Ink | `--ink` | `#3A2E25` | Text |
| Mid ink | `--ink-2` | `#5E4E42` | Text on Soft cream and on Soft |
| Soft ink | `--ink-3` | `#7A6656` | Labels and notes on Card, Paper, and Desk |
| Deep teal | `--teal-deep` | `#137A70` | Primary fill, icons on round buttons, the current page mark |
| Teal edge | `--teal-edge` | `#0C5850` | Hard edge under a Deep teal shape |
| Teal text | `--teal-text` | `#0F665E` | Links, text on soft and ghost buttons |
| Teal | `--teal` | `#21A193` | Fill only: "done" cells, a book cloth. Never text (3.1:1) |
| Cobalt | `--cobalt` | `#2350C8` | Studio: the "working" state and the selected layer |
| Sun yellow | `--sun` | `#E2AE4A` | The outer focus ring, "needs review" cells |
| Moon | `--moon` | `#F4D98A` | Light shapes on a night sky |
| Coral | `--coral` | `#C9694F` | Illustration and a book cloth. Never a state on a child screen |
| Wood, Light wood, Deep wood | `--wood`, `--wood-light`, `--wood-deep` | `#B8774A`, `#D29A68`, `#8E5533` | The shelf; the rule under the Studio header (Light wood) |

### Supporting values

| Variable | Hex | Use |
| :-- | :-- | :-- |
| `--edge` | `#E6D5BC` | Hard edge under a Card shape |
| `--soft` | `#F3E8D5` | Soft button fill, ghost button hover |
| `--soft-edge` | `#E2D2B6` | Hard edge under a Soft shape |
| `--seg-edge` | `#DCC9AA` | Hard edge under the selected segment |
| `--field-border` | `#EADBC2` | Border of a field, 2 px |
| `--disabled-edge` | `#E0D0B4` | Hard edge under a disabled button |
| `--dot-read` | `#8CCFC6` | Progress pill: a page that was read |
| `--dot-ahead` | `#E6D9C4` | Progress pill: a page to come. Run progress: a waiting cell |

### Studio states

Every state has a fill, a text colour, an icon, and a word. A state is never
shown by colour alone. No child screen uses these.

| State | Variable prefix | Fill | Chip text | Notice text | Notice button edge | Icon |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| ok, ready, done | `--ok` | `#DDF1EC` | `#0F665E` | `#0F665E` | none | check |
| working, information | `--work` | `#E3E9FA` | `#2350C8` | `#1E3F9E` | `#C6D2F2` | open arc |
| stale, needs review | `--warn` | `#FBEFD2` | `#7A5410` | `#5E400C` | `#EBD6A6` | clock (stale), `!` (review) |
| blocked, failed, refused | `--bad` | `#F8E2D9` | `#9A4630` | `#6E3322` | `#EBC3B4` | cross |
| missing | `--none` | `#EFE4D0` | `#5E4E42` | not used | none | dash |

Run progress cells: done `--teal`, working `--cobalt`, needs review `--sun`,
waiting `--dot-ahead`. A legend with words is next to them.

### Sky palettes

The four palettes are the closed list `day`, `cloudy`, `dusk`, `night`
(`SKY_PALETTES`). The code-made `meadow` backdrop uses these values. A painted
variant takes its sky colour from the same row, so that painted and code-made
pages belong to one book.

| Palette | Sky | Far ground | Mid ground | Near ground | Water |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `day` | `#CFE6EE` | `#C9DE9E` | `#A3CB6E` | `#8DBC5C` | `#7EBCDB` |
| `cloudy` | `#DCE3E6` | `#C3D3A0` | `#9EBC74` | `#8AAD62` | `#7EBCDB` |
| `dusk` | `#F2D3B0` | `#D1C98E` | `#AABA6A` | `#93A85A` | `#7EBCDB` |
| `night` | `#2F4066` | `#3D5A5E` | `#344E4B` | `#2D443F` | `#3E5F7E` |

### shadcn names

| shadcn variable | Value |
| :-- | :-- |
| `--background` / `--foreground` | `--desk` / `--ink` |
| `--card`, `--popover` / their foregrounds | `--card` / `--ink` |
| `--primary` / `--primary-foreground` | `--teal-deep` / `--card` |
| `--secondary` / `--secondary-foreground` | `--soft` / `--teal-text` |
| `--muted` / `--muted-foreground` | `--cream` / `--ink-2` |
| `--accent` / `--accent-foreground` | `#DDF1EC` / `--teal-text` |
| `--border` | `--cream` |
| `--input` | `--field-border` |
| `--ring` | `--ink` (section 14, focus ring) |
| `--destructive` | `#9A4630`. Studio only |

### Contrast

Computed on 2026-11-19 with the WCAG 2 formula from the hex values above.
Text needs 4.5:1. Text of 24 px or more, bold text of 19 px or more, icons,
and focus rings need 3:1.

| Pair | Ratio | Rule |
| :-- | :-- | :-- |
| Ink on Card, Paper, Desk | 12.9, 12.5, 11.2 | Any text |
| Soft ink on Card, Paper, Desk | 5.4, 5.2, 4.6 | Labels and notes |
| Soft ink on Soft, Soft cream | 4.5, 4.3 | **Not allowed.** Use Mid ink (6.6, 6.3) |
| Card on Deep teal | 5.1 | Button text |
| Deep teal on Card, Paper | 5.1, 4.9 | Icons and text |
| Deep teal on Desk, `day` sky, `dusk` sky | 4.4, 4.0, 3.6 | Icons and large text only. Small text uses Teal text |
| Teal text on Card, Desk, Soft, Soft cream | 6.7, 5.8, 5.6, 5.4 | Links and button text |
| State chip text on its fill | 5.1 to 6.3 | Table "Studio states" |
| State notice text on its fill | 5.8 to 8.3 | Table "Studio states" |
| Teal on Card | 3.1 | Fill only, never text |
| Coral on Card | 3.7 | Fill only, never text |
| Sun yellow on Paper, Desk, `day` sky | 1.9, 1.7, 1.6 | **Never alone** as a ring or a mark on a light ground |
| Ink on `day`, `cloudy`, `dusk` sky | 10.2, 10.1, 9.2 | The inner focus ring passes on light skies |
| Sun yellow on `night` sky | 5.1 | The outer focus ring passes on night |
| Moon on `night` sky | 7.4 | Light shapes on night |

A new pair needs its ratio in this table before it is used.

### One light theme

There is no dark mode and no automatic dark mode. Night is a sky palette of
a page, not a theme. `color-scheme` is `light`.

## 3. Type

One family: `'Baloo 2', ui-rounded, system-ui, sans-serif`. Sentence case.
No upper-case labels, no italics. Numbers that change or line up (page
count, word count, times) use `font-variant-numeric: tabular-nums`.

### Player

| Role | Size / line height | Weight |
| :-- | :-- | :-- |
| Book title on the Start gate; "The end" | 40 px / 1.1 | 800 |
| Label of the Start button; "Lullabyte" on the shelf | 32 px / 1 | 800 |
| Narration | 28 px / 1.45 (steps 22 px and 18 px, section 12.3) | 600 |
| Message of a quiet state; label of a child button other than Start | 28 px / 1.3 | 600 message, 800 label |
| Speech bubble | 20 px / 1.3 | 700 |
| Book title on a cover; page count in the progress pill | 18 px / 1.1 | 700 title, 800 count |

The narration is never smaller than 18 px (PLY-02.S4).

### Studio

Four sizes.

| Role | Size / line height | Weight |
| :-- | :-- | :-- |
| Story title | 28 px / 1.2 | 800 |
| Card title; "Studio" in the header | 20 px / 1.2 | 800 |
| Body and field text | 16 px / 1.5 | 500 |
| Button, segment, table link, emphasised row | 16 px / 1 | 700 (primary button 800) |
| Notice | 16 px / 1.45 | 600 |
| Label, table head, chip | 14 px / 1.2 | 700 |
| Note | 14 px / 1.4 | 500 |

## 4. Shape

### Radii

| Thing | Radius |
| :-- | :-- |
| Buttons, chips, segments, the progress pill | fully round (`999px`) |
| Page panel in the Player | `28px` on the two bottom corners; the top is at the screen edge |
| Card; speech bubble | `24px` |
| Page card in the story view; a notice that stands alone on the Desk | `18px` |
| Field; a notice inside a card; a layer row | `14px` |
| A picture inside a card (stage, preview, thumbnail) | `10px` |
| Book on the shelf | `6px` on the spine side, `13px` on the open side |
| Drag handle | `4px` |

### Edges

A hard edge is the only shadow: `box-shadow: 0 <n>px 0 <colour>`. It has no
blur, no spread, and no horizontal offset. It reads as the thickness of
paper. Nothing has a blurred shadow.

| Shape | Edge |
| :-- | :-- |
| Primary button, child size | `0 5px 0 var(--teal-edge)` |
| Primary button, standard size | `0 4px 0 var(--teal-edge)` |
| Soft button | `0 3px 0 var(--soft-edge)` |
| Round button, card, page card, progress pill, bubble | `0 3px 0 var(--edge)` |
| Book cover | `0 4px 0` in the darker tone of its cloth |
| Selected segment; a chip on a picture | `0 2px 0 var(--seg-edge)`; `0 2px 0 var(--edge)` |
| Chip, notice, field, ghost button, table row | none |

Cards have no border. A field has a 2 px border and no edge. Do not put a
shape with an edge inside another shape with an edge, except a button in a
card.

### Buttons

One shared `Button` (`apps/storybook/src/components/ui/button.tsx`).

| Variant | shadcn name | Look |
| :-- | :-- | :-- |
| Primary | `default` | Deep teal fill, Card text, weight 800, hard edge |
| Soft | `secondary` | Soft fill, Teal text, hard edge |
| Ghost | `ghost` | No fill, Teal text; Soft fill on hover |
| Round | `round` (new) | Card fill, Deep teal icon, hard edge, a circle |
| Link | `link` | Teal text, underline on hover, offset 3 px |

`outline` and `destructive` are not used.

| Size | Height | Padding | Text | Used for |
| :-- | :-- | :-- | :-- | :-- |
| `child` | 76 px for Start; 68 px for the others | 0 46 px 0 34 px; 0 38 px 0 30 px | 32 px; 28 px; icon 34 px; 30 px | Start, Home, Read again |
| `child-icon` | 64 x 64 px | none | icon 28 px, stroke 3 | Home, previous, next |
| `lg` | 52 px | 0 28 px | 16 px, 800 | The one main action of a Studio card |
| `default` | 44 px | 0 20 px | 16 px, 700 | Studio |
| `icon` | 44 x 44 px | none | icon 20 px | Studio |

States:

| State | Look |
| :-- | :-- |
| Pressed | Primary: moves down 3 px (child) or 2 px, and the edge becomes 2 px. Soft: moves down 2 px, edge 1 px. Round: scale 0.94 |
| Hover | Ghost and table rows only. No function depends on hover |
| Focus | Section 14 |
| Disabled, Studio | Soft cream fill, Soft ink text, `--disabled-edge`, `cursor: not-allowed`. One look for every variant |
| Disabled, Player | Opacity 0.35. Used only for "previous" on page 1 and for "Start" while the book loads |

A child button always has an icon. A label is an addition to the icon.

### Chips

14 px, weight 700, padding 6 px 10 px 5 px, fully round, a 12 px icon and a
6 px gap. A chip shows a state or a kind. It is not a button.

### Segmented control

Track: Soft cream, fully round, 3 px padding, 4 px gap. Segment: 44 px high,
padding 0 14 px, 16 px text, weight 700. Selected: Card fill, Teal text,
hard edge. Not selected: no fill, Mid ink text.

### Field and select

Paper fill, 2 px `--field-border`, radius 14 px, padding 8 px 12 px,
height at least 44 px. A select is the shared `Select` component, not a
native `<select>`. Its chevron is 14 px from the right edge; the text is
12 px from the left edge.

## 5. Motion

Slow and soft. Only `transform` and `opacity` animate, except the 160 ms
state changes of a button (`box-shadow`, `background`).

| Motion | Value |
| :-- | :-- |
| Button and segment state change | 160 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Book on the shelf | Hover: up 6 px. Pressed: up 2 px and scale 0.97. 160 ms |
| Page turn | 500 ms, `cubic-bezier(0.4, 0.1, 0.5, 1)`. Section 12.4 |
| Page turn with reduced motion | 200 ms cross-fade, no rotation |
| Panel swap (Start to page 1, "Read again") | 200 ms cross-fade |
| Late image | 200 ms fade-in |
| Speech bubble | Appears with scale 0.6 to 1 and opacity 0 to 1, 220 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Waiting dots | Opacity 0.3 to 1 and back, 1.8 s, ease-in-out; each dot starts 0.3 s after the one before |
| A character outside a story page (shelf, Start gate) | Floats 6 px up and down, 4 s, ease-in-out |
| A tapped character outside a story page | Bounce: up 18 px, 600 ms, `cubic-bezier(0.3, 1.6, 0.5, 1)`, 2 times |

- A character is not UI. On a story page, its animation comes from the
  scene (the closed primitive list of the spec), not from this table.
- In the Studio, nothing moves on its own. Pip in the header is still.
- Reduced motion (`prefers-reduced-motion`): loops are off, the dots are
  still, a button has no transition, a bubble and a late image appear at
  once, and the page turn is the cross-fade.
- Nothing flashes, spins, or shakes.

## 6. Components

shadcn Base UI components, styled by the tokens above.

| Need | Component | Note |
| :-- | :-- | :-- |
| Actions | `Button` | Section 4 |
| Containers | `Card` | Card fill, radius 24 px, hard edge, no border. Padding 20 px; 14 px in the page editor |
| States and kinds | `Badge` | The chip of section 4 |
| Two to four choices | `ToggleGroup` | The segmented control of section 4 |
| More choices | `Select` | Section 4 |
| Text input | `Input`, `Textarea` | The field of section 4 |
| Messages in the Studio | `Alert` | A notice: state fill, state notice text, a 20 px icon, a bold first line, then what to do. One optional action button (Card fill, state edge) |
| Lists in the Studio | `Table` | Head: 14 px, Soft ink, a 1 px Soft cream line. Rows: 1 px Soft cream lines, none after the last row; Paper fill on hover |
| Overlays | `Dialog` | Studio only. A child screen has no overlay |
| Page position | Progress pill | Player. Section 12.3 |
| A character speaks | Bubble | Player. Section 12.3 |
| A book | Book | Player. Section 12.1 |

## 7. Layout

Spacing (px): 4, 8, 12, 16, 20, 24, 32, 48. Inside a dense control the half
steps 6, 10, and 14 are allowed.

| Surface | Layout |
| :-- | :-- |
| Player, wide (width 900 px or more, height 700 px or more) | A page panel with a 96 px Desk gutter on each side. Section 12.3 |
| Player, narrow or short | The page panel has the full width. Section 12.3 |
| Studio | Desktop first. Header 64 px high. Content max width 1360 px, side padding 24 px, 22 px between cards. Under 1024 px the columns wrap to one column. There is no phone layout |

Dividers are 1 px Soft cream. A field border is 2 px. The selection outline
is 2 px. The ring of the current thumbnail is 3 px. No other line weights.

## 8. Imagery

- Paper-craft: painted paper texture, hand-cut shapes, flat layers. The
  style source is `modules/material/00_storybook_design/guideline/`.
- The cast is the 13 Producer characters. Pip is one of them, not a mascot
  with its own rules.
- Nothing frightening. No photos. No stock images.

### A story page

- One painted backdrop fills the picture area. The cut-out layers stand in
  front of it. The narration is on paper below the picture, never on it.
- One paper texture image is tiled over the backdrop frame with
  `mix-blend-mode: multiply` (spec "5. Scene runtime"). The boards use a
  240 px tile at 32 % opacity; that is the starting value.
- A layer keeps its own colours in every sky. Section 16 explains why the
  night tint of the boards is not here.
- Until a backdrop is loaded, the picture area shows Paper, not a sky colour.

### Backdrops for the MVP

All backdrops are outdoor scenes. Each follows the art contract of the spec
("8. Asset pipeline"): the floor band (y 940 to 1200, the whole width) is
open ground, and nothing above it is needed for the story.

| Key | Made by | Palettes | Description for the model | What the painting shows |
| :-- | :-- | :-- | :-- | :-- |
| `meadow` | Code (SVG) | `day`, `cloudy`, `dusk`, `night` | "an open meadow with soft hills" | A sky and three bands of hills |
| `riverbank` | Painted (WebP) | `day`, `dusk`, `night` | "a grassy bank by a wide, slow river" | An open grass bank in the floor band. Behind it a river across the whole frame. On the far side reeds, low trees, and soft hills |
| `village-square` | Painted (WebP) | `day`, `dusk`, `night` | "an open village square with small houses far behind" | Open pale paving in the floor band. Behind it a far row of small houses and shops. At `dusk` and `night` the windows are lit |

Rules for a painted backdrop, in addition to the art contract:

- The sky is clear. It has no sun, no moon, no stars, and no cloud with a
  clear outline. `sun`, `clouds`, and `stars` are scenery layers that the
  model places in the `sky-*` slots.
- The sky colour of a variant is the "Sky" value of its palette (section 2).
- The 400 units of bleed on each side continue the scene. They hold nothing
  that the 4:3 stage needs.
- No sign, clock face, or other shape has letters or numbers.

The news is told as a story of the cast in their own world. A page does not
show the real place of the news (a far country, a laboratory). A new
backdrop joins the list only when stories on real news texts cannot be
placed (S2 results, or the operator's notes).

### Other pictures

- A cover on the shelf is the picture of page 1 of its book.
- The Start gate shows the picture of page 1. The end page shows the
  backdrop of the last page without its layers.
- The torn paper edge between the picture and the narration belongs to the
  narration panel. It lies over the bottom of the picture and covers at
  most 16 stage units (1.3 % of the stage height) at any point. It does not
  change the size or the shape of the stage.

## 9. Writing on the page

- Plain English. Short sentences. Sentence case. No emoji. No made-up words.
- Child screens: a label has one or two words and stands next to a picture
  ("Start", "Home", "Read again"). A quiet state is gentle and never names
  a fault: "Opening the book", "This book is sleeping. Come back soon.",
  "The end".
- Studio: a message says what happened, what was kept, and what to do next.
  For example: "This page changed after you opened it. Nothing was saved.
  Load the latest text, then make your change again."
- The Studio shows an identifier of the spec (`needs_review`,
  `backdrop_sky_mismatch`, a template ID, an asset key) as it is written
  in the spec.
- The link to the news source is in the Studio only.

## 10. Child surfaces

Many children of 5 to 7 are still learning to read. A child screen must
work for a child who cannot read.

| Rule | How |
| :-- | :-- |
| Hear first | Every page plays its narration. The text is never the only way to get the story. There is no word highlighting |
| No reading to move around | Every control has a picture: play, house, arrows, a round arrow. A label is an addition |
| Big targets | A child target is at least 64 x 64 px, with at least 12 px between targets |
| Few controls | At most 3 controls on a screen. A control is a button of the Player frame: home, previous, next, Start, Read again. A book on the shelf and a character in a picture are content, not controls; the size rule applies to them, the count does not |
| One thing per page | One picture and one short text. Nothing scrolls inside a story page |
| Safe to tap anything | A tap never punishes. No timers, no scores, no losing. No red, no cross, no failure state. A fault shows as a quiet state |
| No way out | No link leaves the product. No source link, no sharing, no settings, no sign-in on a child screen |
| No child data | The Player sends no personal data to a server. Progress stays in the browser |

The Studio is for an adult: targets are at least 44 px.

## 11. 3D layer

Not used. ADR 0015 superseded the three.js layer of ADR 0014. The Player
draws with `packages/scene-runtime` only (SVG, WebP, HTML, and the Web
Animations API).

## 12. Player screens

The Player has one frame for the Start gate, the reading page, and the end
page, so that only the content changes between them.

Until the shelf exists (section 16, open item 1), no screen shows a Home
control: not the Home round button, not the Home button of the end page,
and not the Home button of the resting state. A control without a target
is not shown.

### 12.1 Bookshelf

The spec does not define the shelf yet (section 16). This is its look.

| Part | Look |
| :-- | :-- |
| Ground | The `day` meadow, full screen, with the paper texture |
| Name | "Lullabyte", top left, 32 px, weight 800, Deep teal |
| Shelf | Wood, centred, two boards. Each board holds 3 books; the shelf shows up to 6 |
| Book | 180 x 224 px. A cloth cover with a hard edge, a darker spine strip of 13 px, page edges on the open side, and a tilt of at most 1.2 degrees. The cover picture is page 1 of the book. A Paper plate at the top holds the title: 18 px, weight 700, Ink, 2 px edge |
| Cloth colours | Coral, Cobalt, Sun yellow, `#3B4F7D`, `#6E9F45`, Teal, in this order. Each has a darker edge. A colour is decoration; it has no meaning |
| Friends | One or two characters stand by the shelf. One floats. A tap makes it bounce and say "Pick a story!" in a bubble |

The whole book is the button. Its accessible name is "Open the book" and
the title. The shelf has no other control.

### 12.2 Start gate and quiet states

The page panel shows the picture of page 1. The narration panel holds one
action for each state.

| State | When | Picture | Panel |
| :-- | :-- | :-- | :-- |
| Loading | Until the manifest, every page JSON, and the assets of page 1 are loaded | Paper | "Opening the book" (28 px), three waiting dots in Deep teal, and the Start button, disabled (PLY-04.S10) |
| Ready | When they are loaded | Page 1, with its looping animations; no tap handling | The title (40 px) and the Start button: play icon, "Start", `child` size |
| Resting | The book cannot be opened | A calm night picture that the app bundles | "This book is sleeping. Come back soon." and a Home button (`child` size, house icon) |

- The Home round button is at the top left in every state, in the same
  place as on the reading page.
- A tap on "Start" unlocks the audio and starts the narration of page 1
  (PLY-02.S1). The panel changes to the narration with a 200 ms cross-fade.
  The picture does not change.
- The spec does not define the trigger of the resting state (section 16).

### 12.3 Reading page

```text
wide: width >= 900 px and height >= 700 px

 Desk    +------------- page panel (Paper) -------------+    Desk
 96 px   |                                              |   96 px
 [home]  | (3 / 5 ooo)                                  |
         |          picture area                        |
 [prev]  |   bleed |   4:3 stage   | bleed              | [next]
         |                                              |
         |~~~~~~~~~~~~~~ torn paper edge ~~~~~~~~~~~~~~~|
         |        narration, centred, on Paper          |
         +----------------------------------------------+
```

| Part | Wide layout (board 3, 1194 x 834 px) |
| :-- | :-- |
| Ground | Desk |
| Page panel | Paper, from the top of the screen to the bottom, 96 px from each side |
| Picture area | The panel above the narration. The stage keeps 4:3; the bleed fills the rest of the width up to 2:1 (spec "5. Scene runtime") |
| Narration panel | 244 px high: 5 lines of narration and 20 px above and below. The text is centred, at most 760 px wide, 28 px / 1.45, weight 600, Ink, `text-wrap: pretty` |
| Home | Round button, 64 px, house icon, top left in the gutter |
| Progress pill | Right of Home, over the top of the picture. Card fill, hard edge, 44 px high. It holds the count ("3 / 5", 18 px, weight 800) and one dot for each page: the current page is a 22 x 8 px Deep teal bar, a read page is an 8 px `--dot-read` dot, a page to come is an 8 px `--dot-ahead` dot. It is a status, not a control. Its accessible name is "Page 3 of 5" |
| Previous, next | Round buttons, 64 px, arrow icons, in the gutters, at the middle height of the picture. On page 1, "previous" is disabled |
| Bubble | Card fill, hard edge, a small tail, over the stage above its layer. At most 60 % of the stage width; a longer text wraps. It stays inside the stage |

The frame has 3 controls: home, previous, next.

The narration panel has one height on every page of a book, so the picture
does not change size on a page turn. The height must hold a page of 40
words (the longest legal text). The 5 lines are an estimate: about 240
characters at about 54 characters a line. It was not measured in a browser.
A renderer test with a 40-word page checks each layout. If the test fails,
the panel gets higher. The text does not get smaller than the size of its
layout.

No board exists for the narrow and the short layout. These are starting
values; the device tests of PLY-03 confirm or change them.

| Layout | When | Rules |
| :-- | :-- | :-- |
| Narrow | Width under 900 px, height 600 px or more | The page panel has the full width and no gutter. The stage is at the top, at the full width. Home and the progress pill lie over the top left of the picture. The narration (22 px / 1.45) fills the rest. "Previous" and "next" are at the bottom left and the bottom right of the narration panel |
| Short | Height under 600 px | The page panel has the full width. The narration is 18 px / 1.4, between "previous" on the left and "next" on the right. The panel is as high as a 40-word page needs. The stage gets the height that is left. Home and the progress pill lie over the top left of the picture |

In every layout, a control does not cover a tappable layer of the stage. A
tappable layer has a hit area of at least 64 x 64 px, centred on the layer.

### 12.4 Page turn

The rules are in the spec ("5. Scene runtime", PLY-04). The values:

| Part | Value |
| :-- | :-- |
| What turns | The page sheet: the picture area and the narration panel, on opaque Paper |
| Axis | The left edge of the page panel (`transform-origin: 0 50%`) |
| Perspective | 2600 px on the page panel |
| Forward | The old sheet rotates from 0 to -100 degrees about the Y axis. It is opaque until 85 % of the time, then fades to 0. The new sheet lies below it |
| Backward | The new sheet rotates from -100 degrees to 0 over the old one. It fades in during the first 15 % |
| Time | 500 ms, `cubic-bezier(0.4, 0.1, 0.5, 1)` |
| Shade | An Ink layer on each sheet, opacity only, linear: 0 to 0.28 on the sheet that turns away, 0.22 to 0 on the sheet below. Backward: the reverse |
| Reduced motion | The old sheet fades out and the new sheet fades in, 200 ms. No rotation, no shade |

No filter, no blurred shadow, and no change of size during a turn. The
controls of the frame do not turn with the sheet.

### 12.5 End page

"Next" on the last page turns the page to the end page.

| Part | Look |
| :-- | :-- |
| Picture | The backdrop of the last page in its sky, without layers. The place is quiet; the cast went home. No new file is loaded |
| Panel | "The end" (40 px, weight 800), and below it two buttons in one row: "Read again" (Soft, `child` size, round-arrow icon) on the left, "Home" (Primary, `child` size, house icon) on the right, 16 px apart |
| Frame | "Previous" stays. "Next", the Home round button, and the progress pill are not shown |

The end page has 3 controls: previous, Read again, Home. It is part of the
Player, not of a release: it has no page JSON and no audio file.

| Event | Result |
| :-- | :-- |
| "Next" on the last page | The narration stops. The frame changes to the end page frame at once, so "next" is not there for a second tap. The page turns to the end page with the transition of section 12.4 |
| "Previous" on the end page, or during the turn to it | The turn, if one runs, ends at once. The page turns back to the last page, and its narration plays. The tap handler sets the `src` and calls `play()` |
| "Read again" | Page 1 replaces the end page with a 200 ms cross-fade, and its narration plays. The tap handler sets the `src` and calls `play()`. The Start gate is not shown again |
| "Home" | The Player goes to the shelf |

Until the shelf exists, the end page shows "Read again" and "previous"
only (the rule at the start of section 12). The behaviour is decision B in
ADR 0016.

## 13. Studio screens

Ground: Desk. Header: Paper, 64 px high, with a 5 px Light wood line below
it. It holds Pip (42 px, still), "Studio", the navigation, and the ghost
button "Open the Player".

### 13.1 Stories

| Part | Look |
| :-- | :-- |
| "New story" card | At most 440 px wide. A segmented control "Paste text" / "Article URL". One field. A note with the word count and the limit "200 to 2,000 words". The `lg` primary button "Make story" at the bottom right |
| Refused input (422) | A "blocked" notice in the card: what was wrong, and "No run was started." The count turns to the "blocked" chip text colour, weight 700 |
| Cut input | A "working" (information) notice: "The text had 2,640 words. The run uses the first 2,000." |
| "Stories" card | A table: Title (link), Run (chip), Pages (one chip for each state with its count), Release, Updated. A story with no release shows "None" in Soft ink |

### 13.2 Story view

| Part | Look |
| :-- | :-- |
| Title row | A Soft `icon` back button, the title (28 px), the run chip, and the ghost link "Source article" at the right |
| "Run" card | The five steps `freeze`, `script`, `scene`, `audio`, `finish`. Each has a row of cells (12 px high, fully round, one for each page or one for the step), its name, and a note. A legend gives each cell colour a word |
| "Pages" | A grid of page cards, at least 220 px wide, 16 px apart. A page card holds a preview of the page with a page number chip, the text (14 px, 3 lines), and three chips: Text, Scene, Audio, each with its state. The card moves up 2 px on hover. The whole card opens the editor |
| "Publish" card | Blocked: one "blocked" row for each page that blocks, with the reason and a Soft "Open" button; the primary button is disabled. Ready: one sentence and the primary button "Publish release 3". Done: an "ok" notice and a Soft button that opens the release in the Player |
| "Releases" card | One row for each release: its number, its time, an "On the shelf" chip on the published one, and a Soft "Open" button |

### 13.3 Page editor

Three columns: the page rail (120 px), the work area, and the side column
(320 to 360 px).

| Part | Look |
| :-- | :-- |
| Header | A ghost button back to the story, "Page 3 of 8" (16 px, weight 800), and the three target chips at the right |
| Page rail | One thumbnail for each page with its number and, below it, its state as an icon and a word. The current page has a 3 px Deep teal ring, 2 px away |
| Notice | Above the work area when the page needs attention: stale scene, needs review (with the error list), changed elsewhere (409), invalid text (422), busy (503), a run is active (409). One notice at a time |
| Layout picker | A select with the template IDs. A note next to it shows the description of the chosen template |
| Backdrop picker | A segmented control with one segment for each backdrop key, in registry order. The description of the backdrop is the tooltip. With more than 4 backdrops it becomes a select |
| Sky picker | A segmented control next to the backdrop picker. It shows only the palettes of the chosen backdrop, in the order `day`, `cloudy`, `dusk`, `night`. A missing palette is not shown. Each segment has a 22 px round swatch (the sky colour, with the near ground colour on its lower third) and the palette name. When the operator picks a backdrop without the current palette, the first palette of that backdrop is chosen (spec "6. API") |
| Stage | The 4:3 stage only, no bleed (edit mode), radius 10 px, as wide as the card |
| Selected layer | A 2 px Cobalt outline, 2 px away. Six handles: 12 px, Card fill, 2 px Cobalt border. A Cobalt chip above it with the asset key and the slot |
| Page text card | The narration field, the count ("2 of 3 sentences, 15 of 40 words"), a note that a save makes the scene and the audio stale, and the Soft button "Save text" |
| Layers card | One row for each layer, 44 px high, with a kind chip. The selected row has the "working" fill and notice text colour. A Soft button "Add layer" |
| Layer card | Pose and Expression (selects), x and Scale (fields), a "Manual position" chip with the ghost button "Back to slot", the animation, and the tap actions with the bubble count ("21 of 60") |
| "This page" card | The `lg` primary button "Save scene". Three Soft buttons in one row: "Still fits", "New scene", "New audio". The draft audio player: a 44 px round Deep teal play button, a track, and the time |

A button that cannot be used now is disabled, with the reason in the
notice. For example, "Still fits" is disabled unless the scene is stale.

## 14. Accessibility

| Topic | Rule |
| :-- | :-- |
| Targets | Child: 64 x 64 px or more, 12 px apart. Studio: 44 x 44 px or more |
| Contrast | The table in section 2. Text 4.5:1; large text, icons, and rings 3:1 |
| Focus ring | Two rings, on every focusable element, with `:focus-visible`: a 3 px Ink ring 3 px away from the element, and a 3 px Sun yellow ring directly outside it. Ink passes on every light ground; Sun yellow passes on the night sky |
| Colour | A state always has a word and an icon. A colour alone never carries a meaning |
| Names | An icon button has an accessible name: "Back to the bookshelf", "Previous page", "Next page", "The end" (for "next" on the last page), "Start the story", "Read again". A character button has the name of the character |
| Regions | The narration is a live region (`aria-live="polite"`). The progress pill and a bubble have `role="status"`. A Studio notice that reports a refused action has `role="alert"` |
| Hidden sheets | During a page turn, the sheet that is not current has `aria-hidden` and takes no pointer events |
| Motion | Section 5, reduced motion |
| Keyboard | Every control is a real button or link, in reading order. No function needs a pointer, except dragging a layer in the Studio, which the x and Scale fields replace |
| Text | Real text, never text in an image. The narration is at least 18 px |
| Sound | Narration starts only after the tap on "Start" |

## 15. What not to do

- No blurred shadow, glow, glass effect, gradient fill, or bevel. The hard
  edge is the only depth.
- No word highlighting during narration (out of scope in the requirements).
- No red, no cross, and no failure wording on a child screen. Coral and the
  "blocked" state are for the Studio.
- No link out of the product, no source link, no sharing, and no settings
  on a child screen.
- No text on the stage or on a backdrop. No text over the picture except a
  bubble and the progress pill.
- No filter on a layer and no filter during a page turn.
- No dark mode. No second font family. No upper-case labels. No emoji.
- No native `<select>`, and no stock shadcn grey or blue.
- No motion that flashes, spins, or shakes. No motion on its own in the
  Studio.
- No code from a model in the browser, and no SVG with a script or an event
  attribute (ADR 0015).
- No fourth control on a child screen.
- No Sun yellow or Teal as a text colour. No Sun yellow alone as a ring on
  a light ground.

## 16. Differences and open items

### Differences from the approved boards

| Board | This file | Reason |
| :-- | :-- | :-- |
| Home round button is 60 px | 64 px | The child target rule |
| Studio small buttons, segments, layer rows, and the audio play button are 40 px | 44 px | The Studio target rule |
| The primary button of the editor is 48 px | 52 px (`lg`) | One height for the main action |
| The focus ring is one Sun yellow ring | Two rings, Ink and Sun yellow | Sun yellow has 1.6 to 2.0:1 on the light grounds; a ring needs 3:1 |
| Unselected segments on the stories board use Soft ink | Mid ink | Soft ink has 4.3:1 on Soft cream |
| The disabled Soft button is paler than the disabled primary button | One disabled look | The paler text has 2.9:1; one look is simpler |
| Sizes 17, 27, and 30 px | 18, 28, and 32 px | One scale |
| The narration is at most 660 px wide in a 224 px panel | 760 px wide in a 244 px panel | A 40-word page must fit at 28 px. The board panel holds 4 lines; the estimate is 5 (not measured in a browser) |
| The loading state has no Start button | A disabled Start button | PLY-04.S10: "Start" is enabled only when the book is loaded |
| The bubble has radius 22 px and does not wrap | 24 px, wraps at 60 % of the stage width | One radius with the card; a 60-character bubble must fit a phone stage |
| The stage in the editor has radius 12 px | 10 px | One radius for a picture in a card |
| A notice has radius 14 or 18 px by board | 14 px in a card, 18 px alone | One rule |
| The torn paper edge is 48 px high over the picture | At most 16 stage units over the picture | It must not cover the feet of the cast (foot points start at y 960) |
| Cut-outs are dimmed and tinted by the sky with a CSS `filter` | Not included | The spec has no tint rule and allows no per-layer filter. Open item 4 |
| The night meadow has a moon; the meadow has a river | Not included | The spec makes `meadow` from a sky colour and three hills. A moon would lie under the `sky-*` slots |
| The editor has a dashed "text zone" on the stage, and the error "overlaps the text zone" | Not included | The spec has no text zone; the narration is below the stage |
| The loading state shows Pip on a day meadow | Paper | The spec shows the paper colour until the backdrop is loaded |
| The table head has a 2 px line | 1 px | One weight for dividers |
| The boards load Baloo 2 from Google Fonts | The font is bundled | No request to another service from a child screen |
| The editor uses native selects | The shared `Select` | One component |
| Page previews in the Studio | Same as the boards (the frame at 1002:610) | No change; listed because edit mode shows the stage only |

### Taste rules

The owner's general taste rules and the repository `TASTES.md` were written
before the boards. Where they disagree with the approved boards, the boards
win. That holds for the child screens in every case. For the Studio:

| Rule | Result |
| :-- | :-- |
| At most 4 font sizes, the smallest 12 px | Kept in the Studio (14, 16, 20, 28 px). The Player has more, for children |
| 0.5 px hairlines | Not kept. A 0.5 px Soft cream line cannot be seen on Card. Dividers are 1 px, one weight |
| No ambient or replaying motion | Kept in the Studio. Not kept in the Player: characters float and blink |
| Contrast in a light and a dark theme | One light theme. The product has no dark mode |
| No bordered container inside a bordered container | Kept (section 4, "Edges") |
| The chevron of a select is not closer to the edge than the text | Kept (section 4) |
| shadcn Base UI components for structure | Kept |
| Repository `TASTES.md`: Kiwi Maru and Nunito, a night reading stage, watercolor skies, radii 22 and 16 px, "the only shadow is the primary button's edge", a 3D layer | Out of date. It describes the earlier look. It needs an update to this file |

### Open items

These are not decided here. Each needs the spec or the owner.

1. **The shelf is not in the spec.** There is no route for it, no public
   list of published releases, and no rule for more than 6 books. Section
   12.1 gives the look only. Every Home control depends on it.
2. **The resting state has no trigger in the spec.** The spec does not say
   what the Player shows when a release does not exist or does not load.
   It also needs a bundled picture, because registry assets are served only
   inside a release.
3. **The hit area of a tappable layer.** Section 12.3 asks for at least
   64 x 64 px. The spec has no rule for it.
4. **Cut-outs on a night backdrop.** The approved boards dim the cast at
   night. Without it, a day-coloured character stands on a night painting.
   A rule needs a way that holds the frame time target (for example a
   night version of each asset, or one layer over the stage), and a spec
   change.
5. **A moon.** The scenery boards have `sun`, `clouds`, and `stars`, and no
   moon. A night page can show stars only.
6. **The torn paper edge.** The spec says that the stage is never cropped.
   Section 8 lets the edge lie over at most 16 stage units. The spec should
   allow it or forbid it.
7. **The narrow and the short Player layout** have no approved board.
8. **Code that this file makes stale:** `apps/storybook/src/styles.css` and
   `tokens.test.tsx` (the earlier 28 tokens), `apps/storybook/src/main.tsx`
   (Kiwi Maru and Nunito), `packages/scene-runtime/src/sky.ts` (the earlier
   sky colours), the shared `Button` (issue #58 names the primary edge as
   the only shadow; section 4 has more edges and a `round` variant).
