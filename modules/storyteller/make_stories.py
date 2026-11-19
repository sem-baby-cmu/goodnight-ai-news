#!/usr/bin/env python3
"""Write one contract story file per story, with both age scripts.

  python3 make_stories.py           # writes stories/<story_id>.json
  python3 make_stories.py --check   # also runs integration/validate.py on each file

Inputs (all in this folder):
  sources/<name>.json         Scout output (Scout format)
  outputs/<name>_5to7.json    pilot script, ages 5 to 7
  outputs/<name>_8to10.json   pilot script, ages 8 to 10
  story_extras.json           story-level content: ai_word, hidden_elements, settings, ...

The output matches integration/story.schema.json. This script only reshapes and
copies: every word in the output comes from one of the inputs above.
Standard library only (Python 3.9+).
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))
from checks import fk_grade  # noqa: E402

AGES = ("5to7", "8to10")


def uuid7():
    """UUID version 7 (time ordered), lower case. Python 3.9 has no uuid.uuid7."""
    ms = int(time.time() * 1000)
    rand = int.from_bytes(os.urandom(10), "big")
    value = (ms & ((1 << 48) - 1)) << 80
    value |= 0x7 << 76                          # version 7
    value |= ((rand >> 62) & 0xFFF) << 64       # rand_a, 12 bits
    value |= 0b10 << 62                         # variant 10
    value |= rand & ((1 << 62) - 1)             # rand_b, 62 bits
    h = f"{value:032x}"
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


def page(n, p, setting, scene=None):
    out = {
        "page": n,
        "slot": p["slot"],
        "tone": p["tone_tag"],
        "text": " ".join(s["text"] for s in p["sentences"]),
        "tags": [s["tag"] for s in p["sentences"]],
        "scene_description": scene or p["scene_description"],
        "setting": setting,
    }
    return out


def build(name, extras, scripts_dir=HERE / "outputs"):
    src = json.loads((HERE / "sources" / f"{name}.json").read_text())
    scripts = {age: json.loads((scripts_dir / f"{name}_{age}.json").read_text()) for age in AGES}
    a, b = scripts["5to7"], scripts["8to10"]
    assert a["title"] == b["title"] and a["parent_card"] == b["parent_card"] and a["key_facts"] == b["key_facts"], name
    assert len(extras["settings"]) == 10, name

    story = {
        "story_id": extras["story_id"],
        "title": a["title"],
        "source_title": src["title"],
        "source_url": src["source_links"][0],
        "source_links": src["source_links"],
        "confidence": src["confidence"],
        "first_rating": src["first_rating"],
        "full_text": src["full_text"],
    }
    for age, s in scripts.items():
        story[f"script_{age}"] = [
            page(i + 1, p, extras["settings"][i], extras["page3_scene_description"] if i == 2 else None)
            for i, p in enumerate(s["pages"])
        ]
    story["fk_grade"] = {
        age: fk_grade([x["text"] for p in s["pages"] if p["slot"] != "quiz" for x in p["sentences"]])
        for age, s in scripts.items()
    }
    pc = a["parent_card"]
    story["parent_card"] = {
        "ai_concept": pc["concept"],
        "background": pc["background"],
        "question_to_ask": pc["question"],
        "honest_answer": pc["honest_answer"],
    }
    story["key_facts"] = a["key_facts"]
    story["hidden_elements"] = [{"element": h["element"], "fun_fact": h["fun_fact"]} for h in extras["hidden_elements"]]
    story["ai_word"] = extras["ai_word"]
    story["ai_word_definition"] = extras["ai_word_definition"]
    story["ai_word_illustration_prompt"] = extras["ai_word_illustration_prompt"]
    story["themes"] = a.get("themes", [])
    story["review_status"] = "draft"
    return story


def main(argv):
    path = HERE / "story_extras.json"
    extras = json.loads(path.read_text())
    minted = False
    for name, e in extras.items():
        if name.startswith("_"):
            continue
        if not e.get("story_id"):          # mint once, then keep it so reruns name the same story
            e["story_id"] = uuid7()
            minted = True
    if minted:
        path.write_text(json.dumps(extras, indent=2, ensure_ascii=False) + "\n")

    out_dir = HERE / "stories"
    out_dir.mkdir(exist_ok=True)
    files = []
    for name, e in extras.items():
        if name.startswith("_"):
            continue
        story = build(name, e)
        f = out_dir / f"{story['story_id']}.json"
        f.write_text(json.dumps(story, indent=2, ensure_ascii=False) + "\n")
        files.append(f)
        print(f"{name}: {f.relative_to(HERE)}")

    if "--check" in argv:
        validator = REPO / "integration" / "validate.py"
        rc = 0
        for args in (["--owner", "Storyteller"], []):
            r = subprocess.run([sys.executable, "-I", str(validator), *args, *map(str, files)])
            rc = rc or r.returncode
        return rc
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
