"""Carousel of story cards for Threads and Instagram.

Lullabyte ships one story a day, built from that day's news, so the date is the
primary key: everything is written under results/<date>/ and every file carries
the date in its name. The story title is a property of the day, not the folder.

Writes one 1080x1350 PNG per page, plus a swipeable HTML preview so the set can
be checked on a phone before anything is posted.

    python package/build_carousel.py --date 2026-11-07 --age 5to7
"""
import argparse, datetime as dt, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scene"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import card as C          # noqa: E402
from render import render  # noqa: E402
import _story             # noqa: E402

RES = ROOT / "results"


def main():
    ap = _story.add_args(argparse.ArgumentParser())
    ap.add_argument("--full", action="store_true",
                    help="all pages, ignoring carousel_slots")
    ap.add_argument("--url", default="lullabyte.app/tonight",
                    help="where the closing card sends people")
    ap.add_argument("--no-cta", action="store_true")
    a = ap.parse_args()
    date, script, pages, outdir = _story.load(a)

    # A feed card has to earn the next swipe, so the carousel is a cut of the
    # script, not the whole thing: character intros and pacing beats that work
    # in a nightly app read as filler in a feed.
    cut = script.get("carousel_slots")
    if cut and not a.full:
        pages = [p for p in pages if p["slot"] in cut]
        pages.sort(key=lambda p: cut.index(p["slot"]))
    out = outdir / a.age

    # After a cut the page numbers must be renumbered, or a card reads "9 / 6".
    # The closing card counts toward the total, so it is added before numbering.
    total = len(pages) + (0 if a.no_cta else 1)
    svgs = [C.card(p, total, n=i) for i, p in enumerate(pages, 1)]
    if not a.no_cta:
        svgs.append(C.cta_card(a.url, total, total))

    # Nothing may be silently dropped: every word has to reach the card.
    for p, svg in zip(pages, svgs):
        for w in p["text"].replace(".", "").replace(",", "").split():
            if w.replace("'", "’") not in svg:
                print(f"  WARNING page {p['page']}: {w!r} not on card")

    render([(f"lullabyte-{date}-{a.age}-{i:02d}", s)
            for i, s in enumerate(svgs, 1)],
           out, size=(C.W, C.H), at_seconds=0.6)

    html = (HTML.replace("__TITLE__", script["title"])
                .replace("__DATE__", date)
                .replace("__CARDS__", "\n".join(f"<section>{s}</section>" for s in svgs)))
    prev = outdir / f"{a.age}.html"
    prev.parent.mkdir(parents=True, exist_ok=True)
    prev.write_text(html)

    tot = sum(f.stat().st_size for f in out.glob("*.png")) / 1024 / 1024
    print(f"Lullabyte {date} \u00b7 {script['title']} \u00b7 ages {a.age}")
    print(f"{len(pages)} cards -> {out.relative_to(ROOT)}  ({tot:.1f} MB PNG)")
    print(f"preview -> {prev.relative_to(ROOT)}  ({prev.stat().st_size//1024} KB)")
    print(f"  {C.W}x{C.H} (4:5), the tallest a feed shows uncropped")
    print(f"  Pip: one component, {len(pages)} poses, 0 redraws")


HTML = r"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
*{box-sizing:border-box;margin:0}
body{background:#141E3C;font:15px system-ui,sans-serif;color:#FFF4DE;
  height:100dvh;display:flex;flex-direction:column;overflow:hidden}
h1{font-size:15px;font-weight:600;padding:12px 16px;opacity:.75;flex:none}
#strip{flex:1;display:flex;gap:14px;overflow-x:auto;overflow-y:hidden;
  scroll-snap-type:x mandatory;padding:0 16px 10px;align-items:center;
  -webkit-overflow-scrolling:touch}
section{flex:none;scroll-snap-align:center;width:min(84vw,calc((100dvh - 90px)*.8));
  aspect-ratio:4/5;border-radius:20px;overflow:hidden;box-shadow:0 10px 36px #0008}
section svg{display:block;width:100%;height:100%}
#dots{flex:none;display:flex;gap:6px;justify-content:center;padding:8px 0 16px}
#dots i{width:6px;height:6px;border-radius:50%;background:#FFF4DE;opacity:.25;
  transition:opacity .25s}
#dots i.on{opacity:1}
</style></head><body>
<h1>Lullabyte &middot; __DATE__ &middot; __TITLE__ &middot; swipe &rarr;</h1>
<div id="strip">__CARDS__</div>
<div id="dots"></div>
<script>
const strip = document.getElementById('strip'), dots = document.getElementById('dots');
const cards = [...strip.children];
cards.forEach(() => dots.insertAdjacentHTML('beforeend', '<i></i>'));
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) {
    const k = cards.indexOf(e.target);
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === k));
  }
}), {root: strip, threshold: .6});
cards.forEach(c => io.observe(c));
</script></body></html>
"""

if __name__ == "__main__":
    main()
