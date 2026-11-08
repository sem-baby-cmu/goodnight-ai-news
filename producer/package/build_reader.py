"""The web story: one file, reads either way up.

Readers arrive from Threads holding the phone upright, so portrait is the
primary layout, not a prompt to rotate. Turning the phone sideways switches to
a wide layout without reloading; it is one stylesheet, not two files.

Scenes are inline SVG and all pages mount once, so turning a page never re-runs
the paper-grain filter, which is the slow part on a phone.

    python package/build_reader.py --date 2026-11-07 --age 5to7
"""
import argparse, base64, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scene"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import card as C   # noqa: E402
import _story      # noqa: E402

TAP_PAGES = {2, 5, 8}


def audio(date, age, page, provider):
    for ext in ("mp3", "wav"):
        p = ROOT / "results" / date / "voice" / f"{age}-{page:02d}-{provider}.{ext}"
        if p.exists():
            mime = "audio/mpeg" if ext == "mp3" else "audio/wav"
            w = p.with_suffix(".words.json")
            return (f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}",
                    json.loads(w.read_text()) if w.exists() else None)
    return None, None


def main():
    ap = _story.add_args(argparse.ArgumentParser())
    ap.add_argument("--voice-provider", default="elevenlabs")
    ap.add_argument("--url", default="lullabyte.app/tonight")
    a = ap.parse_args()
    date, script, pages, outdir = _story.load(a)

    built, with_audio = [], 0
    for p in pages:
        uri, words = audio(date, a.age, p["page"], a.voice_provider)
        if uri:
            with_audio += 1
        built.append({"page": p["page"], "slot": p["slot"], "text": p["text"],
                      "svg": C.scene(p), "audio": uri, "words": words,
                      "tap": p["page"] in TAP_PAGES})

    html = (TEMPLATE.replace("__TITLE__", script["title"])
                    .replace("__DATE__", date)
                    .replace("__DATA__", json.dumps(built)))
    out = outdir / f"read-{a.age}.html"
    out.write_text(html)
    kb = out.stat().st_size / 1024
    print(f"built {out.relative_to(ROOT)}  {kb:.0f} KB")
    print(f"  {len(built)} pages, portrait first, rotates to landscape")
    print(f"  audio: {with_audio}/{len(built)}")


TEMPLATE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,
 user-scalable=no,viewport-fit=cover">
<title>__TITLE__</title>
<style>
*{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%;overflow:hidden;background:#0E0C22;color:#FFF4DE;
  font:16px/1.5 Grandstander,Fredoka,system-ui,sans-serif;user-select:none;
  touch-action:none}

#app{position:fixed;inset:0;display:flex;flex-direction:column;
  padding:env(safe-area-inset-top) env(safe-area-inset-right)
          env(safe-area-inset-bottom) env(safe-area-inset-left)}

/* Portrait: picture on top, words below. This is the layout a reader coming
   from a feed lands in, so it is the default rather than the exception. */
#art{position:relative;flex:0 0 56%;overflow:hidden}
#art svg{position:absolute;inset:0;width:100%;height:100%;opacity:0;
  transition:opacity .4s ease}
#art svg.on{opacity:1}
#art.tapped svg.on{animation:pop .5s ease}
@keyframes pop{30%{transform:scale(1.04)}100%{transform:scale(1)}}
#words{flex:1;display:flex;align-items:center;justify-content:center;
  padding:22px 7vw;min-height:0}
#line{text-align:center;font-size:clamp(20px,5.2vw,30px);font-weight:600}
#line .w{transition:color .1s}#line .on{color:#FFD23F}

/* Landscape: the picture fills the frame and the words sit over it. */
@media (orientation:landscape){
  #app{display:block}
  #art{position:absolute;inset:0;flex:none}
  #veil{position:absolute;inset:auto 0 0 0;height:34%;pointer-events:none;
    background:linear-gradient(transparent,rgba(14,12,34,.82) 55%,rgba(14,12,34,.94))}
  #words{position:absolute;left:0;right:0;bottom:52px;padding:0 7vw;display:block}
  #line{font-size:clamp(19px,4.4vh,30px);text-shadow:0 2px 12px rgba(0,0,0,.7)}
}
@media (orientation:portrait){#veil{display:none}}

#bar{position:absolute;left:0;right:0;bottom:calc(14px + env(safe-area-inset-bottom));
  display:flex;gap:6px;justify-content:center;pointer-events:none}
#bar i{width:7px;height:7px;border-radius:50%;background:#FFF4DE;opacity:.24;
  transition:opacity .3s,background .3s}
#bar i.now{opacity:1;background:#FFD23F}
.edge{position:absolute;top:0;bottom:0;width:24%;z-index:3}
#prev{left:0}#next{right:0}
#hint{position:absolute;left:0;right:0;bottom:42px;text-align:center;
  font-size:12px;color:#FFD23F;opacity:.85}
#end{position:absolute;inset:0;display:none;place-items:center;text-align:center;
  padding:30px;background:rgba(14,12,34,.94);z-index:5}
#end.show{display:grid}
#end a{display:inline-block;margin-top:16px;background:#4A6FE8;color:#FFF4DE;
  text-decoration:none;padding:15px 26px;border-radius:14px;font-weight:700}
</style></head><body>
<div id="app">
  <div id="art"><div id="veil"></div></div>
  <div id="words"><p id="line"></p></div>
  <div id="bar"></div>
  <div id="hint" hidden>tap the picture</div>
  <div class="edge" id="prev"></div>
  <div class="edge" id="next"></div>
</div>
<script>
const PAGES = __DATA__;
const art = document.getElementById('art'), wordsEl = document.getElementById('line');
const bar = document.getElementById('bar'), hint = document.getElementById('hint');
const veil = document.getElementById('veil');
let i = 0, audio = null, raf = 0;

PAGES.forEach(p => {
  art.insertAdjacentHTML('afterbegin', p.svg);
  bar.insertAdjacentHTML('beforeend', '<i></i>');
});
const svgs = [...art.querySelectorAll('svg')].reverse();

function show(n) {
  i = Math.max(0, Math.min(PAGES.length - 1, n));
  const p = PAGES[i];
  svgs.forEach((s, k) => s.classList.toggle('on', k === i));
  [...bar.children].forEach((d, k) => d.classList.toggle('now', k === i));
  hint.hidden = !p.tap;
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
art.addEventListener('click', e => {
  if (e.target.closest('.edge')) return;
  if (!PAGES[i].tap) return;
  art.classList.add('tapped');
  setTimeout(() => art.classList.remove('tapped'), 520);
});

let x0 = null, y0 = null;
document.addEventListener('touchstart', e => {
  x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
}, {passive: true});
document.addEventListener('touchend', e => {
  if (x0 === null) return;
  const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
  if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.4) show(i + (dx < 0 ? 1 : -1));
  x0 = y0 = null;
}, {passive: true});
addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') show(i + 1);
  if (e.key === 'ArrowLeft') show(i - 1);
});
show(0);
</script></body></html>
"""

if __name__ == "__main__":
    main()
