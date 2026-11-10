#!/usr/bin/env python3
"""I2 step: narration through Producer's own synthesize.py.

Producer's Gemini route cannot run here: with google-genai 3.1.0 the call gets
a 400 on the default v1 API, and the project of the Gemini key in the run
shell has the Gemini API turned off (403 SERVICE_DISABLED, 2026-11-10). This wrapper keeps Producer's loop, file
names, and SAY_AS spellings, and swaps only the "gemini" provider for
Gemini 3.8 Flash TTS through OpenRouter. Producer's files are not changed.

OpenRouter returns raw PCM (16-bit, mono). The reader plays mp3 or wav, so each
clip is encoded to mp3 with ffmpeg. That encoding is a manual step for I2.

    OPENROUTER_API_KEY=... python3 -I integration/runs/i2-2026-11-10/narrate.py --age 5to7

Writes producer/results/2026-11-10/voice/<age>-<page>-gemini.mp3 (not tracked)
and copies Producer's voice_log.json here as voice_log_<age>.json, with the
OpenRouter generation id and cost added to each row.
"""
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "producer" / "voice"))
import synthesize  # noqa: E402

MODEL = "google/gemini-3.8-flash-tts"
DATE = "2026-11-10"
API = "https://openrouter.ai/api/v1"
generations = []


def _post(body):
    req = urllib.request.Request(
        f"{API}/audio/speech", data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + os.environ["OPENROUTER_API_KEY"],
                 "Content-Type": "application/json"})
    for attempt in (1, 2, 3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read(), r.headers
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(5 * attempt)
                continue
            raise RuntimeError(f"{e.code} {e.read()[:300]!r}") from None


def say_openrouter(text, voice):
    t0 = time.time()
    pcm, headers = _post({"model": MODEL, "input": text, "voice": voice,
                          "response_format": "pcm"})
    secs = time.time() - t0
    ctype = headers.get("Content-Type", "")
    rate = re.search(r"rate=(\d+)", ctype)
    chans = re.search(r"channels=(\d+)", ctype)
    if not ctype.startswith("audio/pcm") or not rate:
        raise RuntimeError(f"unexpected content type {ctype!r}")
    mp3 = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "s16le", "-ar", rate.group(1),
         "-ac", chans.group(1) if chans else "1", "-i", "-",
         "-b:a", "64k", "-f", "mp3", "-"],
        input=pcm, capture_output=True, check=True).stdout
    generations.append({"id": headers.get("X-Generation-Id"), "pcm_bytes": len(pcm),
                        "audio_seconds": round(len(pcm) / (2 * int(rate.group(1))), 2)})
    return mp3, "mp3", None, secs


def cost(gen_id):
    req = urllib.request.Request(
        f"{API}/generation?id={gen_id}",
        headers={"Authorization": "Bearer " + os.environ["OPENROUTER_API_KEY"]})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read())["data"]
        return d.get("total_cost")
    except Exception:
        return None


def main():
    age = sys.argv[sys.argv.index("--age") + 1] if "--age" in sys.argv else "5to7"
    synthesize.PROVIDERS["gemini"] = say_openrouter
    sys.argv = ["synthesize.py", "--script", str(HERE / "story.json"),
                "--date", DATE, "--age", age, "--providers", "gemini"]
    synthesize.main()

    log_src = REPO / "producer" / "results" / DATE / "voice_log.json"
    rows = json.loads(log_src.read_text())
    time.sleep(3)  # generation stats appear a moment after the call
    ok_rows = [r for r in rows if r.get("ok")]
    for row, gen in zip(ok_rows, generations):
        row.update(model=MODEL, route="openrouter", generation_id=gen["id"],
                   audio_seconds=gen["audio_seconds"], cost_usd=cost(gen["id"]))
    (HERE / f"voice_log_{age}.json").write_text(json.dumps(rows, indent=2) + "\n")
    failed = len(rows) - len(ok_rows)
    print(f"{len(ok_rows)} clips, {failed} failed. Log: voice_log_{age}.json")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is needed to encode the PCM clips")
    main()
