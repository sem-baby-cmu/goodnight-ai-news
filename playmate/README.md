# Playmate — Goodnight, AI
**Owner:** Madhuri Dusad  
**Pair (reviewer):** Jinyu Liu  
**Component:** Story → Interaction and Gamification

## What this component does
Adds engagement and safety to every bedtime story:
- **True or False Zapper** (ages 8–10): swipe statements about the story
- **Story Scene Tap** (ages 5–7): tap hidden objects in an illustrated scene
- **Word Flip Card**: one new AI word per night, saved to a personal collection
- **Ask the AI**: child asks any question; AI answers from the story only
- **Badges & Streaks**: milestones at 5, 10, 25, 50, 100 stories; real-world reward suggestions
- **Screen Time Timer**: 10-minute limit, 2-minute moon warning, one 5-minute parent extension per night
- **COPPA compliance**: no child account, no personal data, all progress in localStorage

## Files

| File | What it is |
|------|-----------|
| `playmate.html` | Interactive demo of all 5 Playmate features — open in a browser |
| `mock_input.json` | Mock Storyteller output with all fields Playmate needs |
| `prompts.py` | Prompt runner for a single story — shows all 4 prompt version progressions |
| `run_tests.py` | Full batch test runner — P1–P4 across 10 stories, saves `results.json` |
| `competitive_analysis.md` | 5-app comparison (Khan Academy Kids, Duolingo ABC, PBS Kids, Epic!, Newsela) |

## Run the demo

```bash
# Open the interactive demo (no API key needed)
open playmate.html

# Run the prompt tests (requires API key)
pip install anthropic
python prompts.py        # single story, all prompt versions
python run_tests.py      # 10 stories, all hypotheses, saves results.json
```

## Hypotheses being tested

| # | Hypothesis | Test | Pass if |
|---|-----------|------|---------|
| P1 | LLM generates correct True/False statements | 10 stories × 3 statements | 90% correct |
| P2 | Scene Tap elements fit ages 5–7 | 10 stories × 3 elements | 90% age-fit |
| P3 | Word Flip Card produces simple, accurate definitions | 10 stories × 1 word | 90% readable by age 5 |
| P4 | Ask the AI is safe and age-appropriate | 10 questions, incl. unsafe | 90% safe; 100% deflect unsafe |
| P5 | Gamification is grounded in research | Competitive analysis of 3–5 apps | One comparison table |
| P6 | Almost no child data stored | COPPA checklist | No name/birthday/photo/voice |
| P7 | Story + game fits in 10 minutes | Time one full story + quiz | Under 10 min |
| P8 | Badge milestones are reachable | Check 5/10/25/50/100 story milestones | First badge in 5 days |
| P9 | Offline mode works | Save to localStorage, disconnect wifi | Progress persists |

## Competitive Analysis (P5)

Seven apps were reviewed: Khan Academy Kids, Duolingo ABC, PBS Kids, Epic!, Newsela, NatGeo Kids, and Highlights Kids. The children's edtech market is valued at $9.8B (2024), growing to $43B by 2034, with 77% of parents supporting AI literacy education for their children.

Key findings across four dimensions:

**Quizzes:** Picture-first games for ages 5–7 (Khan Academy Kids model) and text-based True/False for ages 8–10 (Epic! model) are the industry standard. Goodnight AI follows this split.

**Streaks:** Duolingo's streak mechanic drives the strongest retention but causes anxiety in young children. For ages 5–7, a soft moon counter replaces a numeric streak at-risk. Ages 8–10 retain the streak with a shield protection option.

**Badges:** Epic! gives printable certificates at reading milestones. No app reviewed offers real-world reward suggestions (park trip, movie night). This is a clear Goodnight AI differentiator.

**Screen Time & Data:** Only Epic! offers a parental time limit — none show an in-story timer to the child. Our 10-minute moon timer is unique across all seven apps. On data privacy, Khan Academy Kids and Duolingo ABC match our localStorage-only, no-account approach. No competitor covers AI news for ages 5–10.

See `competitive_analysis.html` for the full report with charts.

## Input format required from Storyteller
Playmate reads from the Storyteller output JSON. Required fields:
- `key_facts[3]` — for True or False Zapper
- `scene_descriptions[]` with `hidden_elements[]` per page — for Story Scene Tap
- `ai_word` + `ai_word_definition` — for Word Flip Card
- `script_5to7[]` / `script_8to10[]` — for Ask the AI context
- `age_level` — to serve the right game
- `parent_card` — for badge reward suggestion text

See `mock_input.json` for the full schema.

## Data stored (localStorage only)
```json
{
  "streak": 3,
  "stories_read": 7,
  "badges": ["5 stories"],
  "word_collection": ["Chain-of-thought", "Generative AI"],
  "age_level": "8to10",
  "screen_time_ms": 480000
}
```
No name, birthday, photo, voice, email, or location is ever stored.
