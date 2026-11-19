#!/usr/bin/env python3
"""Live Storyteller run through the Anthropic Messages API.

  python3 run_live.py                    # all 3 stories in sources/
  python3 run_live.py --story praise     # one story
  python3 run_live.py --mock             # no API: replays outputs/ to test the pipeline

Per story: 2 script calls (prompts/storyteller_v5.md, one per age) and 1 story call
(prompts/storyteller_v6.md). Then it builds the contract file, runs checks.py
(T1, T3) and integration/validate.py, and logs time, tokens, and cost.

Key: ANTHROPIC_API_KEY in the environment, or in a `.env` file at the repo root or
in this folder (git ignores `.env`). The key is never printed or written.

Writes live/<run_id>/: outputs/, extras.json, stories/<story_id>.json, run_log.json.
Standard library only (Python 3.9+).
"""
import argparse
import datetime as dt
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))
import checks  # noqa: E402
import make_stories  # noqa: E402

AGES = ("5to7", "8to10")
MODEL = "claude-sonnet-5-5"
# USD per million tokens (input, output). Secondary source, see README (T5 method).
PRICES = {"claude-sonnet-5-5": (2.0, 10.0), "claude-opus-5-5": (4.0, 20.0), "claude-haiku-5-5": (1.0, 5.0)}
API = "https://api.anthropic.com/v1/messages"


def api_key():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"].strip()
    for f in (REPO / ".env", HERE / ".env"):
        if f.exists():
            for line in f.read_text().splitlines():
                m = re.match(r"\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*['\"]?([^'\"\s]+)", line)
                if m:
                    return m.group(1)
    return None


def call(key, model, system, user, max_tokens=4000, temperature=0.3):
    body = json.dumps({"model": model, "max_tokens": max_tokens, "temperature": temperature,
                       "system": system, "messages": [{"role": "user", "content": user}]}).encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
    t0 = time.time()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180, context=ctx) as r:
                data = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:300]
            if e.code in (429, 500, 529) and attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            raise SystemExit(f"API error {e.code}: {msg}")
    text = "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
    u = data.get("usage", {})
    return text, {"seconds": round(time.time() - t0, 1), "input_tokens": u.get("input_tokens", 0),
                  "output_tokens": u.get("output_tokens", 0), "stop_reason": data.get("stop_reason")}


def parse_json(text):
    s = text.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s)
    i, j = s.find("{"), s.rfind("}")
    return json.loads(s[i:j + 1])


def script_prompt(age):
    p = (HERE / "prompts" / "storyteller_v5.md").read_text().replace("{AGE_LEVEL}", age)
    schema = (HERE / "storyteller_output.schema.json").read_text()
    return (p + "\n\n## Output schema (return one JSON object, nothing else)\n" + schema +
            f"\n\nSet age_level to \"{age}\". Use the source `id` as story_id. "
            "Each sentence is an object {\"text\", \"tag\"}; facts on the real_world_facts page also carry \"source_quote\".")


def story_prompt():
    p = (HERE / "prompts" / "storyteller_v6.md").read_text()
    return (p + "\n\n## Return exactly this JSON object, nothing else\n"
            '{"page3_scene_description": "...", "hidden_elements": [{"element": "...", "fun_fact": "...", '
            '"kind": "true|explain"}], "ai_word": "...", "ai_word_definition": "...", '
            '"ai_word_illustration_prompt": "...", "settings": [{"time": "...", "place": "..."}]}\n'
            "hidden_elements has exactly 3 items. settings has exactly 10 items.")


def story_input(src, scripts):
    pages = [{"page": i + 1, "slot": p["slot"], "scene_description": p["scene_description"]}
             for i, p in enumerate(scripts["5to7"]["pages"])]
    return json.dumps({"source": src, "parent_card": scripts["5to7"]["parent_card"],
                       "pages_5to7": pages}, ensure_ascii=False)


def cost(model, tin, tout):
    pi, po = PRICES.get(model, (0, 0))
    return round((tin * pi + tout * po) / 1e6, 5)


def run_story(name, key, model, out, mock, log):
    src = json.loads((HERE / "sources" / f"{name}.json").read_text())
    scripts = {}
    for age in AGES:
        if mock:
            scripts[age] = json.loads((HERE / "outputs" / f"{name}_{age}.json").read_text())
            m = {"seconds": 0, "input_tokens": 0, "output_tokens": 0, "stop_reason": "mock"}
        else:
            text, m = call(key, model, script_prompt(age), json.dumps(src, ensure_ascii=False))
            (out / "raw").mkdir(parents=True, exist_ok=True)
            (out / "raw" / f"{name}_{age}.txt").write_text(text)
            scripts[age] = parse_json(text)
        scripts[age]["story_id"], scripts[age]["age_level"] = name, age
        (out / "outputs" / f"{name}_{age}.json").write_text(json.dumps(scripts[age], indent=2, ensure_ascii=False) + "\n")
        log.append({"story": name, "call": f"script_{age}", **m, "cost_usd": cost(model, m["input_tokens"], m["output_tokens"])})

    base = json.loads((HERE / "story_extras.json").read_text())[name]
    if mock:
        extras = {k: v for k, v in base.items() if k != "story_id"}
        m = {"seconds": 0, "input_tokens": 0, "output_tokens": 0, "stop_reason": "mock"}
    else:
        text, m = call(key, model, story_prompt(), story_input(src, scripts), max_tokens=2000)
        (out / "raw" / f"{name}_story.txt").write_text(text)
        extras = parse_json(text)
    extras["story_id"] = base["story_id"]          # same story, new generation: keep its ID
    log.append({"story": name, "call": "story", **m, "cost_usd": cost(model, m["input_tokens"], m["output_tokens"])})
    return extras


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--story", default="all")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--mock", action="store_true")
    a = ap.parse_args(argv)
    key = None
    if not a.mock:
        key = api_key()
        if not key:
            print("No ANTHROPIC_API_KEY. Set it in the environment or in a .env file (see the docstring).")
            return 2
    names = sorted(p.stem for p in (HERE / "sources").glob("*.json")) if a.story == "all" else [a.story]
    run_id = dt.datetime.now().strftime("%Y-%m-%d_%H%M") + ("_mock" if a.mock else "")
    out = HERE / "live" / run_id
    (out / "outputs").mkdir(parents=True, exist_ok=True)
    (out / "stories").mkdir(exist_ok=True)

    log, all_extras, results, t0 = [], {}, [], time.time()
    for name in names:
        print(f"{name}: running ...", flush=True)
        ex = run_story(name, key, a.model, out, a.mock, log)
        all_extras[name] = ex
        story = make_stories.build(name, ex, scripts_dir=out / "outputs")
        f = out / "stories" / f"{story['story_id']}.json"
        f.write_text(json.dumps(story, indent=2, ensure_ascii=False) + "\n")
        scene = story["script_5to7"][2]["scene_description"].lower()
        row = {"story": name, "file": str(f.relative_to(HERE)),
               "hidden_elements_in_scene": sum(h["element"].lower() in scene for h in story["hidden_elements"]),
               "settings": len(ex.get("settings", []))}
        for age in AGES:
            doc = json.loads((out / "outputs" / f"{name}_{age}.json").read_text())
            t1, t3 = checks.t1_structure(doc), checks.t3_reading(doc)
            row[age] = {"T1": t1["pass"], "T1_errors": t1["errors"][:3], "FK": t3["fk_grade"], "T3": t3["pass"],
                        "longest_sentence": t3["longest_sentence_words"], "length_rule_ok": t3["length_rule_ok"],
                        "hard_words": t3["hard_words"]}
        v = subprocess.run([sys.executable, "-I", str(REPO / "integration" / "validate.py"), str(f)],
                           capture_output=True, text=True)
        row["validate"] = v.stdout.strip().splitlines()[0].split(": ", 1)[-1] if v.stdout else v.stderr.strip()
        row["validate_errors"] = v.stdout.strip().splitlines()[1:6]
        results.append(row)
        print(f"  {row['validate']} | 5to7 FK {row['5to7']['FK']} | 8to10 FK {row['8to10']['FK']}", flush=True)

    (out / "extras.json").write_text(json.dumps(all_extras, indent=2, ensure_ascii=False) + "\n")
    tin, tout = sum(x["input_tokens"] for x in log), sum(x["output_tokens"] for x in log)
    summary = {"run_id": run_id, "model": "mock" if a.mock else a.model, "stories": len(names),
               "wall_seconds": round(time.time() - t0, 1),
               "api_seconds": round(sum(x["seconds"] for x in log), 1),
               "input_tokens": tin, "output_tokens": tout,
               "cost_usd": round(sum(x["cost_usd"] for x in log), 4),
               "cost_per_story_usd": round(sum(x["cost_usd"] for x in log) / max(len(names), 1), 4),
               "prices_per_mtok": PRICES.get(a.model), "calls": log, "results": results}
    (out / "run_log.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(f"\n{run_id}: {len(names)} stories, {summary['api_seconds']} s in API calls, "
          f"{tin} in / {tout} out tokens, ${summary['cost_usd']} (${summary['cost_per_story_usd']} per story)")
    print(f"log: {(out / 'run_log.json').relative_to(HERE)}")
    return 0 if all(r["validate"] == "PASS" for r in results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
