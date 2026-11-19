# Storyteller prompt v6 (contract output)

v6 keeps every writing rule from `storyteller_v5.md`. It changes only the output:
one file per story, in the format of `integration/story.schema.json`.
Added after the I2 run (issue #5, 2026-11-10).

## Calls per story
1. Script call, once per age (`5to7`, `8to10`), with `storyteller_v5.md`.
2. Story call, once per story, with the rules below.
3. `make_stories.py` joins the results and runs `integration/validate.py`.

## Story call: output fields
Return JSON only:

| Field | Rule |
|---|---|
| `ai_word` | The one AI concept of the story, in 1 to 3 everyday words. It must appear in, or follow from, `full_text`. |
| `ai_word_definition` | One sentence, at most 18 words, that a 5 year old can follow. No new news fact. |
| `ai_word_illustration_prompt` | At most 10 words. Warm watercolor style. Kid-safe: no weapons, no scary faces, no real people, no logos. |
| `page3_scene_description` | Page 3 (`news_discovery`) for both ages. Concrete and visual: name 3 objects a child could tap. |
| `hidden_elements` | Exactly 3 items. `element` is a short name that appears word for word in the page 3 scene. `fun_fact` is 1 or 2 short sentences, either a fact from `full_text` or a general explanation. Never a new news fact. |
| `settings` | 10 items, one per page, in page order. `time`: `day`, `dusk`, or `night`. `place`: `street`, `campus`, `classroom`, `office`, `rooftop`, `bedroom`, or `plain`. Match the page's `scene_description`. |

## Script call: field names (from v5 output)
| v5 output | Contract field |
|---|---|
| `tone_tag` | `tone` |
| `sentences[].text` | `text` (sentences joined by one space) |
| `sentences[].tag` | `tags[]`, same order |
| position in `pages` | `page` (1 to 10) |
| `parent_card.concept` | `parent_card.ai_concept` |
| `parent_card.question` | `parent_card.question_to_ask` |

## Before handoff
```
python3 make_stories.py --check
```
A story is handed off only if both checks print PASS. `review_status` is always `draft`.
