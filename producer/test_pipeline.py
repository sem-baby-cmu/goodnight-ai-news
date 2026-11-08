"""End to end checks for one story.

Three stages, matching the three things that can break on their own:

  A. voice     script -> audio clips and word timings
  B. web       script -> the per page reader, with tap interactions
  C. joined    the reader actually loads the clips and the words line up

Stage A needs ELEVENLABS_API_KEY and normal network access, so it is skipped
when the clips are not there. B and C run anywhere. C is the one that matters:
A and B both passed on their own while the two halves still did not meet,
because the filenames did not match.

    python3 test_pipeline.py --date 2026-11-07
    python3 test_pipeline.py --date 2026-11-07 --synthesize   # also runs stage A

Exit code is 1 if any check fails, so this can gate a commit.
"""
import argparse, json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "package"))
import _story  # noqa: E402

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
results = []


def check(stage, name, ok, detail=""):
    state = PASS if ok is True else (SKIP if ok is None else FAIL)
    results.append((stage, name, state, detail))
    mark = {"PASS": "ok  ", "FAIL": "FAIL", "SKIP": "skip"}[state]
    print(f"  {mark}  {name}" + (f"   {detail}" if detail else ""))
    return state == PASS


def run(cmd):
    r = subprocess.run([sys.executable, *cmd], cwd=ROOT,
                       capture_output=True, text=True)
    return r.returncode == 0, (r.stdout + r.stderr).strip()


# ---------------------------------------------------------------- stage A
def stage_voice(date, age, pages, outdir, provider, synthesize):
    print("\nA. voice   script -> audio clips and word timings")
    vdir = outdir / "voice"

    if synthesize:
        ok, log = run(["voice/synthesize.py", "--date", date, "--age", age,
                       "--providers", provider, "--align"])
        if not check("A", "synthesis ran", ok, log.splitlines()[-1] if log else ""):
            return {}

    clips = {}
    for p in pages:
        for ext in ("mp3", "wav"):
            f = vdir / f"{age}-{p['page']:02d}-{provider}.{ext}"
            if f.exists():
                clips[p["page"]] = f
                break

    if not clips:
        check("A", "a clip for every page", None,
              f"no clips in {vdir.relative_to(ROOT)}. Needs an API key and network.")
        check("A", "word timings for every page", None, "")
        check("A", "every word reached the timings", None, "")
        return {}

    check("A", "a clip for every page", len(clips) == len(pages),
          f"{len(clips)}/{len(pages)}")

    timed, missing_words, bad_order = 0, [], []
    for p in pages:
        f = clips.get(p["page"])
        if not f:
            continue
        w = f.with_suffix(".words.json")
        if not w.exists():
            continue
        timed += 1
        words = json.loads(w.read_text())
        said = " ".join(x["word"] for x in words).lower()
        for tok in re.findall(r"[a-z']+", p["text"].lower()):
            if tok not in said:
                missing_words.append((p["page"], tok))
        ts = [(x["start"], x["end"]) for x in words]
        if any(b < a for a, b in zip([t[1] for t in ts], [t[0] for t in ts[1:]])):
            bad_order.append(p["page"])

    check("A", "word timings for every page", timed == len(pages),
          f"{timed}/{len(pages)}")
    check("A", "every word reached the timings", not missing_words,
          f"missing {missing_words[:4]}" if missing_words else "")
    check("A", "timings run forward", not bad_order,
          f"out of order on pages {bad_order}" if bad_order else "")
    return clips


# ---------------------------------------------------------------- stage B
def stage_web(date, age, pages, outdir):
    print("\nB. web     script -> the per page reader")
    ok, log = run(["package/build_reader.py", "--date", date, "--age", age])
    if not check("B", "reader builds", ok, "" if ok else log.splitlines()[-1]):
        return None

    html = (outdir / f"read-{age}.html").read_text()
    m = re.search(r"const PAGES\s*=\s*(\[.*?\]);", html, re.S)
    if not m:
        check("B", "page data is embedded", False, "PAGES not found")
        return None
    data = json.loads(m.group(1))
    check("B", "page data is embedded", True, f"{len(data)} pages")
    check("B", "one web page per script page", len(data) == len(pages),
          f"{len(data)} vs {len(pages)}")

    # A caption that renders short is the bug this catches: an earlier build
    # dropped the end of long lines, and nothing failed.
    cut = [d["page"] for d, p in zip(data, pages) if d["text"] != p["text"]]
    check("B", "every caption is complete", not cut,
          f"changed on pages {cut}" if cut else "")

    check("B", "every page has a picture",
          all(d["svg"].lstrip().startswith("<svg") for d in data))

    taps = [d["page"] for d in data if d["tap"]]
    check("B", "a tap on every second or third page",
          bool(taps) and max(b - a for a, b in zip([0, *taps], taps)) <= 3,
          f"tap pages {taps}")

    kb = (outdir / f"read-{age}.html").stat().st_size / 1024
    check("B", "small enough to open on mobile data", kb < 2048, f"{kb:.0f} KB")
    return data


# ---------------------------------------------------------------- stage C
def stage_joined(data, clips, pages, outdir, age):
    print("\nC. joined  the reader loads the clips and the words line up")
    if data is None:
        check("C", "reader embeds a clip for every page", False, "no reader")
        return
    if not clips:
        check("C", "reader embeds a clip for every page", None, "stage A skipped")
        check("C", "the spoken words match the words on screen", None, "")
        check("C", "narration ends inside the clip", None, "")
        return

    with_audio = [d["page"] for d in data if d.get("audio")]
    check("C", "reader embeds a clip for every page",
          len(with_audio) == len(pages),
          f"{len(with_audio)}/{len(pages)}. Filenames must match "
          f"build_reader.audio(): <age>-<page>-<provider>.mp3")

    drift = []
    for d in data:
        if not d.get("words"):
            continue
        said = re.findall(r"[a-z']+", " ".join(w["word"] for w in d["words"]).lower())
        shown = re.findall(r"[a-z']+", d["text"].lower())
        if said != shown:
            drift.append(d["page"])
    check("C", "the spoken words match the words on screen", not drift,
          f"differ on pages {drift}" if drift else "")

    late = []
    for d in data:
        if not d.get("words"):
            continue
        end = d["words"][-1]["end"]
        f = clips.get(d["page"])
        if f and end > _duration(f) + 0.3:
            late.append(d["page"])
    check("C", "narration ends inside the clip", not late,
          f"overruns on pages {late}" if late else "")

    total = sum(d["words"][-1]["end"] for d in data if d.get("words"))
    check("C", "a bedtime length story", 40 <= total <= 420,
          f"{total/60:.1f} minutes")


def _duration(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=duration", "-of", "csv=p=0", str(f)],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 1e9


def main():
    ap = _story.add_args(argparse.ArgumentParser())
    ap.add_argument("--voice-provider", default="elevenlabs")
    ap.add_argument("--synthesize", action="store_true",
                    help="Also run stage A. Costs credits and needs a key.")
    a = ap.parse_args()
    date, script, pages, outdir = _story.load(a)

    print(f"{script['title']}  ({date}, ages {a.age}, {len(pages)} pages)")
    clips = stage_voice(date, a.age, pages, outdir, a.voice_provider, a.synthesize)
    data = stage_web(date, a.age, pages, outdir)
    stage_joined(data, clips, pages, outdir, a.age)

    n = {s: sum(1 for *_, st, _ in results if st == s) for s in (PASS, FAIL, SKIP)}
    print(f"\n{n[PASS]} passed, {n[FAIL]} failed, {n[SKIP]} skipped")
    if n[SKIP]:
        print("Skipped checks need ELEVENLABS_API_KEY and normal network access.")
    sys.exit(1 if n[FAIL] else 0)


if __name__ == "__main__":
    main()
