# Scout
Owner: Deokhwa Jeong
Reviewed by: Sally Chou

Turns news sources into daily AI news stories.

## What it does (prototype scope)
Pulls AI news from 4 RSS feeds, removes duplicates, keeps every source link,
and saves the day's stories as JSON for Storyteller.

Ideas in scope: #1 pick and fact-check news, #12 evidence and confidence per claim,
#13 flag low-confidence stories, #16 keep a link to the original source.
Deferred: #15 three input modes (RSS only for this prototype).

## Run
```
python fetch_news.py
```
Python 3.9+, no extra packages.

## Output
- `data/YYYY-MM-DD.json`: today's stories (title, summary, date, sources, source_links,
  full_text, claims, confidence, first_rating). The last four are filled by tests S3 to S5.
- `s1_counts.csv`: one row per run, for test S1 (enough AI news every day?).

## Tests (see Section 5.1 of the prototyping doc)
| # | Hypothesis | Status |
|---|---|---|
| S1 | There is enough AI news every day | Run daily Wed to Fri |
| S2 | The content is enough to write a story | To do |
| S3 | An LLM can check claims against the source | To do |
| S4 | The LLM confidence score is stable | To do |
| S5 | The LLM can give a first green / yellow / red | To do |
