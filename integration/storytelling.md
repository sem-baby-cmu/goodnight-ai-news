# News to story: the AI workflow (proposed)

Status: proposed, 2026-11-08, revision 2 (after review, section 9).
Needs agreement from the Storyteller (Sally), Producer (Judy), and Playmate
(Madhuri) owners before any contract change.

This document **changes** [`architecture.md`](architecture.md) sections 2 to 5:
scenes are planned and drawn before Gate B, so the reviewer approves words and
pictures together. Section 7 lists the exact changes. They are applied to
`architecture.md` only after the owners agree.

## 1. The rule

**A model makes creative choices from closed lists. Code draws and checks.**

Producer already showed this for pictures: Pip is one SVG component, so every
page shows the same Pip and nothing unsafe can be sampled (tests P1 and P2
pass by construction). This design applies the same rule to the whole story:

- A model chooses: which facts, which story events, which words, which pose,
  which prop hides a fun fact.
- Code decides: where things are drawn, where a child can tap, whether a quote
  is really in the source, how long a sentence is.
- A judgment that code cannot make ("is this one idea?", "does this sentence
  follow from the quote?") goes to the judge and to the human at Gate B. It is
  never called a code check.

## 2. Steps

Each step is one Workflow step and writes one artifact row in D1.

```
news_item (Scout: full_text, claims with quotes)
   |
 1 brief          AI concept, ai_word, claims with stable IDs (c1, c2, ...),
   |              one picture idea that carries the whole story
   |              code: every quote is found word for word in full_text
 2 story plan     shared core events + per-age facts and explanations
   |              + per-age page allocation (section 3)
   +----------------------+----------------------+
 3 script 5to7          3 script 8to10           (per age)
   | each sentence carries its tag and claim IDs
   | code: limits in section 4, claim IDs exist, FK recomputed
   +----------------------+----------------------+
 4 scene spec + render  per age; shared pages reuse one render
   | code: every pose, mood, prop is in the catalog; every object the
   | text names is drawn; every tap target is visible (section 5)
   |
 5 judge          second model, given the rendered pages and the source
   |              (section 6). Advisory until measured.
   |
 6 Gate B         a person approves the rendered preview: words + pictures
   |
 7 voice, play    after approval (narration, quiz, word card)
 8 package, Gate C, publish   (unchanged)
```

| Step | Artifact `stage` | Made by |
| :-- | :-- | :-- |
| 1 | `brief` | model, then code checks |
| 2 | `story_plan` | model |
| 3 | `script` (one per age) | model, then code checks |
| 4 | `scenes` (one per age) | code from the plan; model writes fun-fact text only |
| 5 | `judge` | second model |
| 7 | `voice`, `play` | as in `architecture.md` |

Producer consumes the two approved `script` artifacts and the approved
`scenes` artifacts. It no longer chooses the picture; it records the voice.

## 3. The story plan

Both ages tell **the same story events**. They do not always need the same
pages: an 8 to 10 page may explain a word that the 5 to 7 version leaves out.

```json
{
  "concept": "AI tools learn from examples",
  "ai_word": "train",
  "events": [
    {"id": "e2", "what": "Pip finds the news",
     "claims": ["c1"], "setting": {"time": "day", "place": "campus"},
     "pip": {"pose": "read", "mood": "curious"},
     "props": ["window", "book"],
     "reveal": {"prop": "window"}}
  ],
  "ages": {
    "5to7":  {"pages": [{"page": 3, "slot": "news_discovery", "event": "e2"}]},
    "8to10": {"pages": [{"page": 3, "slot": "news_discovery", "event": "e2",
                         "explain": ["software engineer"]}]}
  }
}
```

- A page that points at the same event in both ages shares one picture.
- A page only one age has gets its own picture.
- The ten `slot` values stay. `tone` and `setting` keep their enums.
  `pip.pose` and `pip.mood` come from `producer/scene/pip.py` (`POSES`: 9
  values; `MOOD`: 5 values).

## 4. Text for each age

The 5 to 7 child is often still learning to read. The text is written to be
heard first and read along second (see `DESIGN.md` section 10).

### 4.1 Claims and tags per sentence

A script page is a list of sentences, not one string:

```json
{"page": 4, "sentences": [
  {"text": "New workers learn from older workers.", "tag": "true", "claims": ["c2"]},
  {"text": "Pip peeks in the window.", "tag": "imagine", "claims": []}
]}
```

- Code checks: every `true` or `maybe` sentence cites a claim ID that exists
  and whose quote passed step 1. An `imagine` or `explain` sentence cites none.
- The judge and the reviewer check that the sentence really follows from the
  quote. Code cannot.
- This replaces the per-page `tags` array, which cannot say which sentence is
  true.

### 4.2 Limits

Limits apply to **narration sentences only**. The title, the cover line, and
quiz wording are not narration.

| Rule | 5 to 7 | 8 to 10 | Checked by |
| :-- | :-- | :-- | :-- |
| Words per page | at most 20 | at most 45 | code |
| Words per sentence | target 8, reject above 10 | target 14, reject above 18 | code |
| Reading level (FK grade, whole story) | 2.0 or lower | 4.0 or lower | code, recomputed from the final text |
| Words outside the word list | only the `ai_word` | at most 2 | code, against a versioned word list |
| One idea per page; hard words explained | yes | yes | judge and Gate B |

- A word is a run of letters, digits, and apostrophes; "AI" is one word.
- FK is recomputed by code with one pinned syllable counter. The stored
  `fk_grade` is no longer trusted: the current validator accepts any number.
- Calibration on the real script (`producer/input/2026-11-07.json`, 5 to 7):
  every page is under 20 words; pages 3, 5, 8, and 9 have a 9-word sentence.
  That is why the hard limit is 10 and 8 is a target that only warns.

## 5. Pictures and taps

### 5.1 A scene composition API, not a port

The current renderer cannot take these choices. `producer/scene/card.py`
`scene()` picks the pose from `slot`, the mood from `tone`, and the scenery
from `setting`; it ignores any `pip` or `props` field. The classroom scene in
`producer/scene/world.py` has no window, so the real line "Pip peeks in the
window" already disagrees with its picture.

New work, in TypeScript, reusing Producer's drawing:

| Part | What it does |
| :-- | :-- |
| Catalog | Named props, each with the places it fits, a fixed position, and a hit region |
| Composer | `compose(setting, pip, props) -> SVG`; rejects a prop that does not fit the place |
| Object check | Every object noun the text names (from the catalog) is in the scene |
| Tap check | Every reveal target is fully visible after the reader crops for the phone, and does not sit under a navigation control |

Each drawn prop has a stable ID (`window-1`), so a tap goes to one object,
not to "a window somewhere". Playmate's scene tap (it reads
`scene_description` today, `playmate/prompts.py`) moves to these prop IDs.

### 5.2 What is published

The package stores the **rendered SVG** for each page in R2, plus the
interaction data (prop ID, hit region, fun-fact text, audio key). The scene
spec stays as provenance. A later renderer change cannot change a published
story, so `architecture.md` keeps its promise that a published package never
changes. Each `scenes` artifact records the renderer and catalog version.

### 5.3 Interactions

| Kind | What the child does | 5 to 7 | 8 to 10 |
| :-- | :-- | :-- | :-- |
| `reveal` | taps a prop; a fun fact is read aloud | yes | yes |
| `word` | taps the `ai_word`; hears it and sees a picture | yes | yes |
| `quiz` | picks an answer at the end | 3 pictures, question read aloud | 3 short text choices |

A model cannot invent a new kind. A fun fact that is not in the source is
tagged `imagine`.

### 5.4 Social cards

Cards reuse the composer for the picture, but keep their own layout (caption
fitting, gradient band, fixed size, fonts bundled, animation stopped at a
fixed time). A screenshot of the reader is not a card.

### 5.5 Phone performance (unknown)

The paper-grain filter (`feTurbulence` + `feDisplacementMap` in
`producer/scene/parts.py`) is the slow part. Before the reader is built,
measure first page time, page turn time, and memory on a mid-range phone.
Pages that are not on screen pause their animation. If the filter is too slow,
use a pre-rendered paper texture instead.

## 6. Quality loop

| Method | How |
| :-- | :-- |
| Structured output | Every model step returns JSON that matches a schema. Enums come from `story.schema.json` and the catalog. |
| Code checks first | Quotes, claim IDs, limits, FK, word list, catalog, objects, taps (sections 4 and 5). |
| Corrective round | A failed check starts a new round with a new `generation_id`. The round names the stage to redo; that stage and every stage after it run again. A platform retry (same `generation_id`) only repeats a crashed step. |
| Budget | At most 3 corrective rounds per story, counting Gate B rejections, and a cost cap per story. Over either, the story stops and waits for a person. |
| Judge | Gets the rendered pages, the claims, and the quotes. Rubric: nothing frightening; each sentence follows from its quote; fits the age; words match the picture. **Advisory first:** it may block only after the golden set shows it catches defects that code checks miss. |
| Golden set | 10 past news items. A prompt or model change runs the set in CI and compares pass rates, judge scores, and cost. |
| Human edits feed back | A Gate B edit is a new artifact version with `author = human`. Collected diffs become examples for the next prompt version. |
| Invalidation | A change to any artifact marks every later artifact and approval stale. An artifact is reused only if its checks pass again on the new inputs (for example, keep the scenes after a text edit only if the object check still passes). |

## 7. Changes to `architecture.md` (after agreement)

| Section | Change |
| :-- | :-- |
| 2 Flow | Steps 1 to 5 above replace `storyteller` and `check script`. `producer-scenes` moves before Gate B. |
| 3 Data model | New `stage` values: `brief`, `story_plan`, `script`, `scenes`, `judge`. Add `age` to `artifact`. |
| 4 Package | Pages reference rendered SVG plus interaction data. |
| 5.1 Checks | Replace the "after storyteller" row with sections 4 and 5. |
| 5.2 Actions | Gate B approves script and scenes together. "Regenerate from stage" includes the new stages. |
| `story.schema.json` | Claim IDs; sentences with tag and claims; story plan; scene interaction data. `scene_description` is retired after Playmate moves. |

## 8. Risks and open questions

| # | Item | Owner |
| :-- | :-- | :-- |
| S1 | The contract changes in section 7. Agree before changing `story.schema.json`. | Sally, Judy, Madhuri |
| S2 | What is Pip: a robot owl (script, style guide) or a round blue robot (prototype, `pip.py`)? Poses depend on it. | team |
| S3 | Composer, catalog, and checks in TypeScript, reusing `pip.py`, `parts.py`, `world.py`, and `card.py` (about 41 KB of Python). Not estimated yet; estimate after the catalog is listed. | Judy, Simon |
| S4 | Cost and time per story for steps 1 to 5. Not measured. Run the golden set once before choosing models. | Simon |
| S5 | Word limits and the word list are starting values, not tested with children. | Sally |
| S6 | Filter speed on phones (section 5.5). Not measured. | Simon |

## 9. Review record (Codex, 2026-11-08)

Twelve findings on revision 1. The reviewer checked claims against the repo;
the claims marked verified here were also re-checked by hand.

| # | Finding | Result |
| :-- | :-- | :-- |
| 1 | Said it did not change the Workflow, but it does | Fixed: header and section 7 |
| 2 | One citation per page leaves other sentences unchecked; no claim IDs | Fixed: section 4.1 |
| 3 | One shared plan cannot hold different explanations per age | Fixed: section 3 |
| 4 | Partial regeneration can break text and picture agreement | Fixed: invalidation in section 6 |
| 5 | A stored spec lets a renderer change alter a published story | Fixed: publish rendered SVG, section 5.2 |
| 6 | The renderer ignores pose and prop choices (verified: `card.py` `scene()`) | Fixed: section 5.1 |
| 7 | Prop taps need IDs, hit regions, visibility (verified: reader bounces the whole picture) | Fixed: section 5.1 |
| 8 | Limits reject the real script (verified: four 9-word sentences) | Fixed: section 4.2 |
| 9 | "Checked by code" was not defined | Fixed: section 4.2 table |
| 10 | Port estimate left out `world.py` and `card.py` | Fixed: S3 |
| 11 | Filter cost on phones | Recorded: section 5.5, S6 |
| 12 | Judge retries had no boundary or budget | Fixed: section 6 |
