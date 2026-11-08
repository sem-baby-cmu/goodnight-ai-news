"""Character sheet: every pose and every mood on one page.

This is the artifact that stands in for a hand drawn character sheet. The
difference is that it is generated from the same component the stories use, so
it cannot drift from what ships. If a pose looks wrong here, it is wrong on
every page of every story.
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from pip import pip, POSES, MOOD  # noqa: E402
import parts  # noqa: E402

PAPER, INK, SUB = "#FFF4DE", "#101A33", "#6B7399"
FONT = "Grandstander, Fredoka, Nunito, sans-serif"
CELL, GAP, PAD = 300, 18, 56


def _cell(x, y, label, pose, mood, scale=0.46):
    return f'''<g>
<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" rx="22" fill="#ffffff"
      stroke="#E4DCC4" stroke-width="2"/>
{pip(x + CELL // 2, y + CELL - 74, scale, mood, pose)}
<text x="{x + CELL // 2}" y="{y + CELL - 20}" text-anchor="middle"
      font-family="{FONT}" font-size="21" fill="{SUB}"
      style="font-variation-settings:'wght' 600">{label}</text>
</g>'''


def sheet():
    cols = 5
    rows = -(-len(POSES) // cols)
    moods = list(MOOD)
    w = PAD * 2 + cols * CELL + (cols - 1) * GAP
    top = PAD + 214
    pose_h = rows * CELL + (rows - 1) * GAP
    mood_y = top + pose_h + 104
    h = mood_y + 58 + CELL + PAD

    out = []
    for i, p in enumerate(POSES):
        x = PAD + (i % cols) * (CELL + GAP)
        y = top + (i // cols) * (CELL + GAP)
        out.append(_cell(x, y, p, p, "calm"))
    for i, m in enumerate(moods):
        x = PAD + i * (CELL + GAP)
        out.append(_cell(x, mood_y + 58, m, "stand", m))

    def head(y, t, s):
        return (f'<text x="{PAD}" y="{y}" font-family="{FONT}" font-size="30" '
                f'fill="{INK}" style="font-variation-settings:\'wght\' 700">{t}</text>'
                f'<text x="{PAD}" y="{y + 32}" font-family="{FONT}" font-size="21" '
                f'fill="{SUB}">{s}</text>')

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"
     viewBox="0 0 {w} {h}">
<defs>{parts.PAINT_FILTER}</defs>
<rect width="{w}" height="{h}" fill="{PAPER}"/>
<text x="{PAD}" y="{PAD + 44}" font-family="{FONT}" font-size="52" fill="{INK}"
      style="font-variation-settings:'wght' 700">Pip</text>
<text x="{PAD}" y="{PAD + 80}" font-family="{FONT}" font-size="23" fill="{SUB}">
One component. {len(POSES)} poses and {len(moods)} moods, drawn as vectors.</text>
{head(top - 60, "Poses", "The story beat of each page picks one.")}
{head(mood_y, "Moods", "The tone of each page sets the antenna, the glow, and the eyes.")}
{"".join(out)}
</svg>'''


if __name__ == "__main__":
    import render
    out = pathlib.Path("results/character-sheet")
    out.mkdir(parents=True, exist_ok=True)
    svg = sheet()
    (out / "pip-sheet.svg").write_text(svg, encoding="utf-8")
    import re
    w = int(re.search(r'width="(\d+)"', svg).group(1))
    h = int(re.search(r'height="(\d+)"', svg).group(1))
    render.render([("pip-sheet", svg)], out, size=(w, h))
    print(f"character sheet -> {out}  ({w}x{h})")
    print(f"  {len(POSES)} poses, {len(MOOD)} moods")
