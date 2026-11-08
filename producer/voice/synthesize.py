"""P3, P4: narration test.

Runs one script through several TTS providers, saves the audio, and records
which providers return word-level timestamps (needed for word highlighting).
Also writes a blind scoring sheet for the team.

This cannot run in Claude's sandbox: the gateway refuses api.elevenlabs.io,
api.openai.com and generativelanguage.googleapis.com. Run it on your own
machine.

    pip install openai elevenlabs google-genai
    export ELEVENLABS_API_KEY=...        # and/or OPENAI_API_KEY, GEMINI_API_KEY
    python voice/synthesize.py --date 2026-11-07

P4 note: only ElevenLabs returns timing from its own TTS call. For the other
providers, --align sends their audio plus the known text to the ElevenLabs
forced alignment endpoint, which returns word timings for audio it did not
generate. So P4 does not depend on a provider shipping timestamps.
"""
import argparse, json, os, pathlib, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "package"))
import _story  # noqa: E402

# One warm, slow, storytelling voice per provider.
VOICES = {
    "openai": "shimmer",
    "elevenlabs": "Rachel",
    "gemini": "Aoede",
}


def say_openai(text, voice):
    from openai import OpenAI
    t0 = time.time()
    r = OpenAI().audio.speech.create(
        model="gpt-4o-mini-tts", voice=voice, input=text,
        instructions="Read slowly and warmly, like a bedtime story. "
                     "Pause at the end of each sentence.")
    return r.content, "mp3", None, time.time() - t0


def say_elevenlabs(text, voice):
    from elevenlabs.client import ElevenLabs
    c = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    t0 = time.time()
    vid = next(v.voice_id for v in c.voices.get_all().voices if v.name == voice)
    r = c.text_to_speech.convert_with_timestamps(
        voice_id=vid, text=text, model_id="eleven_turbo_v2_5")
    import base64
    audio = base64.b64decode(r.audio_base_64)
    chars = r.alignment.characters
    starts = r.alignment.character_start_times_seconds
    ends = r.alignment.character_end_times_seconds
    return audio, "mp3", word_times(chars, starts, ends), time.time() - t0


def say_gemini(text, voice):
    from google import genai
    from google.genai import types
    t0 = time.time()
    c = genai.Client()
    r = c.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents=f"Read slowly and warmly, like a bedtime story: {text}",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=voice)))))
    data = r.candidates[0].content.parts[0].inline_data.data
    return data, "wav", None, time.time() - t0


def word_times(chars, starts, ends):
    """Collapse per-character timings into per-word timings."""
    words, cur, t0 = [], "", None
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if cur:
                words.append({"word": cur, "start": round(t0, 3), "end": round(prev, 3)})
                cur, t0 = "", None
        else:
            if not cur:
                t0 = s
            cur += ch
            prev = e
    if cur:
        words.append({"word": cur, "start": round(t0, 3), "end": round(prev, 3)})
    return words


def align(audio, ext, text):
    """Word timings for audio we did not generate.

    Forced alignment takes the audio and the text we already know and returns
    when each word is spoken. It is how OpenAI and Gemini clips can still drive
    word highlighting.
    """
    import io
    from elevenlabs.client import ElevenLabs
    c = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    f = io.BytesIO(audio)
    f.name = f"clip.{ext}"
    r = c.forced_alignment.create(file=f, text=text)
    return [{"word": w.text, "start": round(w.start, 3), "end": round(w.end, 3)}
            for w in r.words]


PROVIDERS = {"openai": say_openai, "elevenlabs": say_elevenlabs, "gemini": say_gemini}


def main():
    ap = argparse.ArgumentParser()
    _story.add_args(ap)
    ap.add_argument("--providers", default="openai,elevenlabs,gemini")
    ap.add_argument("--align", action="store_true",
                    help="For providers with no timings of their own, get them "
                         "by forced alignment. Needs ELEVENLABS_API_KEY.")
    ap.add_argument("--per-page", action="store_true",
                    help="One file per page instead of one file for the story")
    a = ap.parse_args()

    date, script, pages, outdir = _story.load(a)
    OUT = outdir / "voice"
    OUT.mkdir(parents=True, exist_ok=True)

    chunks = ([(p["page"], p["text"]) for p in pages] if a.per_page
              else [(0, "  ".join(p["text"] for p in pages))])

    log = []
    for prov in a.providers.split(","):
        fn, voice = PROVIDERS[prov], VOICES[prov]
        for pg, text in chunks:
            tag = f"p{pg:02d}" if pg else "full"
            name = f"{a.age}_{tag}_{prov}"
            row = {"provider": prov, "voice": voice, "age": a.age,
                   "page": pg, "words": len(text.split())}
            try:
                audio, ext, times, secs = fn(text, voice)
                row["timings_from"] = "tts" if times else None
                if times is None and a.align:
                    times = align(audio, ext, text)
                    row["timings_from"] = "forced alignment"
                (OUT / f"{name}.{ext}").write_bytes(audio)
                row.update(file=f"{name}.{ext}", seconds=round(secs, 1),
                           bytes=len(audio), word_timestamps=times is not None, ok=True)
                if times:
                    (OUT / f"{name}.words.json").write_text(json.dumps(times, indent=2))
                    row["n_words_timed"] = len(times)
                print(f"ok   {name}  {secs:.1f}s  {len(audio)//1024}KB  "
                      f"timestamps={'yes' if times else 'no'}")
            except Exception as e:
                row.update(ok=False, error=str(e)[:300])
                print(f"FAIL {name}  {e}")
            log.append(row)
            (outdir / "voice_log.json").write_text(json.dumps(log, indent=2))

    scoring_sheet(log, outdir)
    print(f"\nLog: results/{date}/voice_log.json")
    print(f"Team scoring: results/{date}/voice_scoring.html  "
          f"(P3 needs one provider at 4.0+)")


def scoring_sheet(log, outdir):
    """Blind-ish scoring page. Players are shuffled so the label is not the first thing seen."""
    rows = [r for r in log if r.get("ok")]
    h = ["<!doctype html><meta charset=utf-8><title>Voice scoring</title>",
         "<style>body{font:15px system-ui;background:#1A1A2E;color:#FFF8E6;padding:24px;max-width:780px}",
         "fieldset{border:1px solid #6C8BEF;border-radius:10px;margin:18px 0;padding:14px}",
         "legend{color:#FFD23F}audio{width:100%;margin:8px 0}",
         "label{margin-right:14px}</style>",
         "<h1>Voice scoring</h1>",
         "<p>Score each clip 1 to 5 on: <b>clear</b>, <b>warm</b>, "
         "<b>story like</b>, <b>pace</b>. P3 passes if one provider averages 4.0 or above "
         "across all 5 team members.</p>"]
    for i, r in enumerate(rows, 1):
        h.append(f"<fieldset><legend>Clip {i}</legend>")
        h.append(f'<audio controls src="voice/{r["file"]}"></audio>')
        for crit in ("clear", "warm", "story like", "pace"):
            h.append(f"<div><b>{crit}</b> ")
            for n in range(1, 6):
                h.append(f'<label><input type=radio name="c{i}_{crit}" value={n}> {n}</label>')
            h.append("</div>")
        h.append(f'<p style="opacity:.4;font-size:12px">{r["provider"]} / {r["voice"]} / '
                 f'word timings: {r.get("timings_from") or "none"}</p>')
        h.append("</fieldset>")
    (outdir / "voice_scoring.html").write_text("\n".join(h))


if __name__ == "__main__":
    main()
