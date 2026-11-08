"""Infer when and where each page happens, when Storyteller does not say.

Storyteller should supply `setting`, because the script knows the story. This
is the fallback, and building it showed that the question splits in two:

  time   belongs to Producer. It follows the slot exactly, with no reference
         to the news at all, because time carries the bedtime frame: the story
         opens and closes at night with Pip, and the news itself happens in
         daylight. Checked against 20 hand placed pages: 20 of 20.

  place  needs the news. Four slots are Pip's own frame and never move. The
         six news slots happen wherever the story happens, and only the script
         knows that, so this guesses from the words on the page.

So the handoff we need from Storyteller is smaller than it looked. One field
per story, not two fields per page: which world the news happens in.
"""

# Time is the bedtime frame, not the news. Anything unlisted happens in daylight.
TIME_BY_SLOT = {"cover": "night", "character": "night",
                "reflection": "night", "quiz": "dusk"}

# Pip's own frame. These four never move, whatever the news is about.
FRAME_PLACE = {"cover": "street", "character": "rooftop",
               "reflection": "bedroom", "quiz": "plain"}

# A world is where the news happens, walked through over the six news pages so
# the story moves instead of sitting in one room.
WORLDS = {
    "school": ["campus", "classroom", "office", "classroom", "campus", "campus"],
    "work": ["office", "office", "campus", "office", "office", "campus"],
    "city": ["street", "street", "rooftop", "street", "rooftop", "street"],
    "home": ["bedroom", "street", "bedroom", "street", "bedroom", "street"],
}

# First world whose words appear most often wins. Ties go to the earlier entry.
WORLD_WORDS = {
    "school": ["school", "class", "classes", "learn", "learns", "learned",
               "teacher", "teach", "student", "students", "college",
               "university", "campus", "degree", "coach", "program"],
    "work": ["work", "worker", "workers", "job", "jobs", "company",
             "engineer", "engineers", "office", "leader", "boss", "team",
             "hire", "hired", "career"],
    "city": ["city", "town", "street", "shop", "shops", "bus", "train",
             "park", "road", "building", "buildings"],
    "home": ["home", "house", "family", "parent", "parents", "kitchen",
             "bedroom", "garden"],
}

NEWS_SLOTS = ["news_discovery", "exploration", "challenge",
              "turning_point", "resolution", "real_world_facts"]


def world_of(pages):
    """Pick one world for the whole story from the words in it."""
    import re
    words = re.findall(r"[a-z]+", " ".join(p["text"] for p in pages).lower())
    counts = {w: sum(words.count(k) for k in keys)
              for w, keys in WORLD_WORDS.items()}
    best = max(counts.values())
    if best == 0:
        return "city"
    return next(w for w in WORLD_WORDS if counts[w] == best)


def infer(pages):
    """Return a setting per page. Does not change pages that already have one."""
    world = WORLDS[world_of(pages)]
    out, n = [], 0
    for p in pages:
        if p.get("setting"):
            out.append(p["setting"])
            continue
        slot = p["slot"]
        if slot in FRAME_PLACE:
            place = FRAME_PLACE[slot]
        else:
            place = world[n % len(world)]
            n += 1
        out.append({"time": TIME_BY_SLOT.get(slot, "day"), "place": place})
    return out


if __name__ == "__main__":
    # Score the fallback against the settings placed by hand, so the report can
    # say how much of the handoff Producer can actually cover on its own.
    import json, pathlib, sys
    src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                       else "input/2026-11-07.json")
    d = json.loads(src.read_text())
    t_ok = p_ok = n = 0
    for key in ("script_5to7", "script_8to10"):
        pages = d[key]
        hand = [p["setting"] for p in pages]
        bare = [{k: v for k, v in p.items() if k != "setting"} for p in pages]
        print(f"\n{key}   world guessed: {world_of(pages)}")
        for p, h, g in zip(pages, hand, infer(bare)):
            t, q = h["time"] == g["time"], h["place"] == g["place"]
            t_ok += t; p_ok += q; n += 1
            mark = "  " if t and q else "<-"
            print(f"  {mark} {p['slot']:18s} hand {h['time']:5s} {h['place']:10s}"
                  f"   guess {g['time']:5s} {g['place']:10s}")
    print(f"\ntime  {t_ok}/{n}    place {p_ok}/{n}")
