"""Lullabyte Studio: paste a script, get the storybook, compare Pip and voices.

A prototype for validation only. One WSGI app serves everything so a single
password check guards both the pages and the API:

    GET  /             login page, or the studio once logged in
    POST /login        checks SITE_PASSWORD, sets a signed cookie
    GET  /logout       clears it
    POST /api/scenes   script JSON in, scene and card SVGs for robot and owl out
    POST /api/voice    page texts and a voice in, mp3 and word timings out

Scenes come from the same Python as the producer pipeline (scene/card.py,
pip.py, owl.py), so the studio cannot drift from what the pipeline ships.

Env: SITE_PASSWORD, ELEVENLABS_API_KEY. Only ages 5 to 7 (script_5to7).
"""
import base64, hashlib, hmac, json, os, pathlib, re, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from http.cookies import SimpleCookie
from urllib.parse import parse_qs

HERE = pathlib.Path(__file__).resolve().parent

# In the repo the studio sits beside scene/ and imports it directly. Deployed on
# its own, it fetches the unchanged scene files from GitHub at a pinned commit,
# so the pictures match that commit exactly, and adds owl.py from lib/.
REPO = ("https://raw.githubusercontent.com/sem-baby-cmu/goodnight-ai-news/"
        "b9a93831e19442df87c82ead7e7510eb4df4ba30/producer/")
OLD_IMPORT = "from pip import pip, LOOP, POSES  # noqa: E402"
NEW_IMPORT = '''from pip import LOOP, POSES  # noqa: E402
import pip as _robot  # noqa: E402
import owl as _owl  # noqa: E402
CHARACTER = "robot"


def pip(*args, **kw):
    draw = _owl.owl if CHARACTER == "owl" else _robot.pip
    return draw(*args, **kw)'''


def _scene_path():
    local = HERE.parent.parent / "scene"
    if (local / "owl.py").exists():
        return local
    dst = pathlib.Path("/tmp/lb-scene")
    dst.mkdir(parents=True, exist_ok=True)
    for f in ("card", "pip", "parts", "world", "setting"):
        p = dst / f"{f}.py"
        if not p.exists():
            with urllib.request.urlopen(REPO + f"scene/{f}.py", timeout=20) as r:
                src = r.read().decode()
            if f == "card":
                assert OLD_IMPORT in src, "card.py changed upstream"
                src = src.replace(OLD_IMPORT, NEW_IMPORT)
            p.write_text(src)
    (dst / "owl.py").write_text((HERE.parent / "lib" / "owl.py").read_text())
    return dst


sys.path.insert(0, str(_scene_path()))
import card as C      # noqa: E402
import setting        # noqa: E402

WEB = HERE.parent / "web"
COOKIE = "lb_studio"
AGE_KEY = "script_5to7"
MAX_PAGES = 16

VOICES = {
    "george": "JBFqnCBsd6RMkjVDRZzb",  # Warm, Captivating Storyteller
    "sarah": "EXAVITQu4vr4xnSDxMaL",   # Mature, Reassuring, Confident
    "lily": "pFZP5JQG7iQjIQuC4Bku",    # Velvety Actress
}
MODEL = "eleven_turbo_v2_5"
CACHE = pathlib.Path("/tmp/lb-voice")  # best effort: lives as long as the instance

# Same as voice/synthesize.py: change how a word is said, never how it is shown.
SAY_AS = {"PRAISE": "Praise", "CMU": "C M U", "AI": "A I",
          "Russinovich": "Russinovitch"}


# ---------- auth ----------

def _token():
    pw = os.environ.get("SITE_PASSWORD", "")
    return hmac.new(pw.encode(), b"lullabyte-studio", hashlib.sha256).hexdigest()


def _authed(environ):
    if not os.environ.get("SITE_PASSWORD"):
        return False  # fail closed: no password set means nobody gets in
    c = SimpleCookie(environ.get("HTTP_COOKIE", ""))
    return COOKIE in c and hmac.compare_digest(c[COOKIE].value, _token())


# ---------- scenes ----------

def _pages(script):
    if not isinstance(script, dict) or not isinstance(script.get(AGE_KEY), list):
        raise ValueError(f'The script needs a "{AGE_KEY}" list of pages.')
    pages = script[AGE_KEY][:MAX_PAGES]
    for i, p in enumerate(pages, 1):
        if not isinstance(p, dict) or not str(p.get("text", "")).strip():
            raise ValueError(f"Page {i} needs some text.")
        p.setdefault("page", i)
        p.setdefault("slot", "")
        p.setdefault("tone", "calm")
    # Same rule as package/_story.py: fill in any page with no setting.
    for page, guess in zip(pages, setting.infer(pages)):
        page.setdefault("setting", guess)
    return pages


def scenes(script):
    pages = _pages(script)
    out = []
    for p in pages:
        row = {"page": p["page"], "text": p["text"], "tone": p["tone"]}
        for ch in ("robot", "owl"):
            C.CHARACTER = ch
            row[ch] = {"scene": C.scene(p), "card": C.card(p, len(pages))}
        out.append(row)
    return {"title": script.get("title", "Untitled story"), "pages": out}


# ---------- voice ----------

def spoken(text):
    for k, v in SAY_AS.items():
        text = re.sub(rf"(?<![A-Za-z0-9_]){re.escape(k)}(?![A-Za-z0-9_])", v, text)
    return text


def _word_times(chars, starts, ends):
    words, cur, t0, prev = [], "", None, 0
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if cur:
                words.append((round(t0, 3), round(prev, 3)))
                cur, t0 = "", None
        else:
            if not cur:
                t0 = s
            cur += ch
            prev = e
    if cur:
        words.append((round(t0, 3), round(prev, 3)))
    return words


def _per_shown_word(text, times):
    """Timings for the words on the page. "CMU" is said as three words, so the
    spoken timings are folded back onto the word the reader sees."""
    out, i = [], 0
    for w in text.split():
        n = max(1, len(spoken(w).split()))
        span = times[i:i + n]
        out.append([span[0][0], span[-1][1]] if span else None)
        i += n
    return out


def _tts(text, voice_id):
    key = os.environ["ELEVENLABS_API_KEY"]
    say = spoken(text)
    h = hashlib.sha256(f"{voice_id}|{MODEL}|{say}".encode()).hexdigest()
    hit = CACHE / f"{h}.json"
    if hit.exists():
        return json.loads(hit.read_text())
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps",
        data=json.dumps({"text": say, "model_id": MODEL}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)
    a = d["alignment"]
    times = _word_times(a["characters"], a["character_start_times_seconds"],
                        a["character_end_times_seconds"])
    res = {"audio": d["audio_base64"], "words": _per_shown_word(text, times)}
    CACHE.mkdir(parents=True, exist_ok=True)
    hit.write_text(json.dumps(res))
    return res


def voice(body):
    v = body.get("voice")
    if v not in VOICES:
        raise ValueError(f"voice must be one of {', '.join(VOICES)}")
    texts = [str(t) for t in body.get("texts", [])][:MAX_PAGES]
    if not texts or sum(len(t) for t in texts) > 6000:
        raise ValueError("Send 1 to 16 page texts, 6000 characters at most.")
    with ThreadPoolExecutor(5) as ex:
        clips = list(ex.map(lambda t: _tts(t, VOICES[v]), texts))
    return {"voice": v, "clips": clips}


# ---------- http ----------

def _send(start, status, body, ctype="text/html; charset=utf-8", headers=()):
    data = body if isinstance(body, bytes) else body.encode()
    start(status, [("Content-Type", ctype), ("Cache-Control", "no-store"),
                   ("X-Robots-Tag", "noindex"), *headers])
    return [data]


def _json(start, status, obj):
    return _send(start, status, json.dumps(obj), "application/json")


def _body(environ):
    n = int(environ.get("CONTENT_LENGTH") or 0)
    if n > 2_000_000:
        raise ValueError("Request too large.")
    return environ["wsgi.input"].read(n) if n else b""


def app(environ, start):
    path = environ.get("PATH_INFO", "/")
    method = environ.get("REQUEST_METHOD", "GET")
    try:
        if path == "/login" and method == "POST":
            pw = parse_qs(_body(environ).decode()).get("password", [""])[0]
            real = os.environ.get("SITE_PASSWORD", "")
            if real and hmac.compare_digest(pw.encode(), real.encode()):
                ck = (f"{COOKIE}={_token()}; Path=/; HttpOnly; Secure; "
                      f"SameSite=Lax; Max-Age={30 * 86400}")
                return _send(start, "303 See Other", "", headers=[("Location", "/"),
                                                                ("Set-Cookie", ck)])
            return _send(start, "303 See Other", "", headers=[("Location", "/?wrong=1")])
        if path == "/logout":
            ck = f"{COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
            return _send(start, "303 See Other", "", headers=[("Location", "/"),
                                                            ("Set-Cookie", ck)])

        if not _authed(environ):
            if path.startswith("/api/"):
                return _json(start, "401 Unauthorized", {"error": "Please log in."})
            return _send(start, "200 OK", (WEB / "login.html").read_text())

        if path == "/api/scenes" and method == "POST":
            return _json(start, "200 OK", scenes(json.loads(_body(environ))))
        if path == "/api/voice" and method == "POST":
            return _json(start, "200 OK", voice(json.loads(_body(environ))))
        if path in ("/", "/index.html"):
            return _send(start, "200 OK", (WEB / "studio.html").read_text())
        if path == "/sample.json":
            with urllib.request.urlopen(REPO + "input/2026-11-07.json", timeout=20) as r:
                return _send(start, "200 OK", r.read(), "application/json")
        return _send(start, "404 Not Found", "Not found")
    except (ValueError, json.JSONDecodeError) as e:
        return _json(start, "400 Bad Request", {"error": str(e)})
    except urllib.error.HTTPError as e:
        msg = e.read()[:300].decode(errors="replace")
        return _json(start, "502 Bad Gateway", {"error": f"ElevenLabs said: {msg}"})
    except KeyError as e:
        return _json(start, "500 Internal Server Error",
                     {"error": f"Missing setting on the server: {e}"})
