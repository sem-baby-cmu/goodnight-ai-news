"""Story cards: a full scene per page, caption burned in at the top.

Earlier versions put Pip on a plain halo. That read as clean but empty. The
prototype's story pages are scenes, so each card is now a scene too: gradient
sky, stars, moon, skyline, ground, plus a prop set chosen by the story beat.

The caption sits on a darkened band so it stays readable over any sky.
4:5 (1080x1350) is the tallest ratio a feed shows uncropped.
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from pip import pip, LOOP, POSES  # noqa: E402
import parts  # noqa: E402

W, H = 1080, 1350
# Shantell Sans: a handwritten face drawn for legibility rather than flourish.
# BNCE (bounce) is dialled down from its default so letters sit on a steadier
# baseline; a lively bounce costs reading speed at small sizes.
FONT = "Shantell Sans, Fredoka, Comic Neue, sans-serif"
FONT_VAR = "font-variation-settings:'wght' 700,'BNCE' -20,'INFM' 30,'SPAC' 0"
SHOW_TAGS = False
GROUND_Y = 1062          # horizon
PAPER, INK, GLOW, SOFT = "#FFF4DE", "#101A33", "#FFD23F", "#A8B0D6"

SKIES = {
    "warm":    ("#241C4A", "#6A3E6E", "#C9705E"),
    "calm":    ("#141230", "#241C4A", "#3C2F63"),
    "curious": ("#17173A", "#2E2A62", "#4F4385"),
    "quiet":   ("#0C0A1E", "#17152C", "#231C42"),
    "excited": ("#2A1F52", "#6A3E6E", "#E0894B"),
}
GROUND = {"warm": "#5A3560", "calm": "#1E1944", "curious": "#2A2458",
          "quiet": "#13102A", "excited": "#653F60"}
# silhouettes sit well below the sky so they read as shapes, not haze
SIL = {"warm": "#2E1C40", "calm": "#0E0B22", "curious": "#15123A",
       "quiet": "#08061A", "excited": "#2A1838"}

# story beat -> (pose, prop set)
BEAT = {
    "cover":            ("wave",  "town"),
    "character":        ("read",  "roof"),
    "news_discovery":   ("point", "lit_towers"),
    "exploration":      ("peek",  "window"),
    "challenge":        ("lost",  "tools"),
    "turning_point":    ("stand", "town"),
    "resolution":       ("cheer", "town"),
    "reflection":       ("sleep", "bedroom"),
    "real_world_facts": ("point", "plain"),
    "quiz":             ("think", "town"),
}

TAG_COLOR = {"true": "#5FD6A0", "maybe": "#FFC266",
             "imagine": "#C3A6FF", "explain": "#8FC2FF"}

# The tags are how the product teaches media literacy, but "true / maybe /
# imagine / explain" are our words, not a parent's. On a feed card they get
# spelled out. The slot name (COVER, CHARACTER...) is purely our story
# structure and never appears.
TAG_LABEL = {"true": "really happened", "maybe": "not sure yet",
             "imagine": "story part", "explain": "what it means"}


def _sky(tone):
    a, b, c = SKIES.get(tone, SKIES["calm"])
    return (f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{a}"/>'
            f'<stop offset=".62" stop-color="{b}"/>'
            f'<stop offset="1" stop-color="{c}"/></linearGradient>')


def _stars(n=40, seed=11):
    out, s = [], seed
    for _ in range(n):
        s = (s * 1103515245 + 12345) % 2147483648; x = 24 + s % 1032
        s = (s * 1103515245 + 12345) % 2147483648; y = 600 + s % 420
        s = (s * 1103515245 + 12345) % 2147483648; r = 1.8 + (s % 26) / 10
        s = (s * 1103515245 + 12345) % 2147483648; off = (s % 20) / 10 * LOOP / 2
        out.append(f'<circle cx="{x}" cy="{y}" r="{r:.1f}" fill="#FFF8E6" opacity=".5">'
                   f'<animate attributeName="opacity" values=".15;.8;.15" dur="{LOOP}s" '
                   f'begin="-{off:.2f}s" repeatCount="indefinite"/></circle>')
    return "".join(out)


def _moon(tone, x=906, y=726, r=74):
    dark = SKIES.get(tone, SKIES["calm"])[0]
    return (f'<mask id="mn"><circle cx="{x}" cy="{y}" r="{r}" fill="#fff"/>'
            f'<circle cx="{x-r*.42:.0f}" cy="{y-r*.20:.0f}" r="{r*.88:.0f}" fill="#000"/>'
            f'</mask><g filter="url(#paint)">'
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GLOW}" mask="url(#mn)"/></g>')


def _house(x, w, h, fill, lit=()):
    """A simple gabled house. `lit` is a tuple of (dx, dy) window positions."""
    y = GROUND_Y - h
    p = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}"/>',
         f'<polygon points="{x-14},{y} {x+w//2},{y-54} {x+w+14},{y}" fill="{fill}"/>']
    for dx, dy in lit:
        p.append(f'<rect x="{x+dx}" y="{y+dy}" width="40" height="50" rx="7" '
                 f'fill="{GLOW}" opacity=".66"/>')
    return "".join(p)


def _props(kind, tone):
    dk = SIL.get(tone, SIL["calm"])
    md = GROUND.get(tone, GROUND["calm"])
    if kind == "town":
        return (f'<g filter="url(#paint)">'
                f'{_house(-30, 170, 210, dk)}{_house(150, 120, 148, md)}'
                f'{_house(830, 150, 190, md)}{_house(990, 160, 240, dk)}</g>')
    if kind == "lit_towers":
        return (f'<g filter="url(#paint)">'
                f'{_house(-30, 150, 170, dk)}'
                f'{_house(700, 180, 290, md, lit=((34, 52), (104, 52), (34, 140)))}'
                f'{_house(910, 200, 350, dk, lit=((44, 60), (120, 60), (44, 160), (120, 160)))}'
                f'</g>')
    if kind == "roof":
        return (f'<g filter="url(#paint)">'
                f'<polygon points="-40,{GROUND_Y} 540,{GROUND_Y-150} 1120,{GROUND_Y}" '
                f'fill="{dk}"/>'
                f'<rect x="-40" y="{GROUND_Y}" width="1160" height="60" fill="{dk}"/></g>')
    if kind == "window":
        return (f'<g filter="url(#paint)">'
                f'<rect x="-20" y="{GROUND_Y-360}" width="330" height="360" rx="16" fill="{md}"/>'
                f'<rect x="24" y="{GROUND_Y-318}" width="242" height="276" rx="10" '
                f'fill="{GLOW}" opacity=".6"/>'
                f'<line x1="145" y1="{GROUND_Y-318}" x2="145" y2="{GROUND_Y-42}" '
                f'stroke="{md}" stroke-width="14"/>'
                f'<line x1="24" y1="{GROUND_Y-180}" x2="266" y2="{GROUND_Y-180}" '
                f'stroke="{md}" stroke-width="14"/>'
                f'{_house(880, 200, 260, dk)}</g>')
    if kind == "tools":
        return (f'<g filter="url(#paint)">'
                f'<rect x="700" y="{GROUND_Y-280}" width="400" height="280" rx="20" fill="{md}"/>'
                f'<circle cx="790" cy="{GROUND_Y-212}" r="26" fill="#6C8BEF" opacity=".85"/>'
                f'<circle cx="876" cy="{GROUND_Y-212}" r="26" fill="#F48FB1" opacity=".85"/>'
                f'<circle cx="962" cy="{GROUND_Y-212}" r="26" fill="{GLOW}" opacity=".85"/>'
                f'<rect x="760" y="{GROUND_Y-146}" width="300" height="17" rx="9" fill="{dk}"/>'
                f'<rect x="760" y="{GROUND_Y-108}" width="210" height="17" rx="9" fill="{dk}"/>'
                f'<rect x="760" y="{GROUND_Y-70}" width="260" height="17" rx="9" fill="{dk}"/></g>')
    if kind == "bedroom":
        return (f'<g filter="url(#paint)">'
                f'<rect x="200" y="{GROUND_Y-120}" width="680" height="120" rx="26" fill="{md}"/>'
                f'<rect x="200" y="{GROUND_Y-168}" width="220" height="54" rx="22" fill="{PAPER}"/>'
                f'<rect x="420" y="{GROUND_Y-140}" width="460" height="40" rx="19" '
                f'fill="#F48FB1" opacity=".75"/>'
                f'<rect x="60" y="{GROUND_Y-260}" width="26" height="260" fill="{dk}"/>'
                f'<circle cx="73" cy="{GROUND_Y-286}" r="42" fill="{GLOW}" opacity=".55"/></g>')
    return ""


def _wrap(text, per):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > per and cur:
            lines.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines


def _esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "’"))


def card(page, total):
    tone = page["tone"]
    pose, prop = BEAT.get(page["slot"], ("stand", "town"))
    text = page["text"]

    # Largest size whose wrapped lines fit the caption box whole.
    BOX_H = 392
    for size in range(76, 39, -2):
        per = max(12, int(1150 / size * 1.06))
        lines = _wrap(text, per)
        if len(lines) * size * 1.24 <= BOX_H:
            break
    lh = size * 1.24
    top = 188 + (BOX_H - len(lines) * lh) / 2
    band = top + len(lines) * lh - lh * .24 + 26

    head = "".join(
        f'<text x="{W//2}" y="{top + i*lh:.0f}" text-anchor="middle" '
        f'font-family="{FONT}" font-size="{size}" font-weight="700" '
        f'style="{FONT_VAR}" fill="{PAPER}">{_esc(l)}</text>'
        for i, l in enumerate(lines))

    # Tags are off by default on feed cards. A card can carry both "story part"
    # and "really happened" without saying which sentence is which, so the label
    # tells the reader nothing. Per-sentence tagging belongs in the app; the
    # carousel makes the point with a closing "what was real" card instead.
    tags = sorted(set(page.get("tags", []))) if SHOW_TAGS else []
    widths = [len(TAG_LABEL.get(x, x)) * 15 + 54 for x in tags]
    chips, cx = [], W // 2 - (sum(widths) + 16 * max(0, len(tags) - 1)) // 2
    for x, w in zip(tags, widths):
        c = TAG_COLOR.get(x, SOFT)
        chips.append(
            f'<g transform="translate({cx},{H-128})">'
            f'<rect x="0" y="-28" width="{w}" height="42" rx="21" fill="{c}" opacity=".22"/>'
            f'<circle cx="26" cy="-7" r="7" fill="{c}"/>'
            f'<text x="{w//2 + 13}" y="1" text-anchor="middle" '
            f'font-family="{FONT}" font-size="23" font-weight="700" '
            f'fill="{c}">{TAG_LABEL.get(x, x)}</text></g>')
        cx += w + 16

    return f"""<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">
<defs>{parts.PAINT_FILTER}{_sky(tone)}
 <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#05040E" stop-opacity=".88"/>
  <stop offset=".72" stop-color="#05040E" stop-opacity=".66"/>
  <stop offset="1" stop-color="#05040E" stop-opacity="0"/>
 </linearGradient></defs>

<rect width="{W}" height="{H}" fill="url(#sky)"/>
{_stars()}
{_moon(tone)}
{_props(prop, tone)}
<rect x="0" y="0" width="{W}" height="{band:.0f}" fill="url(#band)"/>
<g filter="url(#paint)"><rect x="0" y="{GROUND_Y}" width="{W}" height="{H-GROUND_Y}"
  fill="{GROUND.get(tone, GROUND['calm'])}"/></g>
{pip(W//2, GROUND_Y + 58, 1.16, tone, pose)}

{head}
{"".join(chips)}
<text x="64" y="{H-58}" font-family="{FONT}" font-size="26"
 font-weight="700" fill="{PAPER}" opacity=".62">Lullabyte</text>
<text x="{W-64}" y="{H-58}" text-anchor="end" font-family="{FONT}"
 font-size="26" font-weight="700" fill="{PAPER}" opacity=".62">{page["page"]} / {total}</text>
</svg>"""
