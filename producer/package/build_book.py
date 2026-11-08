"""Landscape flipbook for phones.

One self-contained HTML file. The phone is held sideways, pages turn by swiping
left and right. Scenes are inline SVG, not images, so they stay sharp, keep
animating, and the whole book is a few hundred KB instead of tens of MB.

Pip is the same scene/parts.pip() component on every page. Only his position,
scale and mood change, which is what makes P2 hold by construction.

    python package/build_book.py --date 2026-11-07 --age 5to7
"""
import argparse, base64, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scene"))
import parts  # noqa: E402

RES = ROOT / "results"
TAP_PAGES = {2, 5, 8}          # idea 22: one interactive moment every 2 to 3 pages


def audio_uri(age, page, provider):
    for ext in ("mp3", "wav"):
        p = RES / "voice" / f"{age}_p{page:02d}_{provider}.{ext}"
        if p.exists():
            mime = "audio/mpeg" if ext == "mp3" else "audio/wav"
            w = RES / "voice" / f"{age}_p{page:02d}_{provider}.words.json"
            return (f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}",
                    json.loads(w.read_text()) if w.exists() else None)
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--age", default="5to7", choices=["5to7", "8to10"])
    ap.add_argument("--voice-provider", default="elevenlabs")
    a = ap.parse_args()

    script = json.loads((ROOT / a.script).read_text())
    pages = script[f"script_{a.age}"]

    built, with_audio = [], 0
    for p in pages:
        uri, words = audio_uri(a.age, p["page"], a.voice_provider)
        if uri:
            with_audio += 1
        built.append({
            "page": p["page"], "slot": p["slot"], "tone": p["tone"],
            "text": p["text"], "tags": p["tags"],
            "svg": parts.page_scene(p),
            "audio": uri, "words": words,
            "tap": p["page"] in TAP_PAGES,
        })

    html = (TEMPLATE
            .replace("__TITLE__", script["title"])
            .replace("__AGE__", a.age.replace("to", "–"))
            .replace("__DATA__", json.dumps(built)))
    out = RES / f"book_{a.age}.html"
    out.write_text(html)
    kb = out.stat().st_size / 1024

    print(f"built {out.relative_to(ROOT)}  {kb:.0f} KB")
    print(f"  {len(built)} pages, landscape, swipe to turn")
    print(f"  audio: {with_audio}/{len(built)}"
          f"{'  (tap to advance)' if with_audio == 0 else ''}")
    print(f"  Pip: one component, {len(built)} placements, 0 redraws")
    print(f"\nP7 size target under 5 MB: {'PASS' if kb < 5120 else 'FAIL'} ({kb:.0f} KB)")


TEMPLATE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>__TITLE__</title>
<style>
*{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%;overflow:hidden;background:#0E0C22;
  font:16px/1.55 system-ui,-apple-system,sans-serif;color:#FFF8E6;
  user-select:none;touch-action:none}
#rotate{position:fixed;inset:0;display:none;place-items:center;text-align:center;
  padding:30px;background:#0E0C22;z-index:9}
#rotate .ph{width:58px;height:96px;border:3px solid #6C8BEF;border-radius:12px;
  margin:0 auto 20px;animation:tip 2.4s ease-in-out infinite}
@keyframes tip{0%,40%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
@media (orientation:portrait) and (max-width:900px){#rotate{display:grid}#book{display:none}}
#book{position:fixed;inset:0;display:flex;flex-direction:column}
#stage{position:relative;flex:1;min-height:0;overflow:hidden}
#stage svg{position:absolute;inset:0;width:100%;height:100%;
  opacity:0;transition:opacity .45s ease}
#stage svg.on{opacity:1}
#stage.tapped svg.on{animation:pop .5s ease}
@keyframes pop{30%{transform:scale(1.035)}100%{transform:scale(1)}}
#veil{position:absolute;inset:auto 0 0 0;height:46%;pointer-events:none;
  background:linear-gradient(transparent,rgba(14,12,34,.82) 55%,rgba(14,12,34,.95))}
#words{position:absolute;left:0;right:0;bottom:62px;padding:0 7vw;text-align:center;
  font-size:clamp(17px,2.9vh,26px);font-weight:600;text-shadow:0 2px 10px rgba(0,0,0,.6)}
#words .w{transition:color .1s}#words .on{color:#FFD23F}
#slot{position:absolute;top:14px;left:0;right:0;text-align:center;font-size:11px;
  letter-spacing:.16em;text-transform:uppercase;color:#6C8BEF}
#hint{position:absolute;bottom:14px;left:0;right:0;text-align:center;
  font-size:11px;color:#FFD23F;opacity:.8}
#dots{position:absolute;bottom:22px;left:0;right:0;display:flex;gap:6px;
  justify-content:center;pointer-events:none}
#dots i{width:6px;height:6px;border-radius:50%;background:#FFF8E6;opacity:.22;
  transition:opacity .3s,background .3s}
#dots i.now{opacity:1;background:#FFD23F}
.edge{position:absolute;top:0;bottom:0;width:22%;z-index:3}
#prev{left:0}#next{right:0}
</style></head><body>

<div id="rotate"><div class="ph"></div>
  <p><b>Turn your phone sideways</b><br><span style="opacity:.6">__TITLE__</span></p></div>

<div id="book">
  <div id="stage">
    <div id="veil"></div>
    <div id="slot"></div>
    <div id="words"></div>
    <div id="hint" hidden>tap the picture</div>
    <div id="dots"></div>
    <div class="edge" id="prev"></div>
    <div class="edge" id="next"></div>
  </div>
</div>

<script>
const PAGES = __DATA__;
const stage = document.getElementById('stage'), wordsEl = document.getElementById('words');
const slotEl = document.getElementById('slot'), hint = document.getElementById('hint');
const dots = document.getElementById('dots');
let i = 0, audio = null, raf = 0;

// All scenes are mounted once and cross-faded, so turning a page never re-renders
// the SVG filter (which is the slow part on a phone).
PAGES.forEach((p, k) => {
  stage.insertAdjacentHTML('afterbegin', p.svg);
  dots.insertAdjacentHTML('beforeend', '<i></i>');
});
const svgs = [...stage.querySelectorAll('svg')].reverse();

function show(n) {
  n = Math.max(0, Math.min(PAGES.length - 1, n));
  if (n === i && audio) return;
  i = n;
  const p = PAGES[i];

  svgs.forEach((s, k) => s.classList.toggle('on', k === i));
  slotEl.textContent = p.slot.replace(/_/g, ' ');
  hint.hidden = !p.tap;
  [...dots.children].forEach((d, k) => d.classList.toggle('now', k === i));

  wordsEl.innerHTML = p.text.split(/(\s+)/).map(t =>
    t.trim() ? `<span class="w">${t}</span>` : t).join('');

  if (audio) { audio.pause(); audio = null; }
  cancelAnimationFrame(raf);
  if (p.audio) {
    audio = new Audio(p.audio);
    audio.play().catch(() => {});
    if (p.words) track(p.words);
  }
}

function track(words) {
  const spans = [...wordsEl.querySelectorAll('.w')];
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

document.getElementById('next').onclick = () => show(i + 1);
document.getElementById('prev').onclick = () => show(i - 1);

// Swipe. Horizontal only, so a vertical drag does not turn a page by accident.
let x0 = null, y0 = null;
stage.addEventListener('touchstart', e => {
  x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
}, {passive: true});
stage.addEventListener('touchend', e => {
  if (x0 === null) return;
  const dx = e.changedTouches[0].clientX - x0;
  const dy = e.changedTouches[0].clientY - y0;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) show(i + (dx < 0 ? 1 : -1));
  else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && PAGES[i].tap) pop();
  x0 = y0 = null;
}, {passive: true});

function pop() {
  stage.classList.add('tapped');
  setTimeout(() => stage.classList.remove('tapped'), 520);
}
stage.addEventListener('click', e => {
  if (e.target.closest('.edge')) return;
  if (PAGES[i].tap) pop();
});
addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') show(i + 1);
  if (e.key === 'ArrowLeft') show(i - 1);
});
show(0);
</script></body></html>
"""

if __name__ == "__main__":
    main()
