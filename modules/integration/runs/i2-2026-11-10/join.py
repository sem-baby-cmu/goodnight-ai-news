#!/usr/bin/env python3
"""I2 step: join Scout and Storyteller output into one contract story file.

Reads the received files as they are and never changes them:
  storyteller/sources/praise.json        Scout format (not a live Scout run)
  storyteller/outputs/praise_5to7.json   Storyteller pilot, pasted (risk R3)
  storyteller/outputs/praise_8to10.json  Storyteller pilot, pasted (risk R3)

Writes, next to this file:
  story.json   the joined story, for `integration/validate.py` and Producer
  edits.json   one row per manual field edit (the I2 count)

Only renames and restructures are made here. Content that Storyteller did not
write (for example `ai_word`) is left missing, so the contract check shows it.

    python3 -I integration/runs/i2-2026-11-10/join.py
"""
import json
import pathlib
import uuid

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[2]
SRC = REPO / "storyteller" / "sources" / "praise.json"
AGES = {age: REPO / "storyteller" / "outputs" / f"praise_{age}.json"
        for age in ("5to7", "8to10")}

edits = []


def edit(field, kind, change, values=1):
    edits.append({"field": field, "kind": kind, "change": change, "values": values})


def page(n, p):
    """Storyteller pilot page -> contract page."""
    return {
        "page": n,
        "slot": p["slot"],
        "tone": p["tone_tag"],
        "text": " ".join(s["text"] for s in p["sentences"]),
        "tags": [s["tag"] for s in p["sentences"]],
        "scene_description": p["scene_description"],
    }


def main():
    scout = json.loads(SRC.read_text())
    st = {age: json.loads(f.read_text()) for age, f in AGES.items()}
    first = st["5to7"]

    # The two files must agree on every story-level field before one is kept.
    shared = [k for k in first if k not in ("pages", "age_level")]
    differ = [k for k in shared if first[k] != st["8to10"][k]]
    if differ:
        raise SystemExit(f"age files disagree on {differ}; stop and ask Storyteller")
    # Scout owns these. Storyteller repeats them; keep Scout's only if they agree.
    differ = [k for k in ("source_links", "first_rating") if scout[k] != first[k]]
    if differ:
        raise SystemExit(f"Scout and Storyteller disagree on {differ}; stop and ask")

    old = HERE / "story.json"
    story_id = (json.loads(old.read_text())["story_id"] if old.exists()
                else str(uuid.uuid7()))

    story = {
        "story_id": story_id,
        "title": first["title"],
        # Scout fields, copied as they are (copy and paste is allowed in I2).
        "source_title": scout["title"],
        "source_links": scout["source_links"],
        "confidence": scout["confidence"],
        "first_rating": scout["first_rating"],
        "full_text": scout["full_text"],
        "script_5to7": [page(i, p) for i, p in enumerate(st["5to7"]["pages"], 1)],
        "script_8to10": [page(i, p) for i, p in enumerate(st["8to10"]["pages"], 1)],
        "parent_card": {
            "ai_concept": first["parent_card"]["concept"],
            "background": first["parent_card"]["background"],
            "question_to_ask": first["parent_card"]["question"],
            "honest_answer": first["parent_card"]["honest_answer"],
        },
        "key_facts": first["key_facts"],
        "themes": first["themes"],
        "review_status": first["review_status"],
    }

    pages = len(story["script_5to7"]) + len(story["script_8to10"])
    edit("source_title", "rename", "Scout title -> source_title")
    edit("id, date, full_text_note (Scout)", "drop",
         "not in the contract; the Scout id is not a UUID v7", 3)
    edit("story_id", "replace", f"'{first['story_id']}' -> new UUID v7")
    edit("script_5to7, script_8to10", "restructure",
         "two files with one age each -> one file with both scripts")
    edit("age_level", "drop", "per-file age has no place in the joined file", 2)
    edit("page", "add", "page number from the position in `pages`", pages)
    edit("tone", "rename", "tone_tag -> tone", pages)
    edit("text, tags", "restructure",
         "sentences[{tag, text}] -> text (sentences joined by a space) + tags[]", pages)
    edit("parent_card.ai_concept", "rename", "concept -> ai_concept")
    edit("parent_card.question_to_ask", "rename", "question -> question_to_ask")

    old.write_text(json.dumps(story, indent=2, ensure_ascii=False) + "\n")
    (HERE / "edits.json").write_text(json.dumps(edits, indent=2) + "\n")
    print(f"story.json  {story_id}  {pages} pages")
    print(f"edits.json  {len(edits)} field edits, {sum(e['values'] for e in edits)} values")


if __name__ == "__main__":
    main()
