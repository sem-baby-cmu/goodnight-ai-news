"""Time and place, chosen by the story rather than by the product.

Lullabyte is read at bedtime, so the first version painted every page at night.
That confused two different things: *when the story is read* and *when the
story happens*. A story about a school and an office happens in daylight.

A page names a time (day / dusk / night) and a place (street, classroom,
office, rooftop, bedroom, plain). The night framing survives only where the
text asks for it.
"""
LOOP = 2.0

# sky: top, middle, horizon
SKY = {
    "day":   ("#4F8FD6", "#8FC2E8", "#D8E9F2"),
    "dusk":  ("#2E2A66", "#8A4E79", "#E8915E"),
    "night": ("#141230", "#241C4A", "#3C2F63"),
}
# ground, silhouette, building face, lit window
GROUND = {"day": "#7FA86B", "dusk": "#6E4570", "night": "#1E1944"}
SIL = {"day": "#5C8050", "dusk": "#2E1C40", "night": "#0E0B22"}
FACE = {"day": "#E8DCC0", "dusk": "#5A3560", "night": "#241E4C"}
LIT = {"day": "#9FC4DE", "dusk": "#FFD23F", "night": "#FFD23F"}
# indoor surfaces
WALL = {"day": "#E4D7BE", "dusk": "#4A3258", "night": "#211C42"}
FLOOR = {"day": "#C9A87C", "dusk": "#3A2746", "night": "#191536"}
INK_ON = {"day": "#2A2440", "dusk": "#FFF4DE", "night": "#FFF4DE"}

GROUND_Y = 1062


def sky(time):
    a, b, c = SKY.get(time, SKY["night"])
    return (f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{a}"/>'
            f'<stop offset=".62" stop-color="{b}"/>'
            f'<stop offset="1" stop-color="{c}"/></linearGradient>')


def stars(time, n=40, seed=11):
    if time == "day":
        return ""
    out, s, dim = [], seed, ".3" if time == "dusk" else ".5"
    for _ in range(n):
        s = (s * 1103515245 + 12345) % 2147483648; x = 24 + s % 1032
        s = (s * 1103515245 + 12345) % 2147483648; y = 600 + s % 420
        s = (s * 1103515245 + 12345) % 2147483648; r = 1.8 + (s % 26) / 10
        s = (s * 1103515245 + 12345) % 2147483648; off = (s % 20) / 10 * LOOP / 2
        out.append(f'<circle cx="{x}" cy="{y}" r="{r:.1f}" fill="#FFF8E6" opacity="{dim}">'
                   f'<animate attributeName="opacity" values=".15;.8;.15" dur="{LOOP}s" '
                   f'begin="-{off:.2f}s" repeatCount="indefinite"/></circle>')
    return "".join(out)


def light(time, x=906, y=726, r=74):
    """Sun by day, crescent moon otherwise."""
    if time == "day":
        return (f'<g filter="url(#paint)">'
                f'<circle cx="{x}" cy="{y}" r="{r*1.5:.0f}" fill="#FFF3C4" opacity=".35"/>'
                f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFE07A"/></g>')
    dark = SKY.get(time, SKY["night"])[0]
    return (f'<mask id="mn"><circle cx="{x}" cy="{y}" r="{r}" fill="#fff"/>'
            f'<circle cx="{x-r*.42:.0f}" cy="{y-r*.20:.0f}" r="{r*.88:.0f}" fill="#000"/>'
            f'</mask><g filter="url(#paint)">'
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFD23F" mask="url(#mn)"/></g>')


def clouds(time):
    if time == "night":
        return ""
    o = ".82" if time == "day" else ".4"
    c = "#FFFFFF" if time == "day" else "#F6C9A8"
    out = []
    for x, y, s in ((150, 760, 1.0), (640, 690, .66), (930, 820, .82)):
        out.append(
            f'<g transform="translate({x},{y}) scale({s})" opacity="{o}">'
            f'<ellipse cx="0" cy="0" rx="118" ry="44" fill="{c}"/>'
            f'<ellipse cx="-58" cy="14" rx="74" ry="34" fill="{c}"/>'
            f'<ellipse cx="62" cy="16" rx="66" ry="30" fill="{c}"/>'
            f'<animateTransform attributeName="transform" type="translate" '
            f'values="0,0; 14,0; 0,0" dur="{LOOP*4}s" repeatCount="indefinite" '
            f'additive="sum"/></g>')
    return "".join(out)


def _house(x, w, h, fill, lit_c=None, windows=()):
    y = GROUND_Y - h
    p = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}"/>',
         f'<polygon points="{x-14},{y} {x+w//2},{y-54} {x+w+14},{y}" fill="{fill}"/>']
    for dx, dy in windows:
        p.append(f'<rect x="{x+dx}" y="{y+dy}" width="40" height="50" rx="7" '
                 f'fill="{lit_c}" opacity=".7"/>')
    return "".join(p)


def place(kind, time):
    """Returns (background behind the character, foreground in front of it)."""
    sil, face, lit = SIL[time], FACE[time], LIT[time]
    wall, floor, ink = WALL[time], FLOOR[time], INK_ON[time]
    g = GROUND[time]

    if kind == "street":
        return (f'<g filter="url(#paint)">'
                f'{_house(-30, 170, 210, sil)}{_house(150, 120, 148, face)}'
                f'{_house(830, 150, 190, face)}{_house(990, 160, 240, sil)}</g>'
                f'<g filter="url(#paint)"><rect x="0" y="{GROUND_Y}" width="1080" '
                f'height="{1350-GROUND_Y}" fill="{g}"/></g>'), ""

    if kind == "campus":
        # a school and an office facing each other, lights on
        return (f'<g filter="url(#paint)">'
                f'{_house(-40, 300, 300, face, lit, ((60,70),(150,70),(60,170),(150,170)))}'
                f'{_house(760, 330, 380, sil, lit, ((70,90),(170,90),(70,200),(170,200)))}'
                f'</g><g filter="url(#paint)"><rect x="0" y="{GROUND_Y}" width="1080" '
                f'height="{1350-GROUND_Y}" fill="{g}"/></g>'), ""

    if kind == "classroom":
        board_ink = "#2A2440" if time == "day" else "#FFF4DE"
        desks = "".join(
            f'<rect x="{x}" y="{GROUND_Y-34}" width="190" height="22" rx="11" fill="{face}"/>'
            f'<rect x="{x+22}" y="{GROUND_Y-12}" width="16" height="70" fill="{face}"/>'
            f'<rect x="{x+152}" y="{GROUND_Y-12}" width="16" height="70" fill="{face}"/>'
            for x in (-60, 880))
        return (f'<g filter="url(#paint)">'
                f'<rect x="0" y="600" width="1080" height="{GROUND_Y-600}" fill="{wall}"/>'
                f'<rect x="0" y="{GROUND_Y}" width="1080" height="{1350-GROUND_Y}" fill="{floor}"/>'
                f'<rect x="120" y="648" width="840" height="330" rx="16" fill="{face}"/>'
                f'<rect x="152" y="680" width="776" height="266" rx="10" fill="{wall}" '
                f'opacity=".6"/>'
                f'<path d="M210 752 h300 M210 822 h520 M210 892 h380" stroke="{board_ink}" '
                f'stroke-width="14" stroke-linecap="round" opacity=".42"/>'
                f'{desks}</g>'), ""

    if kind == "office":
        screen = "#9FC4DE" if time == "day" else "#6C8BEF"
        shelf = "".join(
            f'<rect x="92" y="{y}" width="250" height="14" rx="7" fill="{face}"/>'
            f'<rect x="110" y="{y-56}" width="26" height="56" rx="4" fill="{lit}" opacity=".55"/>'
            f'<rect x="146" y="{y-44}" width="22" height="44" rx="4" fill="{face}"/>'
            f'<rect x="178" y="{y-62}" width="28" height="62" rx="4" fill="{screen}" opacity=".7"/>'
            for y in (742, 876))
        return (f'<g filter="url(#paint)">'
                f'<rect x="0" y="600" width="1080" height="{GROUND_Y-600}" fill="{wall}"/>'
                f'<rect x="0" y="{GROUND_Y}" width="1080" height="{1350-GROUND_Y}" fill="{floor}"/>'
                f'{shelf}'
                f'<rect x="620" y="760" width="300" height="200" rx="14" fill="{face}"/>'
                f'<rect x="648" y="788" width="244" height="148" rx="8" fill="{screen}" '
                f'opacity=".8"/>'
                f'<path d="M686 836 h120 M686 872 h168" stroke="{wall}" stroke-width="10" '
                f'stroke-linecap="round" opacity=".7"/>'
                f'<rect x="742" y="960" width="56" height="42" fill="{face}"/>'
                f'<rect x="560" y="{GROUND_Y-60}" width="460" height="28" rx="14" fill="{face}"/>'
                f'<rect x="596" y="{GROUND_Y-32}" width="20" height="92" fill="{face}"/>'
                f'<rect x="964" y="{GROUND_Y-32}" width="20" height="92" fill="{face}"/>'
                f'</g>'), ""

    if kind == "rooftop":
        return (f'<g filter="url(#paint)">'
                f'{_house(840, 200, 230, sil)}'
                f'<polygon points="-40,{GROUND_Y} 540,{GROUND_Y-150} 1120,{GROUND_Y}" fill="{sil}"/>'
                f'<rect x="-40" y="{GROUND_Y}" width="1160" height="{1350-GROUND_Y}" fill="{sil}"/>'
                f'</g>'), ""

    if kind == "bedroom":
        return (f'<g filter="url(#paint)">'
                f'<rect x="0" y="560" width="1080" height="{GROUND_Y-560}" fill="{wall}"/>'
                f'<rect x="0" y="{GROUND_Y}" width="1080" height="{1350-GROUND_Y}" fill="{floor}"/>'
                f'<rect x="760" y="640" width="280" height="300" rx="16" fill="{face}"/>'
                f'<rect x="792" y="672" width="216" height="236" rx="10" fill="{lit}" opacity=".45"/>'
                f'<rect x="60" y="800" width="26" height="262" fill="{face}"/>'
                f'<circle cx="73" cy="774" r="44" fill="{lit}" opacity=".55"/></g>',
                f'<g filter="url(#paint)">'
                f'<rect x="150" y="{GROUND_Y-70}" width="700" height="150" rx="28" fill="{face}"/>'
                f'<rect x="150" y="{GROUND_Y-124}" width="230" height="60" rx="26" fill="#FFF4DE"/>'
                f'<rect x="380" y="{GROUND_Y-92}" width="470" height="44" rx="21" '
                f'fill="#F48FB1" opacity=".8"/></g>')

    if kind == "plain":
        return (f'<g filter="url(#paint)"><rect x="0" y="{GROUND_Y}" width="1080" '
                f'height="{1350-GROUND_Y}" fill="{g}"/></g>'), ""

    return "", ""
