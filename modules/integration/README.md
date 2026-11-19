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
| Storyteller | Producer | Both scripts, with `slot`, `tone`, `tags`, and `setting` on every page. Producer does not read `scene_description`. | No. Producer's input file uses different field names (see I3). |
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

- story_id (UUID v7), title, source_url, source_links, confidence, first_rating, full_text: carried over from Handoff 1
- age_level (string): 5to7 or 8to10
- script_5to7 and script_8to10 (arrays): ten pages each, in this order: cover, character, news_discovery, exploration, challenge, turning_point, resolution, reflection, real_world_facts, quiz. Each page has page, the page category, text, and a tone value. `scene_description` is required only on page 3, because Playmate's scene tap reads it there (`playmate/prompts.py:102`). Producer does not read it.
- parent_card (object): ai_concept and question_to_ask
- key_facts (3 items), hidden_elements, ai_word, ai_word_definition, ai_word_illustration_prompt: used by Playmate
- true_false_statements, review_status: in the Playmate mock file. Playmate's test P1 generates the true/false statements from key_facts.

```json
{
  "story_id": "01a1bab7-bc9c-7ca5-b788-a8b5f803807a",
  "title": "Pip and the Thinking Machine",
  "age_level": "5to7",
  "script_5to7": [
    {"page": 1, "type": "cover", "text": "Pip and the Thinking Machine", "tone_tag": "warm"},
    {"page": 3, "type": "news_discovery", "text": "...",
     "scene_description": "A small friendly robot in front of a glowing book", "tone_tag": "curious"}
  ],
  "parent_card": {"ai_concept": "Chain-of-thought reasoning", "question_to_ask": "What should a computer learn first?"}
}
```

(Example shortened. Other fields are left out.)

The page category and tone fields have two names today. Playmate's file uses `type` and `tone_tag`. Producer's file uses `slot` and `tone`, adds `tags` and `setting` (time: day, dusk, or night; place), and has no `scene_description`. Producer removed that field on purpose: its renderer builds each scene from `slot`, `tone`, and `setting`, so it never read the written description (see the `note` in `producer/input/2026-11-07.json`). The page categories are the same ten names in both files. The agreed names will follow `storyteller_output.schema.json` [CONFIRM with Sally Chou, Judy Lee, and Madhuri Dusad].

### Handoff 3: Producer output

Producer writes to `results/<date>/`: `story_<age>.html` (narration, word highlighting, tap interaction, parent approval), a phone flipbook, and carousel cards. The vertical reel was dropped on 2026-11-08: social is feed cards that lead to the web story. Playmate now tests at the story-object level of Handoff 2. Loading the built Producer package directly is the next step [FILL IN after the joint run].

### Multiple datasets

One story object is built from four sources:

| Source | What it adds |
|---|---|
| Scout | title, full_text, source_links, claims[], confidence, first_rating |
| Storyteller | Two scripts, parent_card, key_facts[3], tone per page, scene_description on page 3 |
| Playmate inputs | hidden_elements[], ai_word with definition and illustration prompt, true/false statements |
| Producer | Vector scenes, audio, word timestamps. Producer's own input also adds `setting` per page. |

What we test: whether these sources join into one object without manual edits. We count the manual field edits in I2. Each edit is a finding, not a failure to hide.

## (4) Test steps

**Hypothesis.** The four components can run one story end to end through the one story object in section (3), with at most [N] manual field edits, in under [X] minutes, and for under $[Y] [TEAM DECISION: set the numbers before I2]. The hypothesis fails if a handoff needs more than [N] manual edits or if any step cannot run on real output.

| # | Step | Result |
|---|---|---|
| I1 | Each owner confirms that their input and output match the data flow table. We checked the Scout example, the Playmate mock input, and the Producer daily input as real files: required fields, types, and enum values. | Scout and Playmate files match section (3). The Producer file does not match Handoff 2. See I3. [FILL IN: owner confirmations] |
| I2 | Run one story end to end. Copy and paste between components is fine. | Run 2026-11-10 with narration (`integration/runs/i2-2026-11-10/README.md`). Story: "Pip and the Helper School" (PRAISE). Real output: the join, Producer narration, the Producer reader, and the phone check. Not real: Scout (not run, B6), Storyteller (pasted pilot scripts, R3), Playmate (data check only). Manual field edits: 10, touching 70 values, all renames, drops, or restructures. The joined story still fails the contract on `ai_word` and `ai_word_definition`. Phone-size check (desktop Chromium, 390 x 844): all 20 clips load and play. Thresholds [N], [X], [Y] were not set, but the hypothesis fails on "any step cannot run on real output": Scout did not run, Storyteller was pasted, and Playmate cannot load a story file. Later the same day, Storyteller fixed its contract failure (GitHub issue #5, commit `b543286`). |
| I3 | Record where one component's output does not match the next component's input. | Producer's input differs from Playmate's input in five ways: `slot` vs `type`; `tone` vs `tone_tag`; extra `tags` and `setting`; no `scene_description`; and no Scout fields, `parent_card`, or `age_level`. Producer's file was typed by hand from the team report in 5.2. When `setting` is absent, Producer now infers it (`producer/scene/setting.py`): time from the slot, place from one story-level "world" guessed from the words. Storyteller only needs to send that one world per story. It has no `scene_description`, by design (see Handoff 2). |
| I4 | Record total time and cost for one story, and where a human had to step in. | Partly measured on 2026-11-10 (`integration/runs/i2-2026-11-10/README.md`). Narration for both ages: about 80 s, 447 input and 2,912 output tokens, and $0.0264 measured (20 calls, Gemini 3.8 Flash TTS through OpenRouter). Join and reader build: under 1 s, $0. Scout and Playmate: not measured. Storyteller: estimate only. Human steps: pasting Storyteller output, 10 field edits, a narration wrapper, and encoding PCM to mp3. |

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
     | age_level, parent_card,           | slot, tone, tags, setting per page
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
| R5 | One component not ready in time | Partly. On 2026-11-10 narration ran in I2 through Producer's `synthesize.py`, with Gemini 3.8 Flash TTS through OpenRouter in place of Producer's Gemini call, which fails. P3 has audio; nobody has listened yet. P4 has not run. P4 no longer depends on one provider: `--align` gets word timings for any provider's audio from the ElevenLabs forced alignment endpoint. P4 still needs an ElevenLabs key. P5 to P7 and P9 have run. | Use a hand-written sample for that step. Ship the story package without narration first, and add narration when the key is available. |
| R6 | Story package too big for a phone | No. The ten-page flipbook is about 94 KB, against about 16 MB for per-page images. | Producer builds scenes as inline vector graphics. |
| R7 | Narration timestamps do not match the page text | Not tested yet. Narration ran in I2, but Gemini returns no word timings, and forced alignment needs an ElevenLabs key. | During I2, spot-check timestamps against the page text before we accept the package. |
| R8 | Storyteller code and evidence are not on `main` | Yes. On 2026-11-07, `origin/main` has only `storyteller/README.md`. Section 5.2 links to `main/storyteller` and cites checks.py and the schema file. | Sally pushes the files (blocker B1). Until then nobody can reproduce the Storyteller step. |

### Blockers

These block I2 or I4. I2 ran on 2026-11-10, before most of them closed. To run I2 again so it can pass, we need B6 and B9.

| # | Blocker | Blocks | Who | What we need |
|---|---|---|---|---|
| B1 | Storyteller code, evidence files, and `storyteller_output.schema.json` are not on `main` | I1 field names, I2 | Sally Chou | Closed 2026-11-10. The code, the schema file, the prompts, and the pilot outputs are on `main`. |
| B2 | Page field names are not agreed (`slot`/`tone` vs `type`/`tone_tag`) | I2, Storyteller → Producer handoff | Sally Chou, Judy Lee, Madhuri Dusad | Closed 2026-11-10. The contract uses `slot` and `tone`. Storyteller renamed its fields to match (commit `b543286`). |
| B3 | Playmate's required fields are not fully settled. Storyteller now writes `ai_word`, `ai_word_definition`, and `hidden_elements`, and its 3 story files pass `validate.py` (commit `b543286`). `true_false_statements` is not in the contract. | I1, I2 | Madhuri Dusad, Jinyu Liu | Decide whether `true_false_statements` goes in the contract, and who produces it. |
| B4 | Section 5.3 (Producer) has blank results, no verdict, and still describes image generation, which conflicts with the vector scene design | Handoff 3, I4 (Producer cost and time) | Judy Lee | Closed 2026-11-10. Section 5.3 has a verdict and lists image generation as dropped. |
| B5 | Section 5.4 (Playmate) has blank results | I4 (Playmate cost and time) | Madhuri Dusad | Closed 2026-11-10. Section 5.4 has results for P1 to P9. The counts agree: 3 statements for each of 10 stories is 30 statements. |
| B6 | A live Scout story is needed for I2. Scout cost is "not measured". | I2 (the 2026-11-10 run used a saved Scout file), I4 | Deokhwa Jeong | One real Scout output, with time and cost for the run. |
| B7 | ElevenLabs API key for narration (P3) and word timings (P4, also for other providers through forced alignment) | Word timings (P4, R7). Narration itself ran on 2026-11-10 without it. | [CONFIRM who requests the key] | Key, or agree to ship without word highlighting. |
| B8 | No deadline for I2 is written in the document | Planning | [CONFIRM with Judy Lee] | The due date. |
| B9 | Playmate cannot load a story file. Its story is written into `playmate.html`. | I2 (one reason the 2026-11-10 run failed) | Madhuri Dusad | Playmate reads `story.json` (GitHub issue #7). |

Not blocking I2, but open in the document:

- The product name differs: Lullabyte on the cover, Goodnight AI in section 4.2, and "Illustrator" in section 5.4 (now Producer). Use one name.
- The statistic "76% of parents want schools to teach responsible AI use" cites QuestionPro (2026) in section 4.1 and Common Sense Media (2023) in section 5.4. Use one source.
- Section 4 has little evidence for its weight. Add one or two sources, and change "no direct competitor exists" to "we found no direct competitor".

## (7) Discoveries

1. Two owners read the same ten-page script with different field names, and neither noticed until we compared the files. We found it by checking real files, not by asking owners.
2. A hand-typed input file hides handoff problems. Producer infers `setting` from the words when it is absent, and the guess is only as good as its word lists, and Producer dropped `scene_description` while Playmate still reads it on page 3. The Storyteller → Producer handoff has not yet been tested on real Storyteller output.
3. The component reports measure quality well but measure cost and time poorly. Only Storyteller has a cost estimate. Scout has none, and Producer and Playmate have none yet. A whole-chain cost needs a run, not a sum of reports.
4. Playmate expects fields from Storyteller that Storyteller does not list as outputs (hidden_elements, ai_word). A field list per component does not show this. Only a side-by-side check of both sides does.
5. The first narration error did not show the real cause. Producer's Gemini call got a 400 about the request format for every model id. Only a call on another API version showed the real cause: the Gemini API is turned off for the key we used. Probe a key with the simplest call first.
6. Producer's own end-to-end test can pass a check it cannot run. With no word timings, "every word reached the timings" passed on 0 of 10 pages. A check with no input must report a skip, not a pass.
7. The contract removed most of the join work. Producer read the joined `story.json` with no change, because the contract already uses Producer's page field names. All 10 manual edits were on the input side: 8 on Storyteller's pilot files and 2 on the Scout file.
