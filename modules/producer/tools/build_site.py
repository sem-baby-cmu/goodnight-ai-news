"""Build site/, the page we send an illustrator.

It gathers what already exists (the character sheet, the two readers, the feed
cards), shrinks the images for the web, and writes an index around them. The
folder is tracked in git because Vercel deploys it from the repo.

    python3 package/build_reader.py --date <date>
    python3 package/build_reader.py --date <date> --age 8to10
    python3 package/build_carousel.py --date <date>
    python3 scene/sheet.py
    python3 tools/build_site.py --date <date>
"""
import argparse, pathlib, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scene"))
from PIL import Image  # noqa: E402
import pip as P  # noqa: E402

OUT = ROOT / "site"


def shrink(src, dst, box, quality):
    im = Image.open(src).convert("RGB")
    im.thumbnail(box, Image.LANCZOS)
    im.save(dst, quality=quality, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    a = ap.parse_args()
    res = ROOT / "results" / a.date
    missing = [p for p in (res / "read-5to7.html", res / "read-8to10.html",
                           ROOT / "docs" / "pip-sheet.png") if not p.exists()]
    if missing:
        sys.exit("build these first:\n  " + "\n  ".join(str(m) for m in missing))

    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "cards").mkdir(parents=True)

    for n in ("read-5to7.html", "read-8to10.html"):
        shutil.copy(res / n, OUT / n)
    shutil.copy(ROOT / "docs" / "pip-sheet.svg", OUT / "pip-sheet.svg")
    shrink(ROOT / "docs" / "pip-sheet.png", OUT / "pip-sheet.jpg", (1400, 1400), 88)

    cards = sorted((res / "5to7").glob("*.png"))
    for c in cards:
        shrink(c, OUT / "cards" / (c.stem + ".jpg"), (720, 900), 82)

    (OUT / "vercel.json").write_text(
        '{\n  "$schema": "https://openapi.vercel.sh/vercel.json",\n'
        '  "cleanUrls": true,\n'
        '  "headers": [\n'
        '    { "source": "/(.*)", "headers": '
        '[{ "key": "X-Robots-Tag", "value": "noindex" }] }\n  ]\n}\n', encoding="utf-8")

    tpl = (ROOT / "tools" / "site_index.html").read_text(encoding="utf-8")
    figs = "\n".join(
        f'      <figure><img src="cards/{c.stem}.jpg" alt="feed card {i}" '
        f'loading="lazy"><figcaption>{i} of {len(cards)}</figcaption></figure>'
        for i, c in enumerate(cards, 1))
    (OUT / "index.html").write_text(
        tpl.replace("{{CARDS}}", figs)
           .replace("{{POSES}}", str(len(P.POSES)))
           .replace("{{MOODS}}", str(len(P.MOOD)))
           .replace("{{DATE}}", a.date), encoding="utf-8")

    kb = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file()) / 1024
    print(f"site/  {len(list(OUT.rglob('*')))} files, {kb:.0f} KB")


if __name__ == "__main__":
    main()
