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

A part marked **Proposal** is not a rule. It waits for a decision in the
spec (section 16, open items). Do not build it and do not write a test
against it until the spec defines it.

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
| Teal | `--teal` | `#21A193` | Fill only: "done" cells, the dot of a read page, a book cloth. Never text (3.1:1 on Card) |
| Cobalt | `--cobalt` | `#2350C8` | Studio: the "working" state and the selected layer |
| Sun yellow | `--sun` | `#E2AE4A` | The outer focus ring; the fill of a "needs review" cell, always with a border |
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
| `--dot-ahead` | `#E6D9C4` | Fill of a page-to-come dot (progress pill) and of a waiting cell (run progress). Always with a 2 px Soft ink border, because the fill alone has 1.4:1 on Card |

The earlier `--dot-read` (`#8CCFC6`, 1.7:1 on Card) is removed. A read page
uses Teal.

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

Run progress cells stand on Card. A legend with words is next to them.

| Cell | Fill | Border (2 px, inside the cell) |
| :-- | :-- | :-- |
| done | `--teal` | none |
| working | `--cobalt` | none |
| needs review | `--sun` | `#7A5410` (the chip text colour of "needs review") |
| waiting | `--dot-ahead` | `--ink-3` (Soft ink) |

### Sky palettes

The four palettes are the closed list `day`, `cloudy`, `dusk`, `night`
(`SKY_PALETTES`). The code-made `meadow` backdrop uses the Sky and the three
ground values as flat fills. A painted variant takes its dominant sky colour
from the same row, so that painted and code-made pages belong to one book.
The river of `riverbank` takes its dominant colour from the Water column.
`meadow` has no water. A painting may have soft gradients (section 8).

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
| Mid ink on Soft cream | 6.3 | Unselected segment; text of a disabled Studio button |
| Card on Deep teal | 5.1 | Button text |
| Deep teal on Card, Paper | 5.1, 4.9 | Icons and text |
| Deep teal on Desk, `day` sky, `dusk` sky | 4.4, 4.0, 3.6 | Icons and large text only. Small text uses Teal text |
| Teal text on Card, Desk, Soft, Soft cream | 6.7, 5.8, 5.6, 5.4 | Links and button text |
| State chip text on its fill | 5.1 to 6.3 | Table "Studio states" |
| State notice text on its fill | 5.8 to 8.3 | Table "Studio states" |
| Teal on Card | 3.14 | Fill only, never text: a "done" cell, the dot of a read page |
| Teal on Paper | 3.02 | Passes by 0.02 only. A Teal mark that carries a meaning stands on Card |
| Cobalt on Card | 6.8 | A "working" cell; the outline of the selected layer |
| Coral on Card | 3.7 | Fill only, never text |
| `--dot-ahead` on Card | 1.37 | **Never alone.** A page-to-come dot and a waiting cell have a 2 px Soft ink border |
| Soft ink on Card (as a border) | 5.4 | The border of a page-to-come dot and of a waiting cell |
| Sun yellow on Card, Paper, Desk, `day` sky | 1.99, 1.9, 1.7, 1.6 | **Never alone** as a ring, a cell, or a mark on a light ground |
| `#7A5410` on Card (as a border) | 6.7 | The border of a "needs review" cell |
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
| Book title on the Start gate | 40 px / 1.1 in the Wide layout; 28 px / 1.1 in the Narrow and the Short layout (section 12.2). At most 2 lines | 800 |
| "The end" | 40 px / 1.1 (28 px in the Short layout, section 12.5) | 800 |
| Label of the Start button; "Lullabyte" on the shelf | 32 px / 1 | 800 |
| Narration | 28 px / 1.45 (steps 22 px and 18 px, section 12.3) | 600 |
| Message of a quiet state; label of a child button other than Start | 28 px / 1.3 (the message is 22 px / 1.3 in the Short layout, section 12.2) | 600 message, 800 label |
| Speech bubble on a stage | 64 stage units / 1.3 (not CSS px; section 12.3) | 700 |
| Speech bubble outside a stage (the shelf) | 20 px / 1.3 | 700 |
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
| Card; a speech bubble outside a stage | `24px` |
| Speech bubble on a stage | 48 stage units (section 12.3) |
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
| Primary button, `child-start` and `child` size | `0 5px 0 var(--teal-edge)` |
| Primary button, standard size | `0 4px 0 var(--teal-edge)` |
| Soft button | `0 3px 0 var(--soft-edge)` |
| Round button, card, page card, progress pill, a bubble outside a stage | `0 3px 0 var(--edge)` |
| Bubble on a stage | 6 stage units down, `var(--edge)` (section 12.3) |
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
| `child-start` | 76 px | 0 46 px 0 34 px | 32 px, 800; icon 34 px | Start |
| `child` | 68 px | 0 38 px 0 30 px | 28 px, 800; icon 30 px | Read again; Home in the resting state |
| `child-icon` | 64 x 64 px | none | icon 28 px, stroke 3 | Home, previous, next |
| `lg` | 52 px | 0 28 px | 16 px, 800 | The one main action of a Studio card |
| `default` | 44 px | 0 20 px | 16 px, 700 | Studio |
| `icon` | 44 x 44 px | none | icon 20 px | Studio |

States:

| State | Look |
| :-- | :-- |
| Pressed | Primary: moves down 3 px (`child-start`, `child`) or 2 px, and the edge becomes 2 px. Soft: moves down 2 px, edge 1 px. Round: scale 0.94 |
| Hover | Ghost and table rows only. No function depends on hover |
| Focus | Section 14 |
| Disabled, Studio | Soft cream fill, Mid ink text (6.3:1), `--disabled-edge`, `cursor: not-allowed`. One look for every variant |
| Disabled, Player | Opacity 0.35. Used only for "previous" on page 1 and for "Start" while the book loads. The button has `aria-disabled="true"`, not the `disabled` attribute: it keeps the focus and does nothing when it is pressed |

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
| Panel swap (Start to page 1) | 200 ms cross-fade of the narration panel. The picture keeps its size and its place, and the `enter` animations of page 1 play (section 12.2) |
| "Read again" (end page to page 1) | 200 ms cross-fade of the page sheet. A tap on "next" or "previous" ends it at once (section 12.5) |
| Late image | 200 ms fade-in |
| Speech bubble | Appears with scale 0.6 to 1 and opacity 0 to 1, 220 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Waiting dots | Opacity 0.3 to 1 and back, 1.8 s, ease-in-out; each dot starts 0.3 s after the one before |
| Cover on the shelf | 200 ms fade-in, as a whole, when every file of the cover is loaded |
| Shelf page change | 200 ms cross-fade of the books. The shelf and the arrows do not move |
| A character on the shelf (**Proposal**, section 12.1) | Floats 6 px up and down, 4 s, ease-in-out |
| A tapped character on the shelf (**Proposal**, section 12.1) | Bounce: up 18 px, 600 ms, `cubic-bezier(0.3, 1.6, 0.5, 1)`, 2 times |

- A character is not UI. On a story page, its animation comes from the
  scene (the closed primitive list of the spec), not from this table.
- The picture of the Start gate is page 1. Its `loop` animations come from
  the scene. It has no tap handling, so nothing bounces there. Its
  `enter` animations wait for "Start" (section 12.2).
- In the Studio, nothing moves on its own. Pip in the header is still.
- Reduced motion (`prefers-reduced-motion`): loops are off, the dots are
  still, a button has no transition, a bubble, a late image, and a cover
  appear at once, and the page turn is the cross-fade.
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
| Player, wide (width 900 px or more and height 600 px or more) | A page panel with a 96 px Desk gutter on each side. Section 12.3 |
| Player, short (width 640 px or more and height under 600 px) | The page panel has the full width, with a control rail on each side. Section 12.3 |
| Player, narrow (every other viewport) | The page panel has the full width, with a top bar and a control row. Section 12.3 |
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
  `mix-blend-mode: multiply` (spec "5. Scene runtime"). The tile is in
  stage units, so it scales with the stage: 480 x 480 units, repeated from
  the top left corner of the 2400 x 1200 frame (5 tiles across, 2.5 down),
  at 32 % opacity. The boards use a 240 px tile on a stage at about half
  scale; 480 units is that value, and it is the starting value. In edit
  mode the stage shows the same part of the pattern as in the Player.
- A layer keeps its own colours in every sky. Section 16 explains why the
  night tint of the boards is not here.
- Until a backdrop is loaded, the picture area shows Paper, not a sky colour.

### Backdrops for the MVP

All backdrops are outdoor scenes. Each follows the art contract of the spec
("8. Asset pipeline"), in stage units: the ground band (the whole stage
width, y 740 to 1200) is flat, open ground with no painted object and no
water. Painted water, houses, and trees end at y 740 or higher, and nothing
above the ground band is needed for the story. The reason: the scenery
slots stand at y 760 to 880 and at y 1000, and the character foot points at
y 960 to 1200.

| Key | Made by | Palettes | Description for the model | What the painting shows |
| :-- | :-- | :-- | :-- | :-- |
| `meadow` | Code (SVG) | `day`, `cloudy`, `dusk`, `night` | "an open meadow with soft hills" | A sky and three bands of hills |
| `riverbank` | Painted (WebP) | `day`, `dusk`, `night` | "a grassy bank by a wide, slow river" | An open grass bank in the ground band. Behind it, above y 740, a river across the whole frame. On the far side reeds, low trees, and soft hills |
| `village-square` | Painted (WebP) | `day`, `dusk`, `night` | "an open village square with small houses far behind" | Open pale paving in the ground band. Behind it, above y 740, a far row of small houses and shops. At `dusk` and `night` the windows are lit |

Rules for a painted backdrop, in addition to the art contract:

- The sky is clear. It has no sun, no moon, no stars, and no cloud with a
  clear outline. `sun`, `clouds`, and `stars` are scenery layers that the
  model places in the `sky-*` slots.
- The dominant sky colour of a variant is the "Sky" value of its palette
  (section 2). Soft gradients are allowed; the sky does not have to be one
  flat fill.
- The dominant colour of the river of `riverbank` is the "Water" value of
  its palette. `village-square` has no water.
- The 400 units of bleed on each side continue the scene. They hold nothing
  that the 4:3 stage needs.
- No sign, clock face, or other shape has letters or numbers.

The news is told as a story of the cast in their own world. A page does not
show the real place of the news (a far country, a laboratory). A new
backdrop joins the list only when stories on real news texts cannot be
placed (S2 results, or the operator's notes).

### Other pictures

- A cover on the shelf is the picture of page 1 of its book, as a still
  scene: no animation and no tap (spec "5. Scene runtime", "Still mode").
  The picture window of a book is narrower than 4:3, so the stage is cut
  at the left and the right (section 12.1). No file is made for a cover.
- The ground of the shelf and the picture of the Resting state are drawn
  by the Player: inline SVG and CSS in the Player source, with the colours
  of section 2. The shelf ground is the `day` palette: the Sky colour with
  three hills. The Resting picture is the `night` palette: the Sky colour
  with three hills, and star shapes in the Moon colour. They are not registry assets, because a
  registry file is served only inside a release. They need no request.
  The round signs of the empty and the failed shelf are cuts of these two
  pictures (section 12.1).
- The Start gate shows the picture of page 1. The end page shows the
  backdrop of the last page without its layers.
- The torn paper edge between the picture and the narration belongs to the
  narration panel. It is the top 12 px of that panel: a Paper shape with an
  irregular top line, on a strip of `--edge`. The strip reads as the
  thickness of the paper, like a hard edge. The picture area ends at the
  top of the strip. The edge never lies over the stage or the bleed, so
  the stage is not cropped (spec "5. Scene runtime").

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
| Big targets | A child control is at least 64 x 64 px, with at least 12 px between controls |
| Few controls | At most 3 controls on a screen. A control is a button of the Player: Home, previous, next, Start, Read again. A book on the shelf and a character in a picture are content, not controls, and the count does not apply to them. The size of a book is in section 12.1. A tappable layer has a hit area of 64 x 64 px or more, cut at the stage edge (section 12.3) |
| One thing per page | One picture and one short text. Nothing scrolls inside a story page or on the shelf |
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

The shelf at `/` is the home of the Player. A book is at
`/read/:releaseId` (ADR 0017).

**The Home rule.** A Home control goes to the shelf. It has a house icon and
the accessible name "Home". Every screen of a book has exactly one Home
control. The shelf has none.

- A tap on Home stops the narration and any sound effect, and shows the
  shelf at once. It asks no question.
- Home works during a page turn. It is a frame control: it is never
  inert, and no page sheet lies over it (section 12.4).

| Screen | Home control |
| :-- | :-- |
| Shelf | None |
| Start gate, Loading and Ready | The Home round button (`child-icon`), in the place it has on the reading page |
| Reading page | The Home round button. Its place is given for each layout in section 12.3 |
| End page | The Home round button, in the same place |
| Resting | A Home button with a label (`child` size) in the panel. No Home round button |

### 12.1 Bookshelf

The shelf is the home of the Player, at `/` (ADR 0017). The behaviour is in
the spec ("9. Player screens"); the look is here. The book size, the wood
colours, the cloth colours, and the 2 boards of 3 come from the approved
board. The other Wide sizes are arithmetic for this file. They were not
measured on the board or in a browser. No board exists for Narrow and
Short; their values are starting values (section 16, open item 7).

| Part | Look |
| :-- | :-- |
| Ground | The `day` palette (section 2): the Sky colour with three hills in the Far, Mid, and Near ground colours, as flat fills, full screen, with the paper texture. The Player draws it (section 8, "Other pictures") |
| Name | "Lullabyte", 32 px / 1, weight 800, Deep teal. 24 px from the left and 20 px from the top |
| Shelf | Wood, centred, with boards. One board holds one row of books. The wood colours are from the board: `#EAD2AB` (back), `#B8774A` (boards and sides), `#D29A68` (the light top of a board), `#8E5533` (under edges and feet), `#A5673D` (grain). No text stands on the wood |
| Book | 180 x 224 px at full size. A cloth cover with a hard edge, a darker spine strip of 13 px, page edges on the open side, and a tilt of at most 1.2 degrees. A title plate stands above the picture window. No part of the plate lies over the picture |
| Title plate | Paper, with a hard edge of 2 px below it (`0 2px 0 var(--edge)`). 52 px high: 6 px, a text box of 40 px, and 6 px. 8 px of padding at each side. As wide as the picture window. The title: 18 px / 1.1, weight 700, Ink, at most 2 lines, centred in the text box. A longer title is cut with an ellipsis; the accessible name has the whole title |
| Picture window | 151 x 148 px on a 180 px book, below the plate. Paper until the cover is loaded |
| Cover | Page 1 of the book as a still scene with `fit="cover"` (spec, "Still mode" and "Fit"). The stage gets the height of the window and is centred, and the window cuts its left and right parts. On a 180 px book, stage x 188 to 1412 shows (arithmetic), so a wide figure in an outer slot can lose its outer part (ADR 0017, "Crop"). No filter. It appears as a whole with a 200 ms fade |
| Cloth colours | Coral, Cobalt, Sun yellow, `#3B4F7D`, `#6E9F45`, Teal, in this order, by the place of the book on the shelf page. Each has a darker edge. A colour is decoration; it has no meaning |

**The parts of a book**, from the top. `s` is the book width divided by
180.

| Part | On a 180 px book | On a smaller book |
| :-- | --: | :-- |
| Cloth | 8 px | Scales with `s` |
| Title plate | 52 px | Stays 52 px |
| Hard edge of the plate | 2 px | Stays 2 px |
| Cloth | 6 px | Scales with `s` |
| Picture window | 148 px | The height that is left: `202 s - 54` px |
| Cloth | 8 px | Scales with `s` |
| Sum | 224 px | `224 s` px |

- A book keeps the ratio 180:224 at every width. Its widths (the spine
  strip, the window, the plate) and its cloth scale with it. The title
  stays 18 px, so the plate stays 54 px high with its edge, and the window
  gets the height that is left.
- A smaller book has a window that is less upright, so its cover shows
  more of the stage. The 180 px book is the tightest crop.
- A book is never narrower than 128 px (128 x 159 px, with a window of
  107 x 90 px and about 10 letters in a title line). A viewport that
  cannot hold its shelf page at that size is not covered (section 16, open
  item 7).

**Shelf page.** The books that show at one time.

| Layout (section 12.3) | Shelf page | Book width | Arrows |
| :-- | :-- | :-- | :-- |
| Wide | 6 books: 2 boards of 3 | 180 px when `h` >= 612. Below that, the book height is (`h` - 164) / 2 and the width follows: 175 x 218 px at `h` = 600 | Centred in the 96 px gutters, at the middle height of the shelf |
| Narrow | 4 books: 2 boards of 2. With `h` < 700: 2 books on 1 board | The largest width up to 180 px that leaves 16 px at each side and between books, and whose height fits the space between the name and the control row | In a control row at the bottom, 88 px high, at the left and at the right |
| Short | 3 books on 1 board | The largest width up to 180 px that fits between the rails with 12 px between books, and whose height fits below the name | At the bottom of the left rail and of the right rail |

**The Wide shelf** (arithmetic, not measured in a browser). `B` is the
book height.

| Part | Value |
| :-- | :-- |
| Name band | 64 px: 20 px, the 32 px name, and 12 px. The shelf starts below it |
| Shelf height | A top board of 16 px. For each of the 2 boards: 12 px of free space, the book, and a board of 16 px. Feet of 12 px. Together 2 `B` + 84 px |
| Free space above a book | 12 px. It holds the tilt (2 px) and the hover move (6 px, section 5) |
| Below the shelf | 16 px or more |
| Shelf width | 3 books, 24 px between books, 20 px from a book to a side, and sides of 16 px: 3 book widths + 120 px |
| Place | Centred between the gutters, and centred in the height that the name band and the 16 px leave |

| Viewport | Book | Shelf | Check |
| :-- | :-- | :-- | :-- |
| 1194 x 834 (the board) | 180 x 224 px | 660 x 532 px | 64 + 532 + 16 = 612 px of 834 px |
| 900 x 600 (smallest Wide) | 175 x 218 px | 645 x 520 px | 64 + 520 + 16 = 600 px, the whole height. 645 px of the 708 px between the gutters. Nothing scrolls |

- The arrows are the "previous" and "next" round buttons (`child-icon`, 64
  px). They are shown only with more books than one shelf page. On the
  first shelf page "previous" is disabled, and on the last "next" (section
  4, `aria-disabled`). Their names are "Previous books" and "Next books".
- A change of shelf page is a 200 ms cross-fade of the books. The shelf,
  the ground, and the arrows do not move. Nothing scrolls.
- The whole book is one link. Its accessible name is "Open the book" and
  the title. A book is content, not a control (section 10).
- The shelf has at most 2 controls, and no Home control.

| State | Look |
| :-- | :-- |
| Waiting | The shelf with no book. Three waiting dots in Deep teal on a Paper plate (2 px edge), centred on the shelf |
| Books | The books of the shelf page |
| Empty | The shelf with no book. On a Paper plate, centred on the shelf: the day sign, and below it "New stories are coming soon." (28 px / 1.3, weight 600, Ink). No control |
| Failed | The shelf with no book. On a Paper plate, centred on the shelf: the night sign, below it "The books are sleeping. Come back soon." (28 px / 1.3, weight 600, Ink), and below that one button: "Look again" (Primary, `child` size, round-arrow icon) |

- **The same shelf in every state.** Waiting, Empty, and Failed draw the
  shelf of the layout with all its boards (2 in Wide), at the size it has
  with books. The shelf does not change when the books arrive. The plate
  is centred on the shelf and lies over the middle board.
- **The signs.** A sign is a round picture of 64 px, 12 px above the line.
  The day sign is a cut of the shelf ground: the `day` Sky colour and the
  hills. The night sign is a cut of the Resting picture: the `night` Sky
  colour, the hills, and star shapes in the Moon colour. The Player draws
  both (section 8). They are no files, and there is no moon.
- A child who cannot read sees three different states: dots (Waiting), a
  day picture (Empty), and a night picture with a button (Failed). The
  night sign is the picture of Resting, so "sleeping" has one look.
- In the Short layout the message is 22 px / 1.3 (section 3), and the sign
  stands left of the line.
- A line of a quiet state stands on a Paper plate, never on the ground or
  on the wood, so it needs no new colour pair (section 2, "Contrast").

**Friends (Proposal).** One or two characters stand by the shelf. One
floats. A tap makes it bounce and say "Pick a story!" in a bubble. The
shelf is not a stage, so this bubble is in CSS px: 20 px / 1.3, weight
700, radius 24 px, edge `0 3px 0 var(--edge)`. This part is not a rule:
ADR 0017 does not decide it, and a character file is served only inside a
release (section 16, open item 11). Do not build it.

### 12.2 Start gate and quiet states

The page panel shows the picture of page 1. The narration panel holds one
action for each state.

| State | When | Picture | Panel |
| :-- | :-- | :-- | :-- |
| Loading | Until the manifest, every page JSON, and the first-page files are loaded | Paper | "Opening the book", three waiting dots in Deep teal, and the Start button, disabled (PLY-04.S10) |
| Ready | When they are loaded | Page 1 as the incoming page: its `loop` animations run. No `enter` animation yet, and no tap handling | The title and the Start button: play icon, "Start", `child-start` size |
| Resting | The release does not exist, or the manifest, a page JSON, or a first-page file fails before "Start" (spec "9. Player screens") | The night picture that the Player draws (section 8, "Other pictures") | "This book is sleeping. Come back soon." and a Home button (Primary, `child` size, house icon, label "Home") |

**What "Start" waits for.** The first-page files are the backdrop variant
of page 1, the first file of each layer of page 1, and the paper texture
(spec "5. Scene runtime", "Loading"). A file is loaded when the browser
can draw it. A file that arrives but cannot be decoded, or that the
sanitiser refuses, is a failed file and gives Resting. "Start" does not
wait for the narration audio: a phone browser loads no audio before the
first tap.

**Sizes by layout.** Arithmetic, not measured in a browser. For Narrow and
Short they are starting values.

| Part | Wide | Narrow | Short |
| :-- | :-- | :-- | :-- |
| Form | A stack, centred | A stack, centred | One row, centred: the text at the left, the button at the right, 16 px apart |
| Book title (Ready) | 40 px / 1.1, at most 2 lines | 28 px / 1.1, at most 2 lines | 28 px / 1.1, at most 2 lines |
| Message (Loading, Resting) | 28 px / 1.3 | 28 px / 1.3 | 22 px / 1.3 |
| Waiting dots (Loading) | Below the message, 12 px away | Below the message, 12 px away | Below the message, 8 px away, in the text group |
| Text to button | 16 px | 12 px | 16 px |
| Highest content | Ready: 88 px (2 lines) + 16 + 76 = 180 px | Resting: 73 px (2 lines) + 12 + 68 = 153 px | The Start button: 76 px |
| Lowest panel | 232 px: 180 px, 40 px of padding, and the 12 px edge. The 5 lines of narration give 256 px or more | 197 px: 153 px, 32 px of padding, and the 12 px edge | 112 px: 76 px, 24 px of padding, and the 12 px edge |
| Widest row | Not a row | Not a row | 440 px of space at `w` = 640. Loading: a message of 176 px, 16 px, and a button of 212 px, together 404 px. Resting: a line in 2 rows of 254 px, 16 px, and a button of 170 px |

- A title longer than 2 lines is cut with an ellipsis. The accessible name
  has the whole title.
- **One panel height.** The narration panel of a book is never lower than
  the "Lowest panel" of its layout. Where a 40-word page needs less, the
  panel gets that height on every page of the book (section 12.3). So the
  content of the gate fits, and the picture has the same size before and
  after "Start".
- **One frame.** In Loading, Ready, and Resting the frame parts keep their
  place and their size: the gutters of Wide, the top bar and the control
  row of Narrow, and the rails of Short. A part with no control is empty
  Paper. In Narrow the control row is empty until "Start", and in Resting
  the top bar is empty too. So nothing jumps at "Start".
- "Previous", "next", and the progress pill are not shown in Loading,
  Ready, and Resting. The frame shows only the Home control of the Home
  rule (section 12).
- The picture in Ready does not answer a tap. No layer is a button there:
  it has no `role`, no `tabindex`, and no pointer events. The reasons: the
  audio is locked until "Start", and the state has one action.
- A tap on "Start" unlocks the audio and starts the narration of page 1
  (PLY-02.S1). The panel changes to the narration with a 200 ms cross-fade.
  The picture keeps its size and its place. Page 1 becomes the current
  page: its `enter` animations play once, and tap handling starts (spec
  "5. Scene runtime", "Start gate"). A layer with an `enter` `fade-in` is
  hidden in Ready and fades in now. "Previous" (disabled on page 1),
  "next", and the progress pill appear at once.
- **A narration that fails.** If the narration of a page cannot be loaded
  or played after "Start", the page stays as it is: the picture, the text,
  and the controls. There is no sound, no sign, and no message. The child
  can turn the page. A turn away and back tries the sound again (spec
  "5. Scene runtime").
- Resting is a quiet state, not a fault screen (ADR 0017). It has one
  control, the Home button, and no sound. It has no time limit: a slow
  load stays in Loading. After "Start", the Player never changes to
  Resting.

### 12.3 Reading page

#### Layouts

`w` and `h` are the width and the height of the visible viewport in CSS px
(`100dvw` and `100dvh`). Exactly one layout is true for every viewport.
Test them in this order.

| Layout | When | For example |
| :-- | :-- | :-- |
| Wide | `w` >= 900 and `h` >= 600 | A tablet; a desktop window |
| Short | `w` >= 640 and `h` < 600 | A phone in landscape |
| Narrow | Every other viewport: `w` < 640, or `w` < 900 and `h` >= 600 | A phone in portrait; a small tablet in portrait |

Every layout gets its sizes in the same order:

1. The frame controls get their places. No frame control lies over the
   picture area.
2. The narration panel gets its height: the 12 px torn edge (section 8),
   the padding, and the lines that a page of 40 words needs at the font
   size and the text width of the layout. 40 words is the longest legal
   text. The panel is never lower than the Start gate needs (section
   12.2).
3. The picture area is the space that is left. The stage is fitted into it
   by the rules of the spec ("5. Scene runtime"): the stage keeps 4:3 and
   is never cropped. In an area between 4:3 and 2:1 the bleed fills the
   width. In an area wider than 2:1 the whole frame shows, with Paper
   beyond it. In an area narrower than 4:3 the stage has the width of the
   area, with Paper above and below it.

Nothing scrolls. The narration panel has one height on every page of a
book, so the picture does not change size on a page turn.

#### Wide

```text
wide: w >= 900 and h >= 600

 Desk    +------------- page panel (Paper) -------------+    Desk
 96 px   |                                              |   96 px
 [home]  |                                              | (3 / 5)
         |          picture area                        |
 [prev]  |   bleed |   4:3 stage   | bleed              | [next]
         |                                              |
         +----------------------------------------------+
         |~~~~~~~~~ torn paper edge, 12 px ~~~~~~~~~~~~~|
         |        narration, centred, on Paper          |
         +----------------------------------------------+
```

| Part | Wide layout (board 3, 1194 x 834 px) |
| :-- | :-- |
| Ground | Desk |
| Page panel | Paper, from the top of the screen to the bottom, 96 px from each side |
| Picture area | The panel above the narration. The stage keeps 4:3; the bleed fills the rest of the width up to 2:1 (spec "5. Scene runtime") |
| Narration panel | 256 px high on board 3: the 12 px torn edge, then 20 px, 5 lines of narration, and 20 px. 32 px of padding at each side. The text is centred. It is as wide as the panel less 64 px, and at most 760 px. 28 px / 1.45, weight 600, Ink, `text-wrap: pretty`. With `w` under 1016 the text is narrower than 760 px, a 40-word page needs more lines, and the panel is higher: 296 px (6 lines) at `w` = 900 |
| Home | Round button, 64 px, house icon. Centred in the left gutter, 16 px from each side of it, and 16 px from the top (the Home rule, section 12) |
| Progress pill | Centred in the right gutter, the count only (no dots). 44 px high and 26 px from the top, so its middle is at the height of the middle of Home (48 px). It does not lie over the picture (ADR 0017). See "Progress pill" below |
| Previous, next | Round buttons, 64 px, arrow icons, centred in the gutters. Their middle is at the middle height of the picture area. On page 1, "previous" is disabled |

The frame has at most 3 controls: Home, previous, next.

At 900 x 600, the smallest Wide viewport, the picture area is 304 px
high (arithmetic). Home ends at 80 px and "previous" starts at 120 px, so
they are 40 px apart. The pill ends at 70 px and "next" starts at 120 px,
so they are 50 px apart. Both are more than the 12 px of section 10.

#### Narrow and Short

No board exists for these two layouts. The values are starting values; the
device tests of PLY-03 confirm or change them.

| Part | Narrow | Short |
| :-- | :-- | :-- |
| Page panel | The full width, no gutter | The full width, no gutter |
| Frame parts | A top bar and a control row, both on Paper | A control rail on Paper at each side, 88 px wide (a 64 px button and 12 px on each side), from the top to the bottom |
| Home (the Home rule) | In the top bar, at the left | At the top of the left rail |
| Progress pill | In the top bar, right of Home, 12 px away, with the dots | At the top of the right rail, the count only (no dots) |
| Previous, next | In the control row, at the left and at the right, 16 px from the sides | At the bottom of the left rail and at the bottom of the right rail, 12 px from the bottom |
| Top bar | 80 px high (a 64 px button and 8 px above and below), 16 px from the sides | None |
| Control row | A frame part on Paper below the narration panel, at the bottom of the screen, 88 px high (a 64 px button and 12 px above and below). It is not part of the page sheet and does not turn with it | None |
| Narration | 22 px / 1.45. 16 px from the sides, 16 px above and below, between the torn edge and the control row | 18 px / 1.4. Between the rails, 12 px from each rail, 12 px above and below |
| Picture area | Between the top bar and the torn edge, the full width | Between the rails, above the torn edge |
| Small picture | If the picture area is less than 200 px high with 22 px narration, the narration is 18 px / 1.4 and the panel gets its height again | The narration is already at the smallest size. The stage gets the height that is left (spec) |
| Start gate, Resting, end page | A stack in the place of the narration: the text above the button, centred. Sizes in section 12.2 | One row in the place of the narration: the text at the left, the button at the right. Sizes in section 12.2 |
| Lowest narration panel | 197 px (section 12.2) | 112 px (section 12.2) |

The narration is never smaller than 18 px. The steps are fixed: 28 px in
Wide, 22 px or 18 px in Narrow, 18 px in Short. A page does not pick its
own size; one book has one size in one viewport.

#### Sizes that were checked by arithmetic

These numbers are estimates. They were not measured in a browser. They
assume that a 40-word page has about 240 characters and that a character
of Baloo 2 is about half as wide as the font size. A renderer test with a
40-word page checks each layout. If a test fails, the panel gets higher;
the text does not get smaller than the steps above.

| Viewport | Layout | Narration panel (estimate) | Picture area | Stage |
| :-- | :-- | :-- | :-- | :-- |
| 1194 x 834 (board 3) | Wide | 28 px, 5 lines, 256 px | 1002 x 578 | 771 x 578, bleed at each side |
| 900 x 600 | Wide | 28 px, 6 lines in 644 px of text, 296 px | 708 x 304 | 405 x 304, the whole frame (608 px wide), Paper beyond |
| 1024 x 650 | Wide | 28 px, 5 lines, 256 px | 832 x 394 | 525 x 394, the whole frame (788 px wide), Paper beyond |
| 844 x 600 | Narrow | 22 px, 4 lines, 172 px. That is under the lowest panel, so 197 px (section 12.2); with the top bar (80 px) and the control row (88 px) | 844 x 235 | 313 x 235, the whole frame, Paper beyond |
| 390 x 844 | Narrow | 22 px, 8 lines, 299 px; with the top bar and the control row | 390 x 377 | 390 x 292, Paper above and below |
| 375 x 553 | Narrow | 22 px would leave a picture of 86 px, so 18 px: 7 lines, 220 px; with the top bar and the control row | 375 x 165 | 220 x 165, the whole frame, Paper beyond |
| 667 x 375 | Short | 18 px, 5 lines, 162 px | 491 x 213 | 284 x 213, the whole frame, Paper beyond |

#### Progress pill

| Part | Look |
| :-- | :-- |
| Shape | Card fill, hard edge, 44 px high, fully round |
| Count | "3 / 5", 18 px, weight 800 |
| Dots | One for each page. The current page is a 22 x 8 px Deep teal bar. A read page is an 8 px Teal dot. A page to come is an 8 px `--dot-ahead` dot with a 2 px Soft ink border inside it. Only the Narrow layout shows the dots. The Wide and the Short layout show the count only |
| Read and to come | The pages before the current page are read. The pages after it are to come. Only the current page number decides this; the history does not. After "previous", the page that the child left is a page to come again. After "Read again", page 1 is current and every other dot is a page to come |
| Role | A status, not a control. `role="status"`, accessible name "Page 3 of 5". It takes no pointer events (`pointer-events: none`) |

A read dot and a dot to come differ in shape (filled, ring) and in colour.
The dots stand on the Card fill of the pill, never on Paper or on a
picture (section 2, contrast).

No frame part lies over the picture area in any layout: no control, and
not the progress pill. Board 3 has the pill over the top left of the
picture. On a Wide viewport of 900 px it would cover a part of a `sky-1`
object: up to 41 % of its width at 900 x 600, and its whole width at
900 x 827 (arithmetic in ADR 0017). So ADR 0017 moved it to the right
gutter (section 16, "Differences"). A count-only pill is about 77 px wide and fits the 96 px
gutter (arithmetic, not measured in a browser).

#### Hit area of a tappable layer

The rule is in the spec ("5. Scene runtime", "Hit area"; ADR 0017).

| Part | Rule |
| :-- | :-- |
| Drawn box | The layout box of the layer, cut at the stage edge |
| Size | The drawn box. On an axis where the box is less than 64 px on the screen, the hit area is 64 px, centred on the box. The part beyond the box is the margin |
| Stage edge | The hit area is cut at the stage edge. It is never moved. A small layer at the edge has less than 64 px on that axis |
| Overlap | A drawn box wins over every margin. Between two drawn boxes, and between two margins, the higher layer wins. The margins are in one hit layer below the drawn layers (spec) |
| Look | The margin is not drawn |
| Focus | The keyboard focus and a screen reader use the layer, not the margin. The focus ring follows the drawn box ("Focus ring of a layer" below) |
| Where | Play mode, on the current page only. The cover on the shelf, the picture of the Start gate, and the Studio have no hit area |

On a 220 px stage (the smallest row of the size table) one stage unit is
0.14 px, so most layers are under 64 px and margins overlap often. The
overlap rule decides every such tap.

#### Focus ring of a layer

A layer is inside the stage container, and that container is scaled and
clips its content. A ring that is drawn there is scaled too: a 3 px ring is
0.7 px on a 390 px stage. It is also cut at the stage edge. So the ring of
a layer is drawn in the stage overlay (spec "5. Scene runtime", "Stage
overlay"), like a bubble, but in CSS px.

| Part | Rule |
| :-- | :-- |
| Size | The two rings of section 14: 3 px Ink, 3 px away, and 3 px Sun yellow outside it. CSS px at every stage size |
| Box | The drawn box of the layer ("Hit area" above) |
| Stage edge | The ring stays inside the stage area. Where the drawn box is less than 9 px from a stage edge, the ring lies on that edge, inside it |

#### Bubble on a stage

The runtime draws a bubble in the stage overlay: a layer above the stage
container that the clip of the stage does not cut (spec "5. Scene
runtime", "Stage overlay"; ADR 0017). The bubble is scaled with the
stage. So the values of a bubble are stage units of the 1600 x 1200 stage,
not CSS px. One stage unit is the stage width in CSS px divided by 1600.

| Part | Value (stage units) |
| :-- | :-- |
| Text | 64 / 1.3, weight 700, Ink, Baloo 2 |
| Padding | 32 above and below, 44 at each side |
| Fill and edge | Card fill. A hard edge 6 units down in `--edge`. No border |
| Radius | 48 |
| Tail | A small tail, about 28 units, that points at its layer |
| Width | At most 960 (60 % of the stage width). A longer text wraps |
| Place | Above its layer. It is placed inside the stage area: 0 to 1600 across, 0 to 1200 down. It is not cut at the stage edge |

On the screen, the text is about 31 px on a 771 px stage and about 16 px
on a 390 px stage. On a smaller stage it is smaller. A bubble is an
addition: the story is in the narration, and the 18 px rule is for the
narration.

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
controls of the frame do not turn with the sheet. They are above the
sheets in the stacking order: the page panel is a stacking context of its
own. A sheet that swings past the left edge of the panel passes under
Home and "previous", and both take a tap during a turn. The frame parts are the
gutters of Wide, the top bar and the control row of Narrow, the rails of
Short, and the progress pill. During a turn, the sheet that goes away is
inert, and the layers of the new picture wait for the end of the turn
(section 14, "Inert sheets").

### 12.5 End page

"Next" on the last page turns the page to the end page.

| Part | Look |
| :-- | :-- |
| Picture | The backdrop of the last page in its sky, without layers. The place is quiet; the cast went home. No new file is loaded |
| Panel | "The end" (40 px, weight 800; 28 px in Short) and one button: "Read again" (Primary, `child` size, round-arrow icon). In Wide and Narrow the button is below "The end", 16 px away, centred. In Short they are in one row. The panel has no second button, so it fits at every width |
| Frame | "Previous" and the Home round button stay in their places (the Home rule, section 12). "Next" and the progress pill are not shown |

The end page has at most 3 controls: previous, Read again, and Home. It is
part of the Player, not of a release: it has no page JSON and no audio
file.

**The sign that the book is finished.** A child who cannot read sees the
narration stop, the cast leave, and the pill go. That must not look like a
fault. The end page gives these signs with the parts that exist:

- The page turns to the end page with the usual page turn. A fault never
  turns a page.
- "Read again" is the only Primary button on the page and the largest
  thing in the panel. Its round-arrow icon is the "play again" sign that
  children know from the end of a video.
- "Next" is not there, so nothing asks the child to go on.

No sound and no new picture is added: the spec gives the end page no audio
and no layers. These signs were not tested with children (section 16,
open item 10).

| Event | Result |
| :-- | :-- |
| "Next" on the last page | The narration stops. The frame changes to the end page frame at once, so "next" is not there for a second tap. The page turns to the end page with the transition of section 12.4 |
| "Previous" on the end page, or during the turn to it | The turn, if one runs, ends at once. The page turns back to the last page, and its narration plays. The tap handler sets the `src` and calls `play()` |
| "Read again" | Page 1 replaces the end page with a 200 ms cross-fade, and its narration plays. The tap handler sets the `src` and calls `play()`. The Start gate is not shown again. The frame changes to the frame of page 1 at once: "next" and the progress pill appear, and "previous" is disabled |
| A tap on "next" or "previous" during that cross-fade | The cross-fade ends at once, as during a turn (spec "5. Scene runtime"). "Next" then turns to page 2 (PLY-04.S12). "Previous" is disabled on page 1 and starts no turn |
| Home | The Player shows the shelf |

The behaviour is decision B in ADR 0016, with the Home rule of ADR 0017.
The focus after each event is in section 14, "Focus moves".

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
| Title row | A Soft `icon` back button, the title (28 px), the run chip, and "Source article" at the right. "Source article" is a real link (`<a>`) in the Link variant, at least 44 px high. It is not a ghost button |
| "Run" card | The five steps `freeze`, `script`, `scene`, `audio`, `finish`. Each has a row of cells (12 px high, fully round, one for each page or one for the step), its name, and a note. A legend gives each cell colour a word |
| "Pages" | A grid of page cards, at least 220 px wide, 16 px apart. A page card holds a preview of the page with a page number chip, the text (14 px, 3 lines), and three chips: Text, Scene, Audio, each with its state. The card moves up 2 px on hover. The whole card opens the editor |
| "Publish" card | Blocked: one "blocked" row for each page that blocks, with the reason and a Soft "Open" button; the primary button is disabled. Ready: one sentence and the primary button "Publish release 3". Done: an "ok" notice and a Soft button that opens the release in the Player |
| "Releases" card | One row for each release: its number, its time, an "On the shelf" chip on the published one, and a Soft "Open" button. The chip uses the "ok" state: its fill, its chip text colour, and the check icon |

### 13.3 Page editor

Three columns: the page rail (120 px), the work area, and the side column
(320 to 360 px).

| Part | Look |
| :-- | :-- |
| Header | A ghost button back to the story, "Page 3 of 8" (16 px, weight 800), and the three target chips at the right |
| Page rail | One thumbnail for each page with its number and, below it, its state as an icon and a word. The current page has a 3 px Deep teal ring, 2 px away |
| Notice | Above the work area when the page needs attention: stale scene, needs review (with the error list), changed elsewhere (409), invalid text (422), busy (503), a run is active (409). One notice at a time |
| Layout picker | A select with the template IDs. A note next to it shows the description of the chosen template |
| Backdrop picker | A segmented control with one segment for each backdrop key, in registry order. A note below it shows the description of the chosen backdrop, like the note of the layout picker. There is no tooltip: a tooltip needs hover, and an iPad has none. With more than 4 backdrops it becomes a select |
| Sky picker | A segmented control next to the backdrop picker. It shows only the palettes of the chosen backdrop, in the order `day`, `cloudy`, `dusk`, `night`. A missing palette is not shown. Each segment has a 22 px round swatch (the sky colour, with the near ground colour on its lower third) and the palette name. When the operator picks a backdrop without the current palette, the first palette of that backdrop is chosen (spec "6. API") |
| Stage | The 4:3 stage only, no bleed (edit mode), radius 10 px, as wide as the card |
| Selected layer | A 2 px Cobalt outline, 2 px away. Six handles: 12 px, Card fill, 2 px Cobalt border. A Cobalt chip above it with the asset key and the slot |
| Page text card | The narration field, the count ("2 of 3 sentences, 15 of 40 words"), a note that a save makes the scene and the audio stale, and the Soft button "Save text" |
| Layers card | One row for each layer, 44 px high, with a kind chip. The selected row has the "working" fill and notice text colour. A Soft button "Add layer" |
| Layer card | Pose and Expression (selects), x, y, and Scale (number fields, stage units; they are the `x`, `y`, and `scale` of the manual `at` in the spec, and the keyboard way to move and size a layer), a "Manual position" chip with the ghost button "Back to slot", the animation, and the tap actions with the bubble count ("21 of 60") |
| "This page" card | The `lg` primary button "Save scene". Three Soft buttons in one row: "Still fits", "New scene", "New audio". The draft audio player: a 44 px round Deep teal play button, a track, and the time |

A button that cannot be used now is disabled, with the reason in the
notice. For example, "Still fits" is disabled unless the scene is stale.

## 14. Accessibility

| Topic | Rule |
| :-- | :-- |
| Targets | A child control: 64 x 64 px or more, 12 px apart. Studio: 44 x 44 px or more. A tappable layer in play mode: a hit area of 64 x 64 px or more, cut at the stage edge (section 12.3) |
| Contrast | The table in section 2. Text 4.5:1; large text, icons, and rings 3:1 |
| Focus ring | Two rings, on every focusable element, with `:focus-visible`: a 3 px Ink ring 3 px away from the element, and a 3 px Sun yellow ring directly outside it. Ink passes on every light ground; Sun yellow passes on the night sky. The ring of a layer on a stage is drawn in the stage overlay, in CSS px (section 12.3) |
| Colour | A state always has a word and an icon. A colour alone never carries a meaning |
| Names | Every button has an accessible name: "Home" (every Home control), "Previous page", "Next page", "The end" (for "next" on the last page), "Start the story", "Read again", "Look again", "Previous books", "Next books". A book on the shelf is a link with the name "Open the book" and its title. The name of a button with a visible label contains that label. A character button has the name of the character |
| Regions | The narration is a live region (`aria-live="polite"`). The progress pill and a bubble have `role="status"`. A Studio notice that reports a refused action has `role="alert"` |
| Inert sheets | During a page turn and during the 200 ms cross-fade of "Read again", the sheet that goes away is `inert` as a whole: nothing in it takes the focus, a tap, or a key, and assistive technology does not read it. The sheet that comes in is not inert: its panel is live at once (the narration is read, and "Read again" can take the focus). Only the layers of its picture wait: they take no tap and no focus, and are not in the tab order, until the turn or the cross-fade ends. A sheet that is not shown is not in the tab order at any time. The picture of the Start gate has no buttons at all (section 12.2). The frame controls are never inert |
| Focus moves | When the control that has the focus is removed, the same handler moves the focus. The focus never falls back to the document. "Start": to "next". "Next" on the last page: to "Read again". "Read again": to "next" on page 1. "Previous" on the end page: it stays on "previous". "Previous" to page 1: it stays on "previous", which is now disabled with `aria-disabled` (section 4). A book on the shelf: to the first control of the book screen. Home, and every other way to the shelf: to the shelf itself (`main`, `tabindex="-1"`), at once. The shelf is in Waiting then and has no book yet. The focus does not move when the books arrive; the next Tab goes to the first book. "Look again": to the shelf itself, because the button is removed in Waiting. A shelf arrow that becomes disabled keeps the focus, as "previous" does |
| Motion | Section 5, reduced motion |
| Keyboard | Every control is a real button or link, in reading order. No function needs a pointer, except dragging a layer in the Studio, which the x, y, and Scale fields replace |
| Text | Real text, never text in an image. The narration is at least 18 px |
| Sound | Narration starts only after the tap on "Start" |

## 15. What not to do

- No blurred shadow, glow, glass effect, gradient fill, or bevel in the UI.
  The hard edge is the only depth. A painted backdrop is art, not UI: it
  may have soft gradients (section 8).
- No word highlighting during narration (out of scope in the requirements).
- No red, no cross, and no failure wording on a child screen. Coral as a
  sign and the "blocked" state are for the Studio. Coral as the cloth of a
  book is decoration from the approved board (section 12.1).
- No link out of the product, no source link, no sharing, and no settings
  on a child screen.
- No text on the stage or on a backdrop. No text over the picture except a
  bubble.
- No filter on a layer and no filter during a page turn.
- No dark mode. No second font family. No upper-case labels. No emoji.
- No native `<select>`, and no stock shadcn grey or blue.
- No motion that flashes, spins, or shakes. No motion on its own in the
  Studio.
- No code from a model in the browser, and no SVG with a script or an event
  attribute (ADR 0015).
- No fourth control on a child screen.
- No frame part over the picture area: no control and no progress pill.
  No torn edge over the stage or the bleed.
- No scrolling on the shelf, and no fault sign on a cover that did not
  load.
- No information that needs hover (no tooltip as the only source).
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
| The narration is at most 660 px wide in a 224 px panel | 760 px wide in a 256 px panel (12 px of it is the torn edge) | A 40-word page must fit at 28 px. The board panel holds 4 lines; the estimate is 5 (not measured in a browser) |
| The loading state has no Start button | A disabled Start button | PLY-04.S10: "Start" is enabled only when the book is loaded |
| The bubble has 20 px text and radius 22 px, and does not wrap | On a stage: 64 stage units of text, radius 48 stage units, wraps at 60 % of the stage width (about 31 px and 23 px on board 3) | The runtime draws the bubble inside the scaled stage, so its values are stage units. 20 px on the board is about 40 stage units, which is under 10 px on a 390 px phone stage. A 60-character bubble must fit a phone stage |
| The stage in the editor has radius 12 px | 10 px | One radius for a picture in a card |
| A notice has radius 14 or 18 px by board | 14 px in a card, 18 px alone | One rule |
| The torn paper edge is 48 px high over the picture | 12 px high, at the top of the narration panel, not over the picture | The spec says that the stage is never cropped. Foot points reach y 1200, the bottom of the stage (`solo-center`, slot `bust`) |
| Cut-outs are dimmed and tinted by the sky with a CSS `filter` | Not included | ADR 0017 rejects a night tint for the MVP: a filter breaks the page-turn rule. Open item 4 |
| The night meadow has a moon; the meadow has a river | Not included | The spec makes `meadow` from a sky colour and three hills. A moon would lie under the `sky-*` slots. ADR 0017: no moon asset in the MVP |
| The progress pill lies over the top left of the picture, with dots (board 3) | In the right gutter, the count only | ADR 0017: on a viewport of 900 px the pill covers up to 41 % of the width of a `sky-1` object at 900 x 600, and its whole width at 900 x 827 (arithmetic). No frame part lies over the picture |
| A cover on the shelf is a small scene placed by hand, with drawn hills and a CSS `filter` on the art | Page 1 of the release as a still scene, cut to the picture window. No filter | Owner decision (ADR 0017): no new asset. A cover uses only files of its release |
| A book of 180 x 224 px has a picture window of 151 x 208 px. That leaves 16 px of its height for the title label | A title plate of 54 px above a window of 151 x 148 px | A plate for 2 lines of 18 px text does not fit in 16 px, and no text lies over a picture. The lower window also shows more of the stage: 1224 of its 1600 units, not 872 |
| The shelf ground has registry art (trees) and characters beside the shelf | The Player draws the ground. The characters are a Proposal | A registry file is served only inside a release. Open item 11 |
| The shelf shows 6 books and has no arrows | Arrows with more than one shelf page | ADR 0017: shelf pages, no scrolling, no cap |
| No Home control on the Start gate | The Home round button | ADR 0017: one Home control on every screen of a book |
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

An item that is not marked "Resolved" is not decided here. It needs the
spec or the owner.

1. **The shelf.** Resolved by ADR 0017. The shelf is at `/`, with the
   public `GET /api/shelf` and shelf pages for more than 6 books. Section
   12.1 is a rule, except its "Friends" part (item 11).
2. **The resting state.** Resolved by ADR 0017. The spec has its triggers
   ("9. Player screens"). The Player draws its picture (section 8), and it
   has a Home button (section 12.2).
3. **The hit area of a tappable layer.** Resolved by ADR 0017: 64 x 64 px
   or more, cut at the stage edge, with one hit layer for the margins
   (section 12.3).
4. **Cut-outs on a night backdrop.** Resolved by ADR 0017: no night tint in
   the MVP. A day-coloured character stands on a night painting. A tint
   needs a night version of each asset file, which is a later decision.
5. **A moon.** Resolved by ADR 0017: no moon asset in the MVP. A night page
   shows stars only.
6. **The torn paper edge.** Resolved. The edge is in the narration panel
   and never lies over the stage or the bleed (section 8).
7. **The narrow and the short Player layout** have no approved board,
   for the reading page, for the Start gate, and for the shelf. The
   values of sections 12.1, 12.2, and 12.3 are starting values, and the
   size table is arithmetic, not a measurement. On a stage under 390 px
   wide, the text of a bubble is under 16 px on the screen. A low Narrow
   viewport is not covered: at 568 x 320 (a small phone in landscape)
   the top bar, the control row, and the lowest panel need 365 px.
8. **Code that this file makes stale:**
   - `apps/storybook/src/styles.css` and `tokens.test.tsx` (the earlier 28
     tokens), and `apps/storybook/src/main.tsx` (Kiwi Maru and Nunito).
   - `packages/scene-runtime/src/sky.ts` (the earlier sky colours).
   - The shared `Button` (issue #58 names the primary edge as the only
     shadow; section 4 has more edges, a `round` variant, and the sizes
     `child-start` and `child`).
   - `packages/scene-runtime/src/Bubble.tsx`: Nunito, a 4-unit border, its
     own colours, and a maximum width of 900 units. Section 12.3 has
     Baloo 2, a hard edge with no border, token colours, and 960 units.
     The bubble is drawn inside the clipped stage container; section
     12.3 has the stage overlay.
   - `packages/scene-runtime/src/SceneView.tsx`: the paper texture is one
     image stretched over the stage. Section 8 tiles it over the frame.
     It has no `fit` prop, and it loads the swap files of a tap in every
     mode (line 238).
   - `packages/scene-runtime/src/LayerView.tsx`: a tappable layer always
     has `tabIndex` 0 and key handlers. The runtime has no check of the
     page phase yet, so a sheet that is not current is not inert
     (section 14). It has no hit layer, and its focus ring is inside
     the scaled stage.
9. **The progress pill in the Wide layout.** Resolved by ADR 0017. The
   pill is at the top of the right gutter, the count only (section 12.3).
   This differs from board 3 ("Differences" above).
10. **The end page for a child who cannot read.** Section 12.5 gives the
    signs that the existing parts allow. They were not tested with
    children. A stronger sign (for example the cast on the end page, or a
    sound) needs a spec change, because the spec gives the end page no
    layers and no audio.
11. **Friends by the shelf.** The approved board has one or two
    characters beside the shelf, and a tap makes one say "Pick a story!".
    Section 12.1 keeps this as a Proposal. It needs a decision on the
    behaviour, and a source for the character file outside a release.
