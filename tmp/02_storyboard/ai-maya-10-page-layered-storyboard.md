# *Pip and the Forest Clue*

## 10-page layered storyboard plan

### Audience and visual direction

- Audience: age 5, designed for read-aloud.
- Story language: English.
- Format: landscape 3:2, recommended master size 1536 × 1024 px.
- Art style: warm handmade cut-paper collage, visible paper fibers, rounded shapes, soft paper shadows, rich forest greens, turquoise, coral, ochre, and cream.
- Main cast from `00_storybook_design`:
  - **Pip** — teal AI robot; fast at spotting patterns, curious, and willing to correct a mistake.
  - **Lulu** — rabbit in a red top; asks the childlike questions.
  - **Mira** — purple moth researcher; brings the lidar map and guides the investigation.
  - **Tula** — tortoise archaeologist in a sun hat and glasses; models careful checking.
- The illustrated scene occupies roughly the upper 74–78% of each page. The lower 22–26% is warm cream paper for story text.
- The edge above the text area must always be organic: the edge of a desk, an open map, bushes, rolling ground, book pages, or a trail. Never use a straight horizontal divider.
- Every page must look like a finished illustration even when all animation is paused.
- Do not place words, labels, or important clues inside generated artwork. Add all readable text in the app.

### Animation language

- Frame-by-frame rate: 4–8 fps; default 5 fps, or about 200 ms per frame.
- Idle loops: 3–4 frames, small movement only, 1–3 second pause between loops so the page stays calm.
- Click actions: 4–6 frames, play once and hold on the final frame when appropriate. Toggle actions can reverse the same frames.
- Keep a small amount of hand-drawn wobble between frames. Do not use smooth vector rotation, warping, or whole-page motion.
- Each page has 1–3 self-moving elements and 1–3 click-to-move elements.

---

## Page 01 — A Forest Full of Clues

**Story purpose:** Introduce the team, Mexico's forest region, and the question that begins the investigation.

**English text**

> Pip, Lulu, and Mira looked at a giant map of a forest in Mexico.  
> “Could an old story be hiding under all those leaves?” asked Lulu.

**Full-page composition**

- A sunlit research nook opens directly into a lush forest. Mira stands at the left, Lulu at center, and Pip at right around a huge folded map.
- The map points toward distant forest-covered hills; no exposed fantasy temple is shown as the new clue.
- The lower text opening is formed by the uneven, scalloped bottom edge of the large paper map and two overlapping leaves.

**Layers**

1. `background.webp` — sky, distant forest, research nook walls and shelves, floor, fixed desk.
2. `map-base.png` — large folded forest map, with no glow.
3. `mira-idle.png` — Mira pointing toward the map.
4. `lulu-idle.png` — Lulu leaning forward with wide eyes.
5. `pip-idle.png` — Pip ready to scan.
6. `foreground.png` — close leaves, desk edge, and map corners that overlap the characters' feet and create the irregular text boundary.

**Self-moving elements**

- `canopy-sway-01..04.png` — two upper-corner leaf clusters sway by a few pixels.
- `pip-blink-01..03.png` — Pip blinks once every 4–6 seconds.
- `mira-antennae-01..03.png` — Mira's antennae softly bob.

**Click-to-move elements**

- Tap Pip: `pip-wave-01..05.png` — Pip raises one hand, waves twice, and returns to idle.
- Tap the map: `map-glow-01..05.png` — a soft golden ring travels across the forest map, then fades.
- Tap Lulu: `lulu-surprise-01..04.png` — ears lift, eyes widen, and hands rise to her cheeks.

---

## Page 02 — Tiny Beams, Big Map

**Story purpose:** Explain lidar in a concrete, child-friendly way.

**English text**

> Lidar sent tiny beams of light toward the ground.  
> Some slipped through gaps in the leaves, bounced back, and helped make a bumpy map.

**Full-page composition**

- Use a playful cutaway view: a small survey airplane above the treetops, dots of light passing through leaf gaps, and a clay-like 3-D ground shape below the canopy.
- Pip and Lulu watch from a safe observation platform at the right; Mira points from the left.
- The lower text opening is shaped by rolling ground contours and a loose ribbon of light dots.

**Layers**

1. `background.webp` — sky gradient, distant treetops, fixed trunks, observation platform, base terrain.
2. `airplane.png` — small survey plane.
3. `lidar-beams-idle.png` — sparse resting light dots.
4. `terrain-map.png` — simplified bumpy 3-D ground surface.
5. `mira-idle.png`, `lulu-idle.png`, `pip-idle.png`.
6. `foreground.png` — near leaves and ground shapes forming the text boundary.

**Self-moving elements**

- `airplane-drift-01..04.png` — tiny up/down handmade drift; it does not cross the page.
- `light-pulse-01..04.png` — a few dots travel down and back up in a slow loop.
- `leaves-gap-01..03.png` — one canopy opening gently shifts.

**Click-to-move elements**

- Tap the airplane: `airplane-scan-01..06.png` — a denser set of beams appears from front to back.
- Tap a light dot: `beam-bounce-01..05.png` — one dot moves down, touches the ground, and pops back up.
- Tap the terrain: `terrain-rise-01..05.png` — the flat paper contour builds into three visible height steps.

---

## Page 03 — Shapes Under the Trees

**Story purpose:** Show what the AI team recognized in the large lidar dataset.

**English text**

> Pip and many AI helpers searched the huge map.  
> They spotted shapes like a plaza, platforms, buildings, and a pyramid-shaped mound.

**Full-page composition**

- Pip stands before a large teal terrain map. Around Pip float many tiny paper “helper windows,” suggesting the 48 AI agents without asking the child to count them.
- Four friendly visual clues are clearly distinct: an open square, long raised rectangles, small building outlines, and one pyramid-shaped mound.
- Lulu follows the shapes with one finger while Mira watches.
- The lower text opening follows the irregular lower edge of the giant map and a few layered data cards.

**Layers**

1. `background.webp` — warm research room, shelves, fixed pinboard, distant windows.
2. `terrain-map.png` — unhighlighted lidar terrain.
3. `ai-helper-cluster.png` — small floating helper windows.
4. `pip-idle.png`, `lulu-idle.png`, `mira-idle.png`.
5. `shape-highlights-idle.png` — very faint outlines for the four clue types.
6. `foreground.png` — map lip, cards, and leaves forming the text boundary.

**Self-moving elements**

- `ai-helper-twinkle-01..04.png` — three or four windows blink in a staggered rhythm.
- `pip-antenna-01..03.png` — antenna leans left, center, right.
- `lulu-ears-01..03.png` — one ear makes a small curious tilt.

**Click-to-move elements**

- Tap the plaza: `plaza-highlight-01..04.png` — a square outline draws itself and glows once.
- Tap the platforms/buildings: `structures-highlight-01..05.png` — raised rectangles and small blocks pop up one by one.
- Tap the mound: `mound-highlight-01..05.png` — contour layers stack into a pyramid-like hill, then hold.

---

## Page 04 — Was It Brand-New?

**Story purpose:** Separate “spotting a pattern” from “proving a first discovery.”

**English text**

> “We found a brand-new place!” beeped Pip.  
> Lulu tilted her head. “Brand-new? How can we be sure no one found it before?”

**Full-page composition**

- Pip is excited at the left with one foot lifted. The glowing map is center. Lulu is at right, head tilted and one finger raised. Mira pauses behind them.
- A large paper question mark curls from the map toward Lulu, but it contains no text.
- The lower text opening is a soft cream “thinking cloud” made from overlapping map sheets and forest leaves.

**Layers**

1. `background.webp` — forest research station and fixed furniture.
2. `map-base.png`.
3. `pip-excited.png`, `lulu-question.png`, `mira-pause.png`.
4. `question-mark-idle.png` — paper question mark.
5. `foreground.png` — map sheets and leaves forming the irregular text edge.

**Self-moving elements**

- `pip-happy-bob-01..04.png` — Pip bobs once, then rests.
- `question-mark-float-01..03.png` — question mark gently wobbles.
- `mira-blink-01..03.png` — Mira blinks thoughtfully.

**Click-to-move elements**

- Tap Pip: `pip-celebrate-01..05.png` — hands rise, antenna flashes, then Pip notices Lulu and slows down.
- Tap Lulu: `lulu-head-tilt-01..04.png` — head and ears tilt farther; one eyebrow lifts.
- Tap the question mark: `question-spark-01..04.png` — tiny stars appear, turn into two small question marks, and settle.

---

## Page 05 — One Empty Drawer

**Story purpose:** Show that an official register can be useful but incomplete.

**English text**

> The place was not in one official register.  
> “That is one clue,” said Tula, “but an empty drawer does not tell the whole story.”

**Full-page composition**

- Tula enters at the right carrying an old green research book. At center is a wooden card cabinet with one open, visibly empty drawer. Pip, Lulu, and Mira look inside.
- Keep the scene warm and curious, not gloomy or accusatory.
- The lower text opening is made by the uneven cabinet base, a curled paper list, and small potted leaves.

**Layers**

1. `background.webp` — open-air archive, shelves, forest beyond, fixed cabinet body.
2. `drawer-closed.png` — drawer front in closed state.
3. `tula-idle.png`, `pip-thinking.png`, `lulu-looking.png`, `mira-idle.png`.
4. `register-cards.png` — cards in neighboring drawers.
5. `foreground.png` — curled list, plant leaves, and cabinet base shaping the text edge.

**Self-moving elements**

- `plant-sway-01..04.png` — hanging plant makes a gentle side-to-side loop.
- `tula-blink-01..03.png` — slow blink behind glasses.
- `pip-thinking-light-01..03.png` — Pip's chest light softly brightens and dims.

**Click-to-move elements**

- Tap the drawer: `drawer-opening-01..05.png`, ending on `drawer-open.png`; tap again to reverse and close.
- Tap Tula: `tula-finger-raise-01..04.png` — Tula raises one finger and nods once.
- Tap the cards: `cards-hop-01..04.png` — two neighboring cards hop up, showing that the register contains some places, just not this one.

---

## Page 06 — A Map From Before

**Story purpose:** Reveal the earlier 2025 scientific map.

**English text**

> Tula searched an earlier study. “Look!” she said.  
> The same place was already shown on a map made by other researchers.

**Full-page composition**

- Tula opens a large study book on a wooden table. The left page holds an earlier lidar map; Pip's newer map rests beside it on the right.
- Lulu points to the same plaza and mound on both maps. Pip leans close, surprised but attentive.
- The lower text opening follows the wavy lower edges of the open book and overlapping map sheets.

**Layers**

1. `background.webp` — cozy archive table, shelves, window, forest light.
2. `old-study-book.png` — open book with the earlier map but no animated marker.
3. `new-map.png` — Pip's map.
4. `tula-idle.png`, `lulu-pointing.png`, `pip-surprised.png`.
5. `foreground.png` — book page edges, loose paper corners, and table objects forming the text boundary.

**Self-moving elements**

- `page-corner-01..04.png` — one page corner lifts and settles.
- `dust-motes-01..04.png` — three paper-like specks drift in a sunbeam.
- `pip-blink-01..03.png` — surprised blink.

**Click-to-move elements**

- Tap the old map: `old-map-marker-01..05.png` — a gold ring grows around the location.
- Tap the new map: `new-map-marker-01..05.png` — a matching blue ring appears in the same relative place.
- Tap Lulu: `lulu-compare-01..05.png` — her finger moves from the old map to the new map, then she nods.

---

## Page 07 — Found Again

**Story purpose:** Model an honest scientific correction without shame.

**English text**

> “I was not the first to find it,” said Pip. “I found it again.”  
> Pip corrected the claim, and the true story became clearer.

**Full-page composition**

- Pip stands center, gently replacing a bright “first discovery” star symbol with a circular “found again” arrow symbol. Do not put words inside either symbol.
- Lulu smiles supportively. Mira places a hand near Pip's shoulder. Tula gives a warm thumbs-up.
- The two matching maps remain visible behind them to ground the correction in evidence.
- The lower text opening is formed by two overlapping map corners that meet in a shallow V, plus a soft strip of leaves.

**Layers**

1. `background.webp` — archive/forest transition space, fixed table, matching maps pinned behind.
2. `pip-honest.png`, `lulu-support.png`, `mira-support.png`, `tula-support.png`.
3. `first-discovery-symbol.png` — star symbol.
4. `rediscovery-symbol.png` — circular arrow symbol, initially hidden or faint.
5. `foreground.png` — map corners and leaves shaping the text edge.

**Self-moving elements**

- `pip-breath-01..03.png` — tiny body settle after speaking.
- `mira-antennae-01..03.png` — gentle encouraging bob.
- `map-pin-glint-01..03.png` — one pin glints softly.

**Click-to-move elements**

- Tap the star symbol: `claim-correct-01..06.png` — star folds like paper and becomes the circular rediscovery arrow.
- Tap Pip: `pip-honest-bow-01..05.png` — small bow, eyes close, then a relieved smile.
- Tap Tula: `tula-thumbs-up-01..04.png` — hand rises into a thumbs-up and glasses catch a tiny highlight.

---

## Page 08 — One List Is Not Everything

**Story purpose:** Show that official records, academic research, and local knowledge are different pieces of evidence.

**English text**

> A place can be missing from one list and still be in an old study—or known by people nearby.  
> Good researchers listen to many kinds of knowledge.

**Full-page composition**

- Three large paper puzzle pieces fill the center: a filing drawer icon, an old map icon, and a speech/listening icon beside a nearby community guide character in modern everyday clothing.
- Pip and Lulu hold the outer pieces; Tula listens to the guide. Mira helps align the pieces.
- Avoid costumes, “mystical” imagery, treasure imagery, or claims that the local character represents every Maya community.
- The lower text opening is the curved lower edge of the puzzle pieces, with a footpath and two bushes extending into the cream area.

**Layers**

1. `background.webp` — forest-edge community setting, simple modern field station, distant path.
2. `official-list-piece.png`, `old-study-piece.png`, `local-knowledge-piece.png`.
3. `pip-holding.png`, `lulu-holding.png`, `mira-aligning.png`, `tula-listening.png`, `local-guide.png`.
4. `foreground.png` — bushes, path, and puzzle edges shaping the text boundary.

**Self-moving elements**

- `guide-hand-01..03.png` — the guide makes a small conversational hand motion.
- `tula-nod-01..04.png` — Tula listens and nods slowly.
- `path-leaves-01..03.png` — two leaves beside the path flutter.

**Click-to-move elements**

- Tap the official-list piece: `list-piece-check-01..04.png` — drawer opens, reveals a gap, then closes.
- Tap the old-study piece: `study-piece-open-01..05.png` — tiny book opens and a map appears.
- Tap the local-knowledge piece: `knowledge-piece-listen-01..05.png` — speech shapes move toward a listening ear and become a warm glow. No written speech appears.

---

## Page 09 — Check, Ask, and Visit

**Story purpose:** Turn verification into a memorable five-step journey.

**English text**

> A bright pattern is only the beginning.  
> Researchers read old work, compare maps, ask experts and nearby communities, and sometimes visit the place carefully.

**Full-page composition**

- A winding paper trail crosses the page through five visual stations: an open book, two matching maps, Tula/expert, local conversation, and respectful field observation with notebook and camera.
- The four main characters move together along the trail. No digging, treasure chest, or touching ancient structures.
- The lower text opening follows the winding trail and rolling grassy ground, leaving a broad cream center for text.

**Layers**

1. `background.webp` — broad forest landscape, distant hills, five fixed station platforms.
2. `verification-trail.png` — winding path with five unlit stepping stones.
3. `team-idle.png` — Pip, Lulu, Mira, and Tula together at the start.
4. `station-icons.png` — book, maps, expert, conversation, field notebook/camera.
5. `foreground.png` — grasses, rocks, and trail edge shaping the text boundary.

**Self-moving elements**

- `trail-spark-01..05.png` — one small spark travels slowly along the five stations and rests.
- `team-walk-idle-01..04.png` — very small in-place handmade step/bob.
- `grass-sway-01..03.png` — two foreground grass clusters sway.

**Click-to-move elements**

- Tap any station: use `station-01-glow-01..04.png` through `station-05-glow-01..04.png`; the chosen icon lifts and glows once.
- Tap the team: `team-step-forward-01..06.png` — the group advances one short step along the trail, then holds.
- Tap the field notebook: `notebook-open-01..05.png` — notebook opens to a simple sketch and check mark, with no readable text.

---

## Page 10 — Tools and Teamwork

**Story purpose:** End with a clear, hopeful division of strengths between AI and people.

**English text**

> AI can search huge maps and spot useful clues.  
> People bring questions, experience, listening, and careful checking. Together, they learn more wisely.

**Full-page composition**

- Golden-hour forest clearing. Pip holds the big lidar map. Lulu holds a question notebook. Mira holds the scanning tool. Tula holds the earlier study. The nearby guide points along a real forest path.
- The separate tools and evidence meet visually in one shared map at center. A small group of fireflies forms a question mark, then a gentle check shape.
- The lower text opening is formed by the wide shared map, fern fronds, and a soft curved patch of ground.

**Layers**

1. `background.webp` — sunset sky, forest clearing, fixed distant canopy and path.
2. `shared-map.png` — center map.
3. `pip-proud.png`, `lulu-proud.png`, `mira-proud.png`, `tula-proud.png`, `local-guide.png`.
4. `fireflies-idle.png`.
5. `foreground.png` — ferns, shared map edge, and curved ground shaping the text boundary.

**Self-moving elements**

- `fireflies-loop-01..06.png` — fireflies drift from a loose question mark toward a soft check shape, then reset after a pause.
- `sunset-leaves-01..04.png` — upper leaves sway in the warm light.
- `pip-antenna-glow-01..03.png` — antenna light gently brightens.

**Click-to-move elements**

- Tap the shared map: `shared-map-clues-01..06.png` — lidar dots, old-map ring, listening symbol, and field check appear one after another, then remain together.
- Tap the team: `team-celebrate-01..05.png` — everyone makes one small celebratory motion: wave, ear lift, antenna bob, and nod.
- Tap the fireflies: `fireflies-star-01..05.png` — fireflies gather into one warm star, twinkle, and scatter.

---

## Asset structure and naming

Use one folder per page:

```text
page-01/
  background.webp
  foreground.png
  map-base.png
  mira-idle.png
  lulu-idle.png
  pip-idle.png
  canopy-sway-01.png
  canopy-sway-02.png
  canopy-sway-03.png
  canopy-sway-04.png
  pip-blink-01.png
  ...
  pip-wave-01.png
  pip-wave-02.png
  ...
  map-glow-01.png
  ...
```

Apply the same conventions to every page:

- Static full scene: `background.webp`.
- Static overlap mask: `foreground.png`.
- Characters at rest: `[character]-idle.png` or `[character]-[pose].png`.
- Idle action frames: `[object]-[motion]-01.png` through `-03.png` or `-04.png`.
- Click action frames: `[object]-[action]-01.png` through `-04.png`, `-05.png`, or `-06.png`.
- Persistent final state: `[object]-open.png`, `[object]-on.png`, or `[object]-complete.png` when needed.
- All non-background layers: transparent PNG, same canvas size and registration point as the page so they can be stacked without manual repositioning.

## Continuity and accuracy guardrails

- Pip is helpful but not all-knowing. Pip spots candidate patterns; the team verifies what they mean.
- The mistake happens at the verification/claim stage, not because lidar or pattern recognition is useless.
- The location is a **rediscovery** because it had appeared in a 2025 scientific study.
- A missing official-register entry does not mean no researcher or local community knew about a place.
- Use “Maya,” not “Mayan,” when referring to the people, culture, or archaeological region.
- Avoid “lost civilization,” “mysterious vanished people,” treasure hunting, or a pristine temple suddenly appearing from nowhere.
- Show local knowledge as present-day, living knowledge and as one part of respectful research.
- Fieldwork means careful observation, documentation, permissions, and specialist judgment—not automatically digging.
