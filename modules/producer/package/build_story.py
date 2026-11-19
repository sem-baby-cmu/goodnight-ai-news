"""P5, P6, P7: packaging test.

Builds one self-contained HTML story file from a script, the generated images
and the narration. Everything is inlined, so the result is one file that opens
on a phone with no server.

Runs with or without real assets: pages with no image get a placeholder, pages
with no audio fall back to tap-to-advance. That lets the packaging and sync
logic be tested before the API keys are in place.

    python package/build_story.py --date 2026-11-07 --age 5to7
"""
import argparse, base64, json, mimetypes, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / "results"

# Idea 22: one tap interaction every 2 to 3 pages.
TAP_PAGES = {2, 5, 8}

PLACEHOLDER = """<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
<rect width="400" height="400" fill="#121A33"/>
<circle cx="200" cy="185" r="78" fill="#6C8BEF"/>
<ellipse cx="200" cy="215" rx="46" ry="52" fill="#FFF8E6"/>
<circle cx="174" cy="170" r="21" fill="#FFD23F"/><circle cx="226" cy="170" r="21" fill="#FFD23F"/>
<path d="M186 196 L200 210 L214 196 Z" fill="#F7A23B"/>
<line x1="200" y1="107" x2="200" y2="82" stroke="#6C8BEF" stroke-width="7"/>
<circle cx="200" cy="76" r="9" fill="#FFD23F"/>
<text x="200" y="330" fill="#6C8BEF" font-family="system-ui" font-size="17"
 text-anchor="middle">placeholder</text></svg>"""


def data_uri(path):
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def find_image(age, page, provider, version):
    p = RES / "images" / f"{age}_p{page:02d}_{provider}_{version}.png"
    return p if p.exists() else None


def find_audio(age, page, provider):
    for ext in ("mp3", "wav"):
        p = RES / "voice" / f"{age}_p{page:02d}_{provider}.{ext}"
        if p.exists():
            w = RES / "voice" / f"{age}_p{page:02d}_{provider}.words.json"
            return p, (json.loads(w.read_text()) if w.exists() else None)
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--age", default="5to7", choices=["5to7", "8to10"])
    ap.add_argument("--image-provider", default="openai")
    ap.add_argument("--image-version", default="v3")
    ap.add_argument("--voice-provider", default="elevenlabs")
    a = ap.parse_args()

    script = json.loads((ROOT / a.script).read_text())
    pages = script[f"script_{a.age}"]

    built, missing_img, missing_audio, timed = [], 0, 0, 0
    for p in pages:
        img = find_image(a.age, p["page"], a.image_provider, a.image_version)
        aud, words = find_audio(a.age, p["page"], a.voice_provider)
        if not img:
            missing_img += 1
        if not aud:
            missing_audio += 1
        if words:
            timed += 1
        built.append({
            "page": p["page"], "slot": p["slot"], "tone": p["tone"],
            "text": p["text"], "tags": p["tags"],
            "img": data_uri(img) if img else None,
            "audio": data_uri(aud) if aud else None,
            "words": words,
            "tap": p["page"] in TAP_PAGES,
        })

    html = TEMPLATE.replace("__TITLE__", script["title"]) \
                   .replace("__AGE__", a.age.replace("to", " to ")) \
                   .replace("__DATA__", json.dumps(built))
    out = RES / f"story_{a.age}.html"
    out.write_text(html)
    kb = out.stat().st_size / 1024

    print(f"built {out.relative_to(ROOT)}  {kb:.0f} KB")
    print(f"  pages: {len(built)}")
    print(f"  images: {len(built)-missing_img}/{len(built)}"
          f"{'  (placeholders used)' if missing_img else ''}")
    print(f"  audio: {len(built)-missing_audio}/{len(built)}"
          f"{'  (tap to advance)' if missing_audio else ''}")
    print(f"  word timestamps: {timed}/{len(built)}"
          f"{'  (sentence highlight fallback)' if timed < len(built) else ''}")
    print(f"\nP7 size target: under 5 MB per story. "
          f"{'PASS' if kb < 5120 else 'FAIL'} ({kb:.0f} KB)")


TEMPLATE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>__TITLE__</title>
<style>
*{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent}
body{background:#1A1A2E;color:#FFF8E6;font:17px/1.6 system-ui,sans-serif;
 height:100dvh;display:flex;flex-direction:column;overflow:hidden;user-select:none}
#art{flex:1;display:grid;place-items:center;padding:14px;min-height:0;position:relative}
#art img,#art svg{max-width:100%;max-height:100%;border-radius:18px;
 transition:transform .35s ease,filter .35s ease}
#art.tapped img,#art.tapped svg{transform:scale(1.04) rotate(-1deg);filter:brightness(1.12)}
#hint{position:absolute;bottom:10px;font-size:12px;color:#FFD23F;opacity:.75}
#text{padding:18px 22px 10px;min-height:28vh;font-size:19px}
#text .w{transition:color .12s}
#text .on{color:#FFD23F}
#bar{display:flex;align-items:center;gap:14px;padding:12px 20px 26px}
button{background:#6C8BEF;color:#FFF8E6;border:0;border-radius:999px;
 padding:11px 22px;font:inherit;font-size:16px}
button:disabled{opacity:.3}
#dots{flex:1;display:flex;gap:5px;justify-content:center}
#dots i{width:7px;height:7px;border-radius:50%;background:#FFF8E6;opacity:.25}
#dots i.now{opacity:1;background:#FFD23F}
#slot{font-size:11px;letter-spacing:.09em;text-transform:uppercase;opacity:.4}
</style></head><body>
<div id="art"><div id="hint" hidden>tap the picture</div></div>
<div id="slot"></div>
<div id="text"></div>
<div id="bar">
  <button id="prev">Back</button>
  <div id="dots"></div>
  <button id="next">Next</button>
</div>
<script>
const PAGES = __DATA__;
const PLACEHOLDER = `""" + PLACEHOLDER.replace("\n", "") + r"""`;
let i = 0, audio = null, raf = 0;

const art = document.getElementById('art'), hint = document.getElementById('hint');
const textEl = document.getElementById('text'), slotEl = document.getElementById('slot');
const dots = document.getElementById('dots');

PAGES.forEach(() => dots.insertAdjacentHTML('beforeend', '<i></i>'));

function render(n) {
  i = Math.max(0, Math.min(PAGES.length - 1, n));
  const p = PAGES[i];
  if (audio) { audio.pause(); audio = null; }
  cancelAnimationFrame(raf);

  art.className = '';
  art.innerHTML = (p.img ? `<img src="${p.img}" alt="">` : PLACEHOLDER);
  art.appendChild(hint);
  hint.hidden = !p.tap;

  slotEl.textContent = p.slot.replace(/_/g, ' ') + ' · ' + p.tone;

  // Word spans so narration can highlight. Falls back to plain text.
  textEl.innerHTML = p.text.split(/(\s+)/).map(t =>
    t.trim() ? `<span class="w">${t}</span>` : t).join('');

  document.querySelectorAll('#dots i').forEach((d, k) =>
    d.classList.toggle('now', k === i));
  document.getElementById('prev').disabled = i === 0;
  document.getElementById('next').disabled = i === PAGES.length - 1;

  if (p.audio) {
    audio = new Audio(p.audio);
    audio.play().catch(() => {});       // iOS needs a gesture; silent is fine
    if (p.words) highlight(p.words);
  }
}

function highlight(words) {
  const spans = [...textEl.querySelectorAll('.w')];
  const step = () => {
    if (!audio) return;
    const t = audio.currentTime;
    spans.forEach((s, k) => {
      const w = words[k];
      s.classList.toggle('on', !!w && t >= w.start && t <= w.end);
    });
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

art.addEventListener('click', () => {
  if (!PAGES[i].tap) return;
  art.classList.add('tapped');
  setTimeout(() => art.classList.remove('tapped'), 380);
});
document.getElementById('next').onclick = () => render(i + 1);
document.getElementById('prev').onclick = () => render(i - 1);
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') render(i + 1);
  if (e.key === 'ArrowLeft') render(i - 1);
});
render(0);
</script></body></html>
"""

if __name__ == "__main__":
    main()
