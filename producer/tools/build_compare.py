"""A page for the team to pick Pip and a voice.

Open issue S2 asks whether Pip is a robot or a robot owl, and the voice test
asks which narrator reads best. This builds one reader per pairing and an index
that sets them side by side, so the choice is made by reading, not by
describing.

    python tools/build_compare.py --date 2026-11-07 --age 5to7

Needs the voice clips from voice/synthesize.py --voice <name> first.
"""
import argparse, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scene"))
sys.path.insert(0, str(ROOT / "package"))
import card as C   # noqa: E402
import _story      # noqa: E402

CHARACTERS = [("robot", "Robot", "pip-sheet"), ("owl", "Robot owl", "owl-sheet")]
VOICES = [("george", "George", "warm storyteller, male"),
          ("sarah", "Sarah", "mature, reassuring, female"),
          ("lily", "Lily", "velvety, female")]


def main():
    ap = _story.add_args(argparse.ArgumentParser())
    a = ap.parse_args()
    date, script, pages, outdir = _story.load(a)

    for ch, _, _ in CHARACTERS:
        for v, _, _ in VOICES:
            subprocess.run([sys.executable, str(ROOT / "package" / "build_reader.py"),
                            "--date", date, "--age", a.age, "--character", ch,
                            "--voice-provider", f"elevenlabs-{v}"], check=True)

    rows = []
    for ch, label, sheet in CHARACTERS:
        C.CHARACTER = ch
        thumb = C.scene(pages[0])
        cells = "".join(
            f'<a class="cell" href="read-{a.age}-{ch}-elevenlabs-{v}.html">'
            f'<div class="art">{thumb}</div>'
            f'<b>{label} + {name}</b><span>{desc}</span></a>'
            for v, name, desc in VOICES)
        rows.append(
            f'<section><h2>{label}</h2>'
            f'<img class="sheet" src="../../docs/{sheet}.png" alt="{label} character sheet">'
            f'<div class="grid">{cells}</div></section>')

    html = (PAGE.replace("__TITLE__", script["title"]).replace("__DATE__", date)
                .replace("__AGE__", a.age).replace("__ROWS__", "".join(rows)))
    out = outdir / f"compare-{a.age}.html"
    out.write_text(html)
    print(f"built {out.relative_to(ROOT)}  6 versions")


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pick Pip and a voice</title>
<style>
body{margin:0;background:#0E0C22;color:#FFF4DE;
  font:16px/1.5 Grandstander,Fredoka,system-ui,sans-serif}
main{max-width:1100px;margin:auto;padding:32px 20px 64px}
h1{margin:0 0 4px}p.sub{margin:0 0 28px;color:#B9B3D6}
h2{margin:36px 0 12px}
.sheet{width:100%;border-radius:16px;display:block;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.cell{display:block;background:#1A1A2E;border-radius:16px;overflow:hidden;
  color:inherit;text-decoration:none;padding-bottom:14px}
.cell:hover{outline:3px solid #FFD23F}
.art{aspect-ratio:4/5;overflow:hidden}.art svg{width:100%;height:100%;display:block}
.cell b{display:block;padding:12px 14px 0;font-size:18px}
.cell span{display:block;padding:0 14px;color:#B9B3D6;font-size:14px}
</style></head><body><main>
<h1>Pick Pip and a voice</h1>
<p class="sub">__TITLE__ · __DATE__ · ages __AGE__. Open each version, read a
few pages with sound on, then vote for one character and one voice.</p>
__ROWS__
</main></body></html>"""


if __name__ == "__main__":
    main()
