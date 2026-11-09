"""Storyteller feasibility checks (T1, T2-auto, T3, hard words, T5 estimate).

Usage: python3 checks.py            # checks every file in outputs/
Writes results/results.json and prints a summary table.
No third-party packages needed except jsonschema.
"""
import json, re, glob, os
from jsonschema import Draft202012Validator

HERE = os.path.dirname(os.path.abspath(__file__))
SLOTS = ["cover", "character", "news_discovery", "exploration", "challenge",
         "turning_point", "resolution", "reflection", "real_world_facts", "quiz"]
STORY_WORLD = {"pip", "goodnight", "ai", "i", "okay", "ok"}  # allowed capitalized words not in source
# Price per million tokens (input, output). Secondary source: apidog.com, Sep 29 2026.
PRICES = {"sonnet-5.5": (2.0, 10.0), "opus-5.5": (4.0, 20.0)}
# Everyday 3+ syllable words a 5-7 year old knows (allowlist for the hard-word check)
EASY_LONG = {"computer", "computers", "everybody", "everyone", "family", "important",
             "animals", "another", "together", "already", "tomorrow", "beautiful",
             "remember", "idea", "ideas", "banana", "hospital", "library", "favorite",
             "wonderful", "anything", "everything", "dinosaur", "today", "carefully",
             "helpers", "every", "different", "robot", "robots", "anyone", "underneath",
             "company", "companies", "family", "happily", "already"}

schema = json.load(open(os.path.join(HERE, "storyteller_output.schema.json")))
validator = Draft202012Validator(schema)


def syllables(word):
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
        n -= 1
    if w.endswith(("ed",)) and not w.endswith(("ted", "ded")) and n > 1:
        n -= 1
    # silent e before plural/verb s: "files", "saves", "makes" (but not "boxes", "places")
    voiced_es = w.endswith(("ses", "ces", "zes", "ges", "xes", "shes", "ches", "ies", "ees"))
    consonant_le = re.search(r"[^aeiou]les$", w) is not None
    if w.endswith("es") and not voiced_es and not consonant_le and n > 1:  # tables/apples keep their syllable
        n -= 1
    return max(n, 1)


# Known counts used to sanity-check the heuristic (run: python3 checks.py --selftest)
SYLLABLE_SELFTEST = {"files": 1, "saves": 1, "makes": 1, "places": 2, "boxes": 2, "copies": 2,
                     "service": 2, "computer": 3, "passwords": 2, "treasure": 2, "little": 2,
                     "attack": 2, "engineers": 3, "company": 3, "helper": 2, "secret": 2,
                     "hackers": 2, "owl": 1, "robot": 2, "everyone": 3,
                     "tables": 2, "apples": 2, "smiles": 1, "miles": 1, "candles": 2}


def fk_grade(sentences):
    words = [w for s in sentences for w in re.findall(r"[A-Za-z']+", s)]
    if not words:
        return None
    syl = sum(syllables(w) for w in words)
    return round(0.39 * (len(words) / len(sentences)) + 11.8 * (syl / len(words)) - 15.59, 1)


def t1_structure(doc):
    errors = [e.message for e in validator.iter_errors(doc)]
    slots = [p["slot"] for p in doc.get("pages", [])]
    in_order = [s for s in SLOTS if s in slots] == slots and len(set(slots)) == len(slots)
    if not in_order:
        errors.append(f"slots out of order or repeated: {slots}")
    if len(slots) != 10:
        errors.append(f"expected 10 pages, got {len(slots)}")
    return {"pass": not errors, "pages": len(slots), "errors": errors}


def t2_auto(doc, source):
    """Automatic pre-check for added facts. A human still checks every 'true' sentence."""
    src = source["full_text"].lower()
    flags = []
    for p in doc["pages"]:
        if p["slot"] == "cover":  # title case is not a name
            continue
        for s in p["sentences"]:
            text = re.sub(r'["\u201c]\s*\w+', '"', s["text"])  # first word inside a quote is not a name
            nums = re.findall(r"\d[\d,]*", text)
            caps = [re.sub(r"'s$", "", w) for i, w in enumerate(re.findall(r"[A-Za-z][\w'-]*", text))
                    if i > 0 and w[0].isupper()]
            unknown_nums = [n for n in nums if n.replace(",", "") not in src.replace(",", "")]
            unknown_caps = [c for c in caps if c.lower() not in src and c.lower() not in STORY_WORLD]
            if s["tag"] == "true" and (unknown_nums or unknown_caps):
                flags.append({"page": p["slot"], "text": s["text"], "issue": "true sentence has name/number not in source",
                              "items": unknown_nums + unknown_caps})
            if s["tag"] == "imagine":
                real = [c for c in caps if c.lower() in src and c.lower() not in STORY_WORLD]
                if real:
                    flags.append({"page": p["slot"], "text": s["text"], "issue": "real name used in an 'imagine' sentence",
                                  "items": real})
            if s.get("source_quote") and s["source_quote"].lower() not in src:
                flags.append({"page": p["slot"], "text": s["text"], "issue": "source_quote not found word for word"})
            if p["slot"] == "real_world_facts" and s["tag"] == "true" and not s.get("source_quote"):
                flags.append({"page": p["slot"], "text": s["text"], "issue": "fact without source_quote"})
    true_count = sum(1 for p in doc["pages"] for s in p["sentences"] if s["tag"] == "true")
    return {"flags": flags, "true_sentences": true_count, "auto_pass": not flags}


def t3_reading(doc):
    sents = [s["text"] for p in doc["pages"] if p["slot"] != "quiz" for s in p["sentences"]]
    grade = fk_grade(sents)
    limit = 2.0 if doc["age_level"] == "5to7" else 4.0
    longest = max(len(re.findall(r"[A-Za-z0-9'$]+", s)) for s in sents)
    hard, names = [], []
    if doc["age_level"] == "5to7":
        for s in sents:
            for i, w in enumerate(re.findall(r"[A-Za-z']+", s)):
                if syllables(w) >= 3 and w.lower() not in EASY_LONG:
                    (names if (i > 0 and w[0].isupper()) else hard).append(w)
    story_sents = [s["text"] for p in doc["pages"] if p["slot"] not in ("quiz", "real_world_facts") for s in p["sentences"]]
    max_words = 10 if doc["age_level"] == "5to7" else 18
    return {"fk_grade": grade, "fk_story_pages_only": fk_grade(story_sents), "limit": limit,
            "pass": grade is not None and grade <= limit,
            "longest_sentence_words": longest, "length_rule_ok": longest <= max_words,
            "hard_words": sorted(set(hard)), "long_names": sorted(set(names))}


def tokens(text):  # rough: ~4 characters per token for English
    return round(len(text) / 4)


def t5_cost(doc, source, prompt_text):
    t_in = tokens(prompt_text) + tokens(json.dumps(source))
    t_out = tokens(json.dumps(doc))
    cost = {m: round((t_in * pi + t_out * po) / 1e6, 4) for m, (pi, po) in PRICES.items()}
    return {"input_tokens_est": t_in, "output_tokens_est": t_out, "cost_usd_est": cost}


def main():
    prompt_text = open(os.path.join(HERE, "prompts", "storyteller_v4.md")).read()
    results = []
    for path in sorted(glob.glob(os.path.join(HERE, "outputs", "*.json"))):
        doc = json.load(open(path))
        source = json.load(open(os.path.join(HERE, "sources", doc["story_id"] + ".json")))
        results.append({
            "file": os.path.basename(path), "story": doc["story_id"], "age": doc["age_level"],
            "T1": t1_structure(doc), "T2_auto": t2_auto(doc, source),
            "T3": t3_reading(doc), "T5": t5_cost(doc, source, prompt_text),
            "rating": doc["first_rating"], "themes": doc.get("themes", []),
        })
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    json.dump(results, open(os.path.join(HERE, "results", "results.json"), "w"), indent=2)
    print(f"{'file':<22}{'T1':<6}{'pages':<7}{'T2flags':<9}{'FK':<7}{'T3':<6}{'long':<6}{'len_ok':<7}{'hard words':<24}{'in/out tok':<12}{'$sonnet':<8}")
    for r in results:
        print(f"{r['file']:<22}{str(r['T1']['pass']):<6}{r['T1']['pages']:<7}{len(r['T2_auto']['flags']):<9}"
              f"{str(r['T3']['fk_grade']):<7}{str(r['T3']['pass']):<6}{r['T3']['longest_sentence_words']:<6}"
              f"{str(r['T3']['length_rule_ok']):<7}{','.join(r['T3']['hard_words'])[:22]:<24}{str(r['T5']['input_tokens_est'])+'/'+str(r['T5']['output_tokens_est']):<12}"
              f"{r['T5']['cost_usd_est']['sonnet-5.5']:<8}")
        for e in r["T1"]["errors"]:
            print("   T1:", e)
        for f in r["T2_auto"]["flags"]:
            print("   T2:", f["issue"], "|", f["text"], "|", f.get("items", ""))


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        wrong = {w: (syllables(w), n) for w, n in SYLLABLE_SELFTEST.items() if syllables(w) != n}
        print(f"syllable selftest: {len(SYLLABLE_SELFTEST) - len(wrong)}/{len(SYLLABLE_SELFTEST)} correct", wrong or "")
    else:
        main()
