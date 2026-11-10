# I2 run, 2026-11-10: one story end to end, with narration

Story: "Pip and the Helper School" (CMU and Microsoft PRAISE program).
`story_id`: `01a1c740-9458-7143-8dcd-74b336fbc2e2`.
Run by Integration (Jinyu Liu).

## What ran on real output

| Step | Input | How it ran | Real output? |
|---|---|---|---|
| Scout | `storyteller/sources/praise.json` | Not run. The file is in Scout format, made for the Storyteller pilot. | No (blocker B6) |
| Storyteller | the Scout file | Not run. Pilot scripts `praise_5to7.json` and `praise_8to10.json` from `storyteller/outputs/`, written in a chat session. | No, pasted (risk R3) |
| Join | Scout file + 2 Storyteller files | `join.py` writes `story.json` and logs each edit in `edits.json` | Yes |
| Producer narration | `story.json` | Producer's `voice/synthesize.py`, through `narrate.py`, with Gemini 3.8 Flash TTS on OpenRouter | Yes |
| Producer reader | `story.json` + clips | Producer's `package/build_reader.py`, not changed | Yes |
| Phone check | `read-5to7.html`, `read-8to10.html` | Chromium at 390 x 844 (Playwright) | Yes |
| Playmate | `story.json` | Data check only. No live run (no Claude API key). | No |

## Contract check

| File | `validate.py` result |
|---|---|
| `storyteller/sources/praise.json` (`--owner Scout`) | PASS |
| `storyteller/outputs/praise_5to7.json` (`--owner Storyteller`), as received | FAIL, 7 errors: no `script_5to7` and `script_8to10`, no `ai_word` and `ai_word_definition`, `story_id` is `praise`, `parent_card` uses other field names |
| `story.json` after the join | FAIL, 2 errors: no `ai_word`, no `ai_word_definition` |

We did not write `ai_word` or `ai_word_definition`. That is content, and Storyteller owns it.
The run continued because Producer does not read those two fields.

## Manual field edits (`edits.json`)

10 field edits, which touch 70 values. All are renames, drops, or restructures. None adds content.
`source_links` and `first_rating` are in both inputs with the same values, so the Scout values are kept with no edit. `join.py` stops if they differ.

| Field | Kind | Change | Values |
|---|---|---|---|
| `source_title` | rename | Scout `title` to `source_title` | 1 |
| `id`, `date`, `full_text_note` (Scout) | drop | not in the contract; the Scout `id` is not a UUID v7 | 3 |
| `story_id` | replace | `praise` to a new UUID v7 | 1 |
| `script_5to7`, `script_8to10` | restructure | two files with one age each, to one file with both scripts | 1 |
| `age_level` | drop | a per-file age has no place in the joined file | 2 |
| `page` | add | page number from the position in `pages` | 20 |
| `tone` | rename | `tone_tag` to `tone` | 20 |
| `text`, `tags` | restructure | `sentences[{tag, text}]` to `text` + `tags[]` | 20 |
| `parent_card.ai_concept` | rename | `concept` to `ai_concept` | 1 |
| `parent_card.question_to_ask` | rename | `question` to `question_to_ask` | 1 |

Other manual steps, not field edits:

1. Narration used a wrapper (`narrate.py`) in place of Producer's Gemini call. See "Narration route".
2. The wrapper encodes each clip from raw PCM to mp3 with ffmpeg.
3. Producer's `test_pipeline.py` cannot test a file given with `--script`, so we ran its stage B and C checks by hand.

The hypothesis thresholds [N], [X], and [Y] were not set before the run.
The hypothesis fails on its other clause, which needs no threshold: "any step cannot run on real output". Scout did not run, Storyteller output was pasted, and Playmate cannot load a story file.

## Narration route

Producer's Gemini route did not run:

| Call | Result |
|---|---|
| `synthesize.py --providers gemini` (model `gemini-2.5-flash-preview-tts`, `google-genai` 3.1.0, whose default API is `v1`) | 400 `Unknown name "speechConfig"`. The same 400 came back for every model id, so the `v1` API rejects the request before it reads the model. |
| Same key, API `v1beta`, text or TTS | 403 `SERVICE_DISABLED`. The Gemini API is turned off in the Google project of the `GEMINI_API_KEY` in the run shell. The model id was not tested, because no call got past the key. |

`narrate.py` imports Producer's `synthesize.py` and replaces only the `gemini` provider function.
Producer's loop, file names (`<age>-<page>-gemini.mp3`), and `SAY_AS` spellings are kept.

| Item | Value |
|---|---|
| Model | `google/gemini-3.8-flash-tts` on OpenRouter, endpoint `/api/v1/audio/speech` |
| Voice | Aoede (Producer's choice for Gemini) |
| Output | raw PCM only (`audio/pcm;rate=24000;channels=1`). `mp3` is refused with a 400. Encoded to mp3 at 64 kbps. |
| Style prompt | none. The endpoint takes text only, so Producer's "Read slowly and warmly" prefix was not sent. |
| Word timings | none. Gemini returns none, and forced alignment needs an ElevenLabs key. P4 and risk R7 are not tested. |

## Measurements (I4)

All numbers are measured in this run unless the row says otherwise.

| Step | Time, measured | Tokens, measured (in / out) | Cost, measured | Cost, estimated | Notes |
|---|---|---|---|---|---|
| Scout | not run | | | | B6 |
| Storyteller | not run | | | $0.021 to $0.024 (Storyteller README) | pasted |
| Join | 0.02 s | | $0 | | |
| Narration, ages 5 to 7 | 39 s wall time (30.7 s in TTS calls), 10 calls | 158 / 1,086 | $0.0098 | | 117 words, 43.4 s of audio, 344 KB mp3 |
| Narration, ages 8 to 10 | 41 s wall time (35.0 s in TTS calls), 10 calls | 289 / 1,826 | $0.0166 | | 204 words, 73.0 s of audio, 575 KB mp3 |
| Reader build, both ages | under 0.1 s each | | $0 | | |
| Playmate | not run | | | | no API key |
| **Total** | **about 80 s** | **447 / 2,912** | **$0.0264** | **$0.021 to $0.024** | Measured cost is narration only, from OpenRouter `total_cost` per generation. |

Speech rate per page: 2.0 to 3.3 words per second (120 to 200 words per minute).
No clip is long enough to suggest that an instruction was read aloud.

## Producer checks on the built reader

| Check | 5 to 7 | 8 to 10 |
|---|---|---|
| A clip for every page | 10/10 | 10/10 |
| Every caption matches `story.json` | yes | yes |
| Reader size (limit 2048 KB) | 563 KB | 871 KB |
| Story length (Producer bar: 40 to 420 s) | 44.0 s | 73.5 s |
| Word timings | 0/10 | 0/10 |

Producer's own `test_pipeline.py --script ... --voice-provider gemini` gives 3 passed, 3 failed:

- "reader builds" fails. Stage B calls `build_reader.py` without `--script`, so it looks for `producer/input/2026-11-10.json`.
- "every word reached the timings" passes with 0 of 10 pages timed. The check does not test anything when no timings exist.

## Phone check

Desktop Chromium (Playwright) at phone size, 390 x 844, served from `producer/results/2026-11-10/`. This is not a real phone. Playwright's Chromium may allow autoplay that a phone blocks.

| Check | Result |
|---|---|
| Layout | Picture on top, text below, page dots at the bottom. The screenshot is not tracked. |
| Each of the 20 clips loads and plays | Yes. Duration matches ffprobe. `currentTime` moves forward. No media error. |
| Console | Only a 404 for `favicon.ico` from the local test server |
| Page 1 autoplay | Not tested on a real phone. The reader calls `play()` at load without a tap, and `.catch(() => {})` hides a refusal. Mobile browsers usually block that call, so page 1 may be silent. |
| Once | After the first tap on "next", the reader showed page 10 in place of page 2. A fresh load did not show it again. Not reproduced, not explained. |

Nobody has listened to the clips yet. A person must check that each clip says the page text.

## Playmate data check

`playmate.html` has its story typed into the page (`const STORY`), so it cannot load `story.json`.
Compared with `playmate/mock_input.json`, `story.json` does not have:
`hidden_elements`, `true_false_statements`, `ai_word`, `ai_word_definition`, `ai_word_illustration_prompt`
(Playmate reads these), and `age_level` and `source_url`.
Page 3 has a `scene_description` in both scripts.

## Findings for owners

Not yet sent. Each one goes to its owner as an issue.

| Owner | Finding |
|---|---|
| Storyteller | The output fails the contract (7 errors). After the 8 edits it still has no `ai_word` and no `ai_word_definition`. Playmate also needs `hidden_elements` and `ai_word_illustration_prompt`. |
| Producer | `synthesize.py`'s Gemini call fails with `google-genai` 3.1.0: a 400 on the default `v1` API (`speechConfig` unknown), which hides a 403 on the key. The install is not pinned, so the SDK version can change under the script. |
| Producer | Gemini TTS through OpenRouter returns raw PCM only. A Gemini route must encode the clip before the reader can play it. |
| Producer | `test_pipeline.py` does not pass `--script` or `--voice-provider` to the reader build. With no timings, "every word reached the timings" passes when it should be skipped. |
| Producer | Page 1 narration starts with no tap, and a refused `play()` is hidden. |
| Playmate | `playmate.html` cannot load a story file, so it cannot run on a real story. |
| Team | The Gemini API is turned off in the Google project of the Gemini key used for this run. |

## How to run again

```bash
python3 -I integration/runs/i2-2026-11-10/join.py
python3 -I integration/validate.py integration/runs/i2-2026-11-10/story.json
OPENROUTER_API_KEY=... python3 -I integration/runs/i2-2026-11-10/narrate.py --age 5to7
OPENROUTER_API_KEY=... python3 -I integration/runs/i2-2026-11-10/narrate.py --age 8to10
python3 producer/package/build_reader.py --script "$PWD/integration/runs/i2-2026-11-10/story.json" \
  --date 2026-11-10 --age 5to7 --voice-provider gemini
```

Needs ffmpeg. `join.py` keeps the `story_id` from an existing `story.json`.
Clips and readers go to `producer/results/2026-11-10/`, which git does not track.
