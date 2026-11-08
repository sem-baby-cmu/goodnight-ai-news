# 5.5. Integration: one story end to end

Owner: Jinyu Liu
Pair: Deokhwa Jeong

## (1) What this component does

Integration defines the data flow and the JSON format for each handoff between Scout, Storyteller, Producer, and Playmate. It then runs one story through the whole pipeline and records where a handoff breaks, how long it takes, and what it costs. Shared storage is the only exchange point, so no component depends on the internal state of another. Integration does not own component internals. The parent or editor dashboard, the PRD, and the UI design are out of scope for this milestone.

## (2) Data flow between components

Checked on 2026-11-07 against the files in the team repository (sem-baby-cmu/goodnight-ai-news).

| From | To | What passes | Confirmed by both owners? |
|---|---|---|---|
| 4 RSS feeds | Scout | Title, summary, date, link | [FILL IN] |
| Scout | Storyteller | title, full_text, source_links, claims[], confidence, first_rating | Partly. The file `scout/example_story.json` matches. Live Scout output is not yet tested. |
| Storyteller | Playmate | Both scripts, age_level, parent_card, key_facts[3], and the Scout fields. Playmate also expects hidden_elements[] and ai_word with its definition from Storyteller (`playmate/README.md`). | Partly. `playmate/mock_input.json` has all of them. Section 5.2 does not list hidden_elements or ai_word as Storyteller outputs (see blocker B3). |
| Storyteller | Producer | Both scripts, with scene_description and tone on every page | No. Producer's input file uses different field names (see I3). |
| Producer | Story package | Inline vector scenes, audio file, word_timestamps[], one HTML file per age | [FILL IN after the joint run] |
| Playmate | Story package / child's device | quiz[], scene_tap_elements[], word_flip_card{word, definition, illustration_prompt}, badge{milestone, reward_suggestion}, local_progress{streak, badges[], word_collection[], age_level}, screen_time_limit_ms | [FILL IN]. This is the planned format from the team template. We have not checked it against the Playmate code. |

## (3) Data format

### Handoff 1: Scout to Storyteller

Checked against `scout/example_story.json`.

- title (string): source headline
- full_text (string): full collected text
- source_links (array of string): original source URLs
- claims (array of object): text (string), in_source (boolean), quote (string)
- confidence (integer): 1 to 5
- first_rating (string): green, yellow, or red

```json
{
  "title": "A new AI model is released",
  "full_text": "The full text of the collected news item...",
  "source_links": ["https://example.org/news/ai-model"],
  "claims": [{"text": "The model answers questions", "in_source": true, "quote": "the model can answer questions"}],
  "confidence": 4,
  "first_rating": "green"
}
```

### Handoff 2: Storyteller to Playmate and Producer

Checked against `playmate/mock_input.json` (Playmate's test story) and `producer/input/2026-11-07.json` (Producer's input). The story object carries:

- story_id, title, source_url, source_links, confidence, first_rating, full_text: carried over from Handoff 1
- age_level (string): 5to7 or 8to10
- script_5to7 and script_8to10 (arrays): ten pages each, in this order: cover, character, news_discovery, exploration, challenge, turning_point, resolution, reflection, real_world_facts, quiz. Each page has page, the page category, text, scene_description, and a tone value.
- parent_card (object): ai_concept and question_to_ask
- key_facts (3 items), hidden_elements, ai_word, ai_word_definition, ai_word_illustration_prompt: used by Playmate
- true_false_statements, review_status: in the Playmate mock file. Playmate's test P1 generates the true/false statements from key_facts.

```json
{
  "story_id": "story_001",
  "title": "Pip and the Thinking Machine",
  "age_level": "5to7",
  "script_5to7": [
    {"page": 1, "type": "cover", "text": "Pip and the Thinking Machine",
     "scene_description": "A small friendly robot in front of a glowing book", "tone_tag": "warm"}
  ],
  "parent_card": {"ai_concept": "Chain-of-thought reasoning", "question_to_ask": "What should a computer learn first?"}
}
```

(Example shortened. Other fields are left out.)

The page category and tone fields have two names today. Playmate's file uses `type` and `tone_tag`. Producer's file uses `slot` and `tone`, and adds `tags` and `setting` (time: day, dusk, or night; place). The page categories are the same ten names, so only the field names differ. The agreed names will follow `storyteller_output.schema.json` [CONFIRM with Sally Chou, Judy Lee, and Madhuri Dusad].

### Handoff 3: Producer output

Producer writes to `results/<date>/`: `story_<age>.html` (narration, word highlighting, tap interaction, parent approval), a phone flipbook, carousel cards, and a vertical reel. Playmate now tests at the story-object level of Handoff 2. Loading the built Producer package directly is the next step [FILL IN after the joint run].

### Multiple datasets

One story object is built from four sources:

| Source | What it adds |
|---|---|
| Scout | title, full_text, source_links, claims[], confidence, first_rating |
| Storyteller | Two scripts, parent_card, key_facts[3], scene_description and tone per page |
| Playmate inputs | hidden_elements[], ai_word with definition and illustration prompt, true/false statements |
| Producer | Vector scenes, audio, word timestamps. Producer's own input also adds `setting` per page. |

What we test: whether these sources join into one object without manual edits. We count the manual field edits in I2. Each edit is a finding, not a failure to hide.

## (4) Test steps

**Hypothesis.** The four components can run one story end to end through the one story object in section (3), with at most [N] manual field edits, in under [X] minutes, and for under $[Y] [TEAM DECISION: set the numbers before I2]. The hypothesis fails if a handoff needs more than [N] manual edits or if any step cannot run on real output.

| # | Step | Result |
|---|---|---|
| I1 | Each owner confirms that their input and output match the data flow table. We checked the Scout example, the Playmate mock input, and the Producer daily input as real files: required fields, types, and enum values. | Scout and Playmate files match section (3). The Producer file does not match Handoff 2. See I3. [FILL IN: owner confirmations] |
| I2 | Run one story end to end. Copy and paste between components is fine. | Not run yet. Playmate has run its P1 tests on hand-written inputs, recorded in `playmate/results.json`. [FILL IN: story used, which handoffs ran on real output, phone check, number of manual field edits] |
| I3 | Record where one component's output does not match the next component's input. | Producer's input differs from Playmate's input in four ways: `slot` vs `type`; `tone` vs `tone_tag`; extra `tags` and `setting`; and no Scout fields, `parent_card`, or `age_level`. Producer's file was typed by hand from the team report in 5.2, and its `scene_description` and `setting` values are Producer placeholders. |
| I4 | Record total time and cost for one story, and where a human had to step in. | [FILL IN after I2]. No component report has this data yet (see risk R2). We measure it in I2. |

## (5) Architecture diagram

```
 4 RSS feeds
     |  title, summary, date, link
     v
  Scout
     |  title, full_text, source_links, claims[], confidence, first_rating
     v
  Storyteller
     |                                   |
     | script_5to7[], script_8to10[],    | script_5to7[], script_8to10[],
     | age_level, parent_card,           | scene_description + tone per page
     | key_facts[3], hidden_elements[],  | (field names NOT yet agreed:
     | ai_word                           |  slot/tone vs type/tone_tag)
     v                                   v
  Playmate                            Producer
     |                                   |  scenes, audio, word_timestamps[], HTML
     |                                   v
     |                              Story package
     |                                   |
     +-----------------<-----------------+  (Playmate loads the package: next step)
     v
  Child's device: quiz, badge, local progress
```

Two scripts: one for ages 5 to 7, one for ages 8 to 10, ten pages each.

[Replace with a drawn diagram in the Google Doc.]

## (6) Risks

| # | Risk | Did it happen? | How we handle it |
|---|---|---|---|
| R1 | Handoff format mismatch (biggest risk) | Yes. Producer and Playmate use different page field names (see I3). | The schemas in this section are the single reference. Owners adjust output. Any field change is announced to the team before it lands. |
| R2 | No time or cost data for the whole chain | Yes. Scout: "not measured". Storyteller: cost estimated at $0.021 to $0.024 per story, time not measured. Producer and Playmate: results blank in the team report. We cannot build I4 from the component reports. | Measure in I2: log start time, end time, and tokens for each step, and mark each manual step. Keep estimated numbers and measured numbers in separate columns. |
| R3 | The Storyteller step in I2 is not real Storyteller output | Yes. The pilot scripts were written by Claude Opus 5.5 in a chat session, because the sandbox had no API key. The production plan uses Sonnet 5.5, which has not been run. | Mark the Storyteller step in I2 as "pasted" until it runs through the API. Report the result for a pasted step and a live step separately. |
| R4 | Field ownership gap: Playmate expects fields that Storyteller does not promise | Yes. Section 5.4 says Playmate needs 8 fields in one place and 6 in another. The Playmate README expects hidden_elements and ai_word from Storyteller, but section 5.2 does not list them. | Settle the list of required fields and who produces each one (blocker B3). |
| R5 | One component not ready in time | Partly. Producer voice steps P3 and P4 need an ElevenLabs API key and have not run. P5 to P7 and P9 have run. | Use a hand-written sample for that step. Ship the story package without narration first, and add narration when the key is available. |
| R6 | Story package too big for a phone | No. The ten-page flipbook is about 94 KB, against about 16 MB for per-page images. | Producer builds scenes as inline vector graphics. |
| R7 | Narration timestamps do not match the page text | Not tested yet. It cannot happen until narration runs. | During I2, spot-check timestamps against the page text before we accept the package. |
| R8 | Storyteller code and evidence are not on `main` | Yes. On 2026-11-07, `origin/main` has only `storyteller/README.md`. Section 5.2 links to `main/storyteller` and cites checks.py and the schema file. | Sally pushes the files (blocker B1). Until then nobody can reproduce the Storyteller step. |

### Blockers

These block I2 or I4. Order of work: B1 to B4 first, then run I2 and I4, then fill in this section.

| # | Blocker | Blocks | Who | What we need |
|---|---|---|---|---|
| B1 | Storyteller code, evidence files, and `storyteller_output.schema.json` are not on `main` | I1 field names, I2 | Sally Chou | Push `storyteller/` to `main`. Confirm it is the real output schema. |
| B2 | Page field names are not agreed (`slot`/`tone` vs `type`/`tone_tag`) | I2, Storyteller → Producer handoff | Sally Chou, Judy Lee, Madhuri Dusad | One page schema, following the Storyteller schema file. |
| B3 | Playmate's required fields are not settled. Section 5.4 says 8 fields and also 6. Hidden_elements, ai_word, and true_false_statements are not in Storyteller's list of outputs (section 5.2). | I1, I2 | Madhuri Dusad, Sally Chou | One list of required fields, and who produces each field. |
| B4 | Section 5.3 (Producer) has blank results, no verdict, and still describes image generation, which conflicts with the vector scene design | Handoff 3, I4 (Producer cost and time) | Judy Lee | Fill in the results and the verdict. Remove the old image generation design. |
| B5 | Section 5.4 (Playmate) has blank results | I4 (Playmate cost and time) | Madhuri Dusad | Fill in the results. Use the same question count in the tests and the discoveries (10 or 30). |
| B6 | A live Scout story is needed for I2. Scout cost is "not measured". | I2, I4 | Deokhwa Jeong | One real Scout output, with time and cost for the run. |
| B7 | ElevenLabs API key for narration (P3, P4) | The narration part of I2 | [CONFIRM who requests the key] | Key, or agree to run I2 without narration. |
| B8 | No deadline for I2 is written in the document | Planning | [CONFIRM with Judy Lee] | The due date. |

Not blocking I2, but open in the document:

- The product name differs: Lullabyte on the cover, Goodnight AI in section 4.2, and "Illustrator" in section 5.4 (now Producer). Use one name.
- The statistic "76% of parents want schools to teach responsible AI use" cites QuestionPro (2026) in section 4.1 and Common Sense Media (2023) in section 5.4. Use one source.
- Section 4 has little evidence for its weight. Add one or two sources, and change "no direct competitor exists" to "we found no direct competitor".

## (7) Discoveries

1. Two owners read the same ten-page script with different field names, and neither noticed until we compared the files. We found it by checking real files, not by asking owners.
2. A hand-typed input file hides handoff problems. Producer's input is placeholder data for `scene_description` and `setting`, so the Storyteller → Producer handoff has not yet been tested on real Storyteller output.
3. The component reports measure quality well but measure cost and time poorly. Only Storyteller has a cost estimate. Scout has none, and Producer and Playmate have none yet. A whole-chain cost needs a run, not a sum of reports.
4. Playmate expects fields from Storyteller that Storyteller does not list as outputs (hidden_elements, ai_word). A field list per component does not show this. Only a side-by-side check of both sides does.
5. [FILL IN after I2]
