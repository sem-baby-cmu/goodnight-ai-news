# Storyteller
Owner: Sally Chou
Pair: Judy Lee

Turns fact-checked AI news into bedtime story scripts for two age levels (5-7 and 8-10).

## What it does (prototype scope)
Takes one story from Scout and writes two 10-page scripts, one per age level.
Every sentence carries a tag: `true`, `maybe`, `imagine`, or `explain`.
The `real_world_facts` page quotes the source word for word.
It also returns a parent card, 3 key facts for Playmate, and a `scene_description`
and `tone_tag` on every page for Producer. Every story starts as `draft`.

Ideas in scope: #2, #4, #10, #11 + #14 (one parent card), #17, #18, #19.
Deferred: #20 review workflow and #21 review checklist (they belong to the parent view).

## Run
```
python3 checks.py --selftest   # syllable counter check (25 known words)
python3 checks.py              # scores every script in outputs/
python3 build_evidence.py      # writes results/evidence.html
```
Python 3.9+. One extra package: `jsonschema`.
`results/` is build output and is not tracked. Run the commands above to make it.

## Files
| Path | What it is |
|---|---|
| `prompts/storyteller_v4.md` | Round 1 prompt: one prompt per age, fixed 10-page structure |
| `prompts/storyteller_v5.md` | Round 2 prompt: adds the `explain` tag, no added motives, no names on 5-7 story pages |
| `storyteller_output.schema.json` | Pilot output format |
| `sources/*.json` | 3 real AI news stories in Scout's format (the stories in the Goodnight, AI demo) |
| `round1/outputs/*.json` | Round 1 scripts (prompt v4) |
| `outputs/*.json` | Round 2 scripts (prompt v5) |
| `pilot_outputs.py`, `pilot_outputs_v5.py` | The pilot scripts as data; they write `outputs/` |
| `checks.py` | T1 structure, T2 automatic fact pre-check, T3 reading level and hard words, T5 token and cost estimate |
| `build_evidence.py` | Side-by-side age versions and the fact check table |

## Tests (see Section 5.2 of the prototyping doc)
Pilot: 3 stories x 2 ages = 6 scripts, run 2026-11-05. The full test calls for 10 stories.

| # | Hypothesis | Pass if | Result | Status |
|---|---|---|---|---|
| T1 | The LLM follows the fixed story structure | 9 of 10 | Round 1: 6/6. Round 2: 6/6 | Pass (pilot), 2026-11-05 |
| T2 | Rewrites add no false facts | 0 stories with added facts | Hand review: round 1 3/6 scripts added a motive or adjective; round 2 0/6. The automatic check caught 0 of the 3 | Pass after v5, waits for Judy's review |
| T3 | The two age versions differ in reading level | 5-7 at grade 2 or below; 8-10 at grade 4 or below | Round 1: 3/6. Round 2: 5/6. 5-7: 1.1, 1.9, 2.5. 8-10: 3.6, 3.6, 3.7 | Partial, 2026-11-05 |
| T4 | Parent cards are usable | 8 of 10 usable | 10 cards drafted; 4 reviewers rating them | Pending |
| T5 | Cost and speed allow daily use | Under $0.10 and 30 seconds per story | Estimated $0.021-0.024 per story (both ages) on Sonnet 5.5. Time not measured | Cost pass (estimate); time open |

T3 fail: the hacker story for ages 5-7 scores grade 2.5.
Its story pages alone score 2.0; the long true words on the facts page raise it.

T5 method: the scripts were written in a chat session with no API key.
Tokens are estimated at 4 characters per token.
Prices: Sonnet 5.5 at $2 / $10 per million tokens in / out
([secondary source](https://apidog.com/blog/claude-sonnet-5-5-pricing/)).

## Hand labels (for Scout S5 and this component)
20 stories, rated green / yellow / red by 2 labelers against a one-page rubric.
Labels are blind to Scout's ratings.
Sheet: [hand_labeled_ratings](https://docs.google.com/spreadsheets/d/1rtfxV4exslRM0cXiTVchcy9MzWIyzHz_MOCQuo5Q5FA/edit)

| Date | Labelers done | Agreement with Scout | Unsafe misses |
|---|---|---|---|
| 2026-11-07 | 1 of 2 (Sally) | 15 of 20 (75%). Stories 1-10 (full text): 60%. Stories 11-20 (summary only): 90% | 0 |

## Known gap: handoff contract
The pilot ran before the team contract (`integration/story.schema.json`, decided 2026-11-08).
On 2026-11-09, all 6 scripts in `outputs/` fail
`python3 -I integration/validate.py --owner Storyteller`:

- `story_id` is a short name, not a UUID v7.
- The file holds one age level. The contract wants `script_5to7` and `script_8to10` in one file.
- Missing fields: `ai_word`, `ai_word_definition`, `parent_card.ai_concept`, `parent_card.question_to_ask`.

Next step: change the output to the contract format, then validate before handing files to Producer.
