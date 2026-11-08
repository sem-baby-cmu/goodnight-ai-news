"""SVG scene parts, in the Goodnight, AI visual language.

All motion shares one 2.0s period (LOOP), so 24 frames at 12fps cover a full
cycle and can be repeated for any page length without a visible seam.

The prototype does not generate images. It hand-draws flat vector scenes with a
paper-grain filter, so the character is identical on every page and the palette
never drifts. These parts rebuild that language as something a script can
assemble, page by page.

LOOP = 2.0

Stage is 1600x900 (same as the prototype). The reel crops to 9:16.
"""

# From the prototype: fractal noise displacement plus a grain overlay.
from pip import pip as _pip, LOOP  # noqa: E402

PAINT_FILTER = """
<filter id="paint" x="-8%" y="-8%" width="116%" height="116%">
  <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="3" result="w"/>
  <feDisplacementMap in="SourceGraphic" in2="w" scale="3.5"
      xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="11" result="g"/>
  <feColorMatrix in="g" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -.9 .62" result="ga"/>
  <feComposite in="ga" in2="d" operator="in" result="gi"/>
  <feMerge><feMergeNode in="d"/><feMergeNode in="gi"/></feMerge>
</filter>
<filter id="ink">
  <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="2" result="w"/>
  <feDisplacementMap in="SourceGraphic" in2="w" scale="2"/>
</filter>
<filter id="fuzz" x="-30%" y="-30%" width="160%" height="160%">
  <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="7"/>
  <feGaussianBlur stdDeviation=".6"/>
</filter>"""

# One gradient per tone. Same structure as the prototype's #bsky.
SKIES = {
    "warm":    ("#241C4A", "#6A3E6E", "#C9705E"),
    "calm":    ("#141230", "#241C4A", "#3C2F63"),
    "curious": ("#1A1A3E", "#332C66", "#5B4A8A"),
    "quiet":   ("#0E0C22", "#1A1A2E", "#272046"),
    "excited": ("#2A1F52", "#6A3E6E", "#F7A23B"),
}

GROUND = {"warm": "#7A4E7E", "calm": "#2A2550", "curious": "#3A3070",
          "quiet": "#1C1838", "excited": "#8A5A7E"}


def sky(tone):
    a, b, c = SKIES.get(tone, SKIES["calm"])
    return (f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{a}"/>'
            f'<stop offset=".7" stop-color="{b}"/>'
            f'<stop offset="1" stop-color="{c}"/></linearGradient>')


def stars(n=26, seed=7):
    """Deterministic star field, so the same page always renders the same."""
    out, s = [], seed
    for _ in range(n):
        s = (s * 1103515245 + 12345) % 2147483648
        x = 40 + s % 1520
        s = (s * 1103515245 + 12345) % 2147483648
        y = 40 + s % 430
        s = (s * 1103515245 + 12345) % 2147483648
        r = 1.6 + (s % 24) / 10
        s = (s * 1103515245 + 12345) % 2147483648
        off = (s % 20) / 10 * LOOP / 2
        out.append(
            f'<circle cx="{x}" cy="{y}" r="{r:.1f}" fill="#FFF8E6" opacity=".55">'
            f'<animate attributeName="opacity" values=".2;.85;.2" dur="{LOOP}s" '
            f'begin="-{off:.2f}s" repeatCount="indefinite"/></circle>')
    return "".join(out)


def moon(x=1380, y=170, r=78, tone="calm"):
    """Crescent cut with a mask, so the dark side matches the sky behind it."""
    mid = SKIES.get(tone, SKIES["calm"])[0]
    return (f'<mask id="mn"><circle cx="{x}" cy="{y}" r="{r}" fill="#fff"/>'
            f'<circle cx="{x - r*.42:.0f}" cy="{y - r*.20:.0f}" r="{r*.88:.0f}" '
            f'fill="#000"/></mask>'
            f'<g filter="url(#paint)">'
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="{mid}" opacity=".0"/>'
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFD23F" mask="url(#mn)"/></g>')


def skyline(ground_y=640, color="#2A2250"):
    """Simple building silhouettes, like the prototype's town."""
    spec = [(60, 150, 210), (250, 110, 150), (400, 170, 120), (1140, 130, 180),
            (1310, 100, 140), (1450, 150, 200)]
    out = []
    for x, w, h in spec:
        out.append(f'<rect x="{x}" y="{ground_y-h}" width="{w}" height="{h}" '
                   f'rx="10" fill="{color}"/>')
        out.append(f'<polygon points="{x-12},{ground_y-h} {x+w//2},{ground_y-h-52} '
                   f'{x+w+12},{ground_y-h}" fill="{color}"/>')
    return f'<g filter="url(#paint)">{"".join(out)}</g>'


def ground(tone, y=640):
    return (f'<g filter="url(#paint)">'
            f'<rect x="0" y="{y}" width="1600" height="{900-y}" '
            f'fill="{GROUND.get(tone, GROUND["calm"])}"/></g>')


def pip(x=800, y=640, scale=1.0, mood="calm", pose="stand"):
    """Pip, drawn by the one component in scene/pip.py.

    This file used to carry a second, simpler drawing of him. Two drawings of
    one character is exactly the failure P2 is meant to catch, so this is now a
    wrapper. Change Pip in scene/pip.py and every format follows.
    """
    return _pip(x, y, scale * 1.18, mood, pose)


def scene(tone, mood=None, with_skyline=True, with_moon=True, pip_scale=1.0):
    mood = mood or tone
    return f"""<svg viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
<defs>{PAINT_FILTER}{sky(tone)}</defs>
<rect width="1600" height="900" fill="url(#sky)"/>
{stars()}
{moon() if with_moon else ""}
{skyline() if with_skyline else ""}
{ground(tone)}
{pip(800, 650, pip_scale, mood)}
</svg>"""


# --- vertical stage, 1080x1920, for Threads and Instagram -------------------

VW, VH = 1080, 1920


def vstars(n=34, seed=19):
    out, s = [], seed
    for _ in range(n):
        s = (s * 1103515245 + 12345) % 2147483648
        x = 30 + s % 1020
        s = (s * 1103515245 + 12345) % 2147483648
        y = 40 + s % 900
        s = (s * 1103515245 + 12345) % 2147483648
        r = 1.8 + (s % 26) / 10
        s = (s * 1103515245 + 12345) % 2147483648
        off = (s % 20) / 10 * LOOP / 2
        out.append(
            f'<circle cx="{x}" cy="{y}" r="{r:.1f}" fill="#FFF8E6" opacity=".55">'
            f'<animate attributeName="opacity" values=".2;.85;.2" dur="{LOOP}s" '
            f'begin="-{off:.2f}s" repeatCount="indefinite"/></circle>')
    return "".join(out)


def vskyline(ground_y=1180, color="#2A2250"):
    spec = [(-20, 150, 190), (150, 110, 130), (760, 130, 165), (920, 150, 220)]
    out = []
    for x, w, h in spec:
        out.append(f'<rect x="{x}" y="{ground_y-h}" width="{w}" height="{h}" '
                   f'rx="10" fill="{color}"/>')
        out.append(f'<polygon points="{x-12},{ground_y-h} {x+w//2},{ground_y-h-50} '
                   f'{x+w+12},{ground_y-h}" fill="{color}"/>')
    return f'<g filter="url(#paint)">{"".join(out)}</g>'


def vscene(tone, text="", slot="", mood=None):
    """Portrait card: sky and Pip up top, caption burned in below."""
    mood = mood or tone
    g = GROUND.get(tone, GROUND["calm"])
    lines = _wrap(text, 24)
    y0 = 1420
    caption = "".join(
        f'<text x="540" y="{y0 + i*78}" font-family="system-ui,-apple-system,sans-serif" '
        f'font-size="60" font-weight="600" fill="#FFF8E6" text-anchor="middle">'
        f'{_esc(l)}</text>' for i, l in enumerate(lines))
    label = (f'<text x="540" y="180" font-family="system-ui,sans-serif" font-size="32" '
             f'letter-spacing="4" fill="#6C8BEF" text-anchor="middle">'
             f'{_esc(slot.replace("_"," ").upper())}</text>') if slot else ""
    return f"""<svg viewBox="0 0 {VW} {VH}" xmlns="http://www.w3.org/2000/svg">
<defs>{PAINT_FILTER}{sky(tone)}</defs>
<rect width="{VW}" height="{VH}" fill="url(#sky)"/>
{vstars()}
{moon(840, 300, 96, tone)}
{vskyline()}
<g filter="url(#paint)"><rect x="0" y="1180" width="{VW}" height="{VH-1180}" fill="{g}"/></g>
{label}
{pip(540, 1215, 1.45, mood)}
<rect x="0" y="1290" width="{VW}" height="{VH-1290}" fill="#0E0C22" opacity=".55"/>
{caption}
</svg>"""


def _wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            lines.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines[:5]


def _esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&#8217;"))


# --- per page composition ---------------------------------------------------
#
# Pip is always the same pip() call. Only his position, scale and mood change,
# plus which background parts are present. That is what keeps the character
# identical across pages: there is nothing to drift.

SLOT_LAYOUT = {
    # slot:            (pip_x, pip_scale, skyline, moon, extra)
    "cover":           (800, 1.50, True,  True,  "title"),
    "character":       (800, 1.35, False, True,  "window"),
    "news_discovery":  (520, 1.00, True,  False, "two_buildings"),
    "exploration":     (1080, 1.05, True, False, "window"),
    "challenge":       (420, 0.90, False, False, "tools"),
    "turning_point":   (800, 1.15, True,  True,  None),
    "resolution":      (760, 1.25, True,  True,  "sparkle"),
    "reflection":      (820, 1.10, False, True,  "bed"),
    "real_world_facts": (1280, 0.75, False, False, "panel"),
    "quiz":            (800, 1.30, False, True,  "questions"),
}


def _two_buildings(gy=640):
    return (f'<g filter="url(#paint)">'
            f'<rect x="880" y="{gy-230}" width="210" height="230" rx="12" fill="#3A2F66"/>'
            f'<polygon points="868,{gy-230} 985,{gy-292} 1102,{gy-230}" fill="#3A2F66"/>'
            f'<rect x="1160" y="{gy-280}" width="240" height="280" rx="12" fill="#2E2655"/>'
            f'<rect x="1210" y="{gy-230}" width="46" height="56" rx="6" fill="#FFD23F" opacity=".75"/>'
            f'<rect x="1300" y="{gy-230}" width="46" height="56" rx="6" fill="#FFD23F" opacity=".5"/>'
            f'<rect x="1210" y="{gy-140}" width="46" height="56" rx="6" fill="#FFD23F" opacity=".6"/>'
            f'</g>')


def _window(gy=640):
    return (f'<g filter="url(#paint)">'
            f'<rect x="150" y="{gy-360}" width="300" height="330" rx="16" fill="#2E2655"/>'
            f'<rect x="186" y="{gy-324}" width="228" height="258" rx="10" fill="#FFD23F" opacity=".62"/>'
            f'<line x1="300" y1="{gy-324}" x2="300" y2="{gy-66}" stroke="#2E2655" stroke-width="12"/>'
            f'<line x1="186" y1="{gy-195}" x2="414" y2="{gy-195}" stroke="#2E2655" stroke-width="12"/>'
            f'</g>')


def _tools(gy=640):
    return (f'<g filter="url(#paint)" opacity=".9">'
            f'<rect x="980" y="{gy-300}" width="420" height="300" rx="18" fill="#2A2250"/>'
            f'<circle cx="1070" cy="{gy-230}" r="26" fill="#6C8BEF" opacity=".8"/>'
            f'<circle cx="1160" cy="{gy-230}" r="26" fill="#F48FB1" opacity=".8"/>'
            f'<circle cx="1250" cy="{gy-230}" r="26" fill="#FFD23F" opacity=".8"/>'
            f'<rect x="1040" y="{gy-160}" width="320" height="18" rx="9" fill="#4A3F7A"/>'
            f'<rect x="1040" y="{gy-120}" width="230" height="18" rx="9" fill="#4A3F7A"/>'
            f'<rect x="1040" y="{gy-80}" width="280" height="18" rx="9" fill="#4A3F7A"/></g>')


def _sparkle():
    out = []
    for i, (x, y, r) in enumerate([(480, 300, 16), (1180, 250, 13), (620, 430, 10),
                                   (1080, 420, 15), (380, 500, 11)]):
        out.append(
            f'<g transform="translate({x},{y})"><path d="M0,-{r} L{r*.3:.0f},-{r*.3:.0f} '
            f'L{r},0 L{r*.3:.0f},{r*.3:.0f} L0,{r} L-{r*.3:.0f},{r*.3:.0f} L-{r},0 '
            f'L-{r*.3:.0f},-{r*.3:.0f} Z" fill="#FFD23F">'
            f'<animate attributeName="opacity" values=".3;1;.3" dur="{LOOP}s" '
            f'begin="-{i*0.3:.1f}s" repeatCount="indefinite"/></path></g>')
    return "".join(out)


def _bed(gy=640):
    return (f'<g filter="url(#paint)">'
            f'<rect x="520" y="{gy-110}" width="560" height="110" rx="22" fill="#3A2F66"/>'
            f'<rect x="520" y="{gy-150}" width="180" height="46" rx="18" fill="#FFF1C9"/>'
            f'<rect x="700" y="{gy-124}" width="380" height="34" rx="16" fill="#F48FB1" opacity=".8"/>'
            f'</g>')


def _panel(gy=640):
    return (f'<g filter="url(#paint)">'
            f'<rect x="150" y="{gy-380}" width="860" height="360" rx="24" fill="#FFF8E6" opacity=".12"/>'
            f'<rect x="200" y="{gy-320}" width="520" height="22" rx="11" fill="#FFF8E6" opacity=".45"/>'
            f'<rect x="200" y="{gy-262}" width="700" height="22" rx="11" fill="#FFF8E6" opacity=".35"/>'
            f'<rect x="200" y="{gy-204}" width="600" height="22" rx="11" fill="#FFF8E6" opacity=".35"/>'
            f'<rect x="200" y="{gy-146}" width="420" height="22" rx="11" fill="#FFF8E6" opacity=".25"/>'
            f'</g>')


def _questions():
    out = []
    for i, (x, y, s) in enumerate([(420, 330, 1.0), (800, 250, 1.25), (1180, 330, 1.0)]):
        out.append(
            f'<g transform="translate({x},{y}) scale({s})">'
            f'<text x="0" y="0" font-family="system-ui,sans-serif" font-size="96" '
            f'font-weight="700" fill="#FFD23F" text-anchor="middle" opacity=".85">?'
            f'<animate attributeName="opacity" values=".35;.95;.35" dur="{LOOP}s" '
            f'begin="-{i*0.5:.1f}s" repeatCount="indefinite"/></text></g>')
    return "".join(out)


EXTRAS = {"two_buildings": _two_buildings, "window": _window, "tools": _tools,
          "sparkle": _sparkle, "bed": _bed, "panel": _panel, "questions": _questions}


def page_scene(page, w=1600, h=900):
    """Landscape scene for one script page. Pip is the same component every time."""
    slot, tone = page["slot"], page["tone"]
    px, ps, has_sky, has_moon, extra = SLOT_LAYOUT.get(
        slot, (800, 1.1, True, True, None))
    fn = EXTRAS.get(extra)
    return f"""<svg viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg"
     preserveAspectRatio="xMidYMid slice">
<defs>{PAINT_FILTER}{sky(tone)}</defs>
<rect width="1600" height="900" fill="url(#sky)"/>
{stars()}
{moon(1380, 170, 78, tone) if has_moon else ""}
{skyline() if has_sky else ""}
{ground(tone)}
{fn() if fn else ""}
{pip(px, 650, ps, tone)}
</svg>"""
