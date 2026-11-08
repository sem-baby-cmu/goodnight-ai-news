"""P3, P4: narration test.

Runs one script through several TTS providers, saves the audio, and records
which providers return word-level timestamps (needed for word highlighting).

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


def load_env():
    """Read producer/.env so the key does not have to be exported by hand."""
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))


load_env()

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


# Words a reader says differently from how they are spelled. Acronyms are the
# risk: a program called PRAISE is a word, but all caps makes most engines
# spell it out, and CMU is meant to be spelled out. Applied to the audio only.
# The written text on the page is never changed.
SAY_AS = {
    "PRAISE": "Praise",
    "CMU": "C M U",
    "AI": "A I",
    "Russinovich": "Russinovitch",
}


def spoken(text):
    import re
    for k, v in SAY_AS.items():
        text = re.sub(rf"\b{re.escape(k)}\b", v, text)
    return text


PROVIDERS = {"openai": say_openai, "elevenlabs": say_elevenlabs, "gemini": say_gemini}


def main():
    ap = argparse.ArgumentParser()
    _story.add_args(ap)
    # One key is the useful minimum: ElevenLabs answers P3 and, through forced
    # alignment, P4 for any provider's audio. Add others only if its voice
    # fails the listen.
    ap.add_argument("--providers", default="elevenlabs",
                    help="comma separated. e.g. elevenlabs,openai,gemini")
    ap.add_argument("--align", action="store_true",
                    help="For providers with no timings of their own, get them "
                         "by forced alignment. Needs ELEVENLABS_API_KEY.")
    ap.add_argument("--one-file", action="store_true",
                    help="One clip for the whole story. The default is one clip "
                         "per page, which is what the reader plays.")
    a = ap.parse_args()

    date, script, pages, outdir = _story.load(a)
    OUT = outdir / "voice"
    OUT.mkdir(parents=True, exist_ok=True)

    chunks = ([(0, "  ".join(p["text"] for p in pages))] if a.one_file
              else [(p["page"], p["text"]) for p in pages])

    log = []
    for prov in a.providers.split(","):
        fn, voice = PROVIDERS[prov], VOICES[prov]
        for pg, text in chunks:
            # Must match package/build_reader.py's audio() lookup.
            name = f"{a.age}-{pg:02d}-{prov}" if pg else f"{a.age}-full-{prov}"
            row = {"provider": prov, "voice": voice, "age": a.age,
                   "page": pg, "words": len(text.split())}
            try:
                audio, ext, times, secs = fn(spoken(text), voice)
                row["timings_from"] = "tts" if times else None
                if times is None and a.align:
                    times = align(audio, ext, spoken(text))
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

    print(f"\nClips: results/{date}/voice/   named <age>-<page>-<provider>.mp3,"
          f" so the same page from each provider sits next to itself")
    print(f"Log:   results/{date}/voice_log.json   cost, seconds and where the"
          f" word timings came from")


if __name__ == "__main__":
    main()
