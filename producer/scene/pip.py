"""Pip, as one posable component.

The design is taken from the Goodnight, AI prototype: a single soft blue body
with no neck, two round eyes set a little unevenly, a drawn smile, pink blush,
orange ear dots, and a thin cream antenna with a crescent moon on top. Arms and
legs are strokes, not shapes, which is what makes posing cheap.

Geometry is kept in the prototype's own coordinates (body from y 54 to 238,
feet at 276, centre at x 134) so the drawing can be checked against the
original. The outer transform moves that frame so the caller's (x, y) is the
ground under Pip's feet.

Every pose returns the same character. Nothing here is generated or sampled, so
Pip cannot drift between pages, between stories, or between formats.
"""

LOOP = 2.0  # seconds. One breath. Every animation in the system uses it.

BODY, DEEP = "#6C8BEF", "#4B67C9"
EAR, EAR_LINE = "#F7A23B", "#B56A12"
BLUSH, EYE, INK = "#F7A6C8", "#FFFDF6", "#1A1A2E"
GLOW, CREAM, PAGE = "#FFD23F", "#FFF1C9", "#FFF6E2"

# Native frame: Pip is 162 wide and 276 tall, centred on x=134, feet at y=276.
CX, FEET = 134, 276

MOUTH = {
    # A mood has to be readable on a phone, so the mouth carries most of it.
    "smile": f'<path d="M120 152 C124 164 144 164 150 149" stroke="{INK}" '
             f'stroke-width="3.4" fill="none" stroke-linecap="round"/>',
    "grin":  f'<path d="M114 148 C120 170 150 170 156 146" stroke="{INK}" '
             f'stroke-width="3.6" fill="none" stroke-linecap="round"/>',
    "oh":    f'<ellipse cx="135" cy="156" rx="7" ry="9.5" fill="{INK}"/>',
    "soft":  f'<path d="M124 156 C130 161 141 161 147 155" stroke="{INK}" '
             f'stroke-width="3.2" fill="none" stroke-linecap="round"/>',
    "open":  f'<path d="M115 147 C123 175 149 175 157 145 Z" fill="{INK}"/>'
             f'<path d="M126 164 C130 170 142 170 146 163 Z" fill="#E8718C"/>',
}

MOOD = {
    # antenna tilt, eye white radius, pupil radius, blush opacity, mouth
    "calm":    (0, 14.0, 5.8, 0.85, "smile"),
    "warm":    (-7, 14.5, 6.2, 1.00, "grin"),
    "curious": (-18, 16.0, 6.4, 0.80, "oh"),
    "quiet":   (9, 10.5, 4.9, 0.55, "soft"),
    "excited": (13, 17.0, 6.9, 1.00, "open"),
}


def _arm(d, w=12):
    return (f'<path d="{d}" stroke="{BODY}" stroke-width="{w}" fill="none" '
            f'stroke-linecap="round"/>')


def _leg(d):
    return (f'<path d="{d}" stroke="{BODY}" stroke-width="12" fill="none" '
            f'stroke-linejoin="round" stroke-linecap="round"/>')


L_DOWN = "M78 156 C60 168 52 186 56 206"
R_DOWN = "M192 160 C210 172 214 190 210 210"
LEGS = ("M112 232 L102 258 L110 276", "M156 232 L168 254 L160 274")
LEGS_TUCK = ("M112 230 L98 248 L108 262", "M156 230 L170 246 L160 260")


def _sparkles():
    pts = [(58, 54, 11), (212, 46, 13), (40, 112, 8), (232, 108, 9)]
    out = []
    for i, (x, y, r) in enumerate(pts):
        out.append(
            f'<path d="M{x} {y-r} L{x+r*.3:.0f} {y-r*.3:.0f} L{x+r} {y} '
            f'L{x+r*.3:.0f} {y+r*.3:.0f} L{x} {y+r} L{x-r*.3:.0f} {y+r*.3:.0f} '
            f'L{x-r} {y} L{x-r*.3:.0f} {y-r*.3:.0f} Z" fill="{GLOW}">'
            f'<animate attributeName="opacity" values=".25;1;.25" '
            f'dur="{LOOP}s" begin="{i*0.22:.2f}s" repeatCount="indefinite"/></path>')
    return "".join(out)


def _dots():
    out = []
    for i, (x, y, r) in enumerate([(216, 84, 6), (238, 58, 9), (266, 26, 13)]):
        out.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{CREAM}" opacity=".95">'
                   f'<animate attributeName="opacity" values=".15;.95;.15" '
                   f'dur="{LOOP}s" begin="{i*0.3:.1f}s" repeatCount="indefinite"/>'
                   f'</circle>')
    return "".join(out)


def _book():
    return (f'<g transform="rotate(-3 134 196) translate(0,-14)">'
            f'<path d="M134 196 C118 188 96 186 80 190 L80 236 C96 232 118 234 134 242Z" '
            f'fill="{PAGE}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'
            f'<path d="M134 196 C150 188 172 186 188 190 L188 236 C172 232 150 234 134 242Z" '
            f'fill="{PAGE}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'
            f'<g stroke="{DEEP}" stroke-width="2" stroke-linecap="round" opacity=".55">'
            f'<path d="M92 202 h30 M92 212 h30 M92 222 h24"/>'
            f'<path d="M146 202 h30 M146 212 h30 M146 222 h24"/></g>'
            f'<path d="M134 196 L134 242" stroke="{INK}" stroke-width="2.5"/></g>')


def _zzz():
    out = []
    for i, (x, y, s) in enumerate([(210, 92, 26), (240, 56, 34), (276, 16, 44)]):
        out.append(
            f'<text x="{x}" y="{y}" font-family="Grandstander, Fredoka, sans-serif" '
            f'font-size="{s}" fill="{EYE}" opacity=".85" '
            f'style="font-variation-settings:\'wght\' 700">z'
            f'<animate attributeName="opacity" values="0;.9;0" dur="{LOOP*1.5}s" '
            f'begin="{i*0.45:.2f}s" repeatCount="indefinite"/></text>')
    return "".join(out)


def _question():
    return (f'<text x="224" y="84" font-family="Grandstander, Fredoka, sans-serif" '
            f'font-size="46" fill="{GLOW}" text-anchor="middle" '
            f'style="font-variation-settings:\'wght\' 700">?'
            f'<animateTransform attributeName="transform" type="rotate" '
            f'values="-9 224 68; 9 224 68; -9 224 68" dur="{LOOP*1.4}s" '
            f'repeatCount="indefinite"/></text>')


def _P(al=L_DOWN, ar=R_DOWN, legs=LEGS, tf="", eye=(0, 0),
       back="", front="", shut=False, anim=""):
    return {"al": al, "ar": ar, "legs": legs, "tf": tf, "eye": eye,
            "back": back, "front": front, "shut": shut, "anim": anim}


def _pose(name):
    if name == "wave":
        return _P(ar="M192 156 C216 142 228 116 222 92",
                  anim='<animateTransform attributeName="transform" type="rotate" '
                       f'values="0 192 156; -16 192 156; 0 192 156" dur="{LOOP}s" '
                       'repeatCount="indefinite" additive="sum"/>')
    if name == "point":
        return _P(ar="M192 162 C218 160 244 158 268 157", eye=(4, 0))
    if name == "cheer":
        return _P(al="M78 154 C54 140 42 114 48 90",
                  ar="M192 158 C216 144 228 118 222 94",
                  legs=LEGS_TUCK, back=_sparkles(),
                  anim='<animateTransform attributeName="transform" type="translate" '
                       f'values="0,0; 0,-16; 0,0" dur="{LOOP}s" '
                       'repeatCount="indefinite" additive="sum"/>')
    if name == "think":
        return _P(ar="M194 158 C216 150 216 118 196 104", eye=(3, -4),
                  back=_dots())
    if name == "peek":
        return _P(al="M78 158 C62 172 58 192 66 208",
                  ar="M192 160 C206 174 204 192 194 204",
                  tf=' transform="rotate(-9 134 276)"', eye=(-5, 1))
    if name == "read":
        return _P(al="M78 162 C66 182 82 198 102 200",
                  ar="M192 164 C204 184 188 200 168 202",
                  eye=(0, 4), front=_book())
    if name == "sleep":
        return _P(al="M78 160 C60 176 56 196 62 212",
                  ar="M192 162 C210 178 214 198 208 212",
                  tf=' transform="rotate(5 134 276)"', shut=True, back=_zzz())
    if name == "lost":
        return _P(al="M78 160 C54 170 42 184 40 200",
                  ar="M192 162 C216 172 228 186 230 202",
                  eye=(0, -5), back=_question())
    return _P()


POSES = ["stand", "wave", "point", "cheer", "think", "peek", "read", "sleep", "lost"]


def pip(x=540, y=700, scale=1.0, mood="calm", pose="stand"):
    """Draw Pip. (x, y) is the ground under his feet."""
    tilt, er, pr, blush, mouth = MOOD.get(mood, MOOD["calm"])
    P = _pose(pose)
    ex, ey = P["eye"]

    if P["shut"]:
        eyes = (f'<g stroke="{INK}" stroke-width="3.6" fill="none" stroke-linecap="round">'
                f'<path d="M94 133 C100 142 112 142 118 132"/>'
                f'<path d="M146 128 C152 137 164 137 170 127"/></g>')
    else:
        eyes = (f'<g filter="url(#ink)">'
                f'<circle cx="106" cy="131" r="{er}" fill="{EYE}"/>'
                f'<circle cx="158" cy="126" r="{er}" fill="{EYE}"/></g>'
                f'<circle cx="{106+ex}" cy="{135+ey}" r="{pr}" fill="{INK}"/>'
                f'<circle cx="{158+ex}" cy="{130+ey}" r="{pr}" fill="{INK}"/>'
                f'<g><animateTransform attributeName="transform" type="scale" '
                f'values="1 1;1 .08;1 1" dur="{LOOP*2.6:.1f}s" keyTimes="0;.94;.98" '
                f'repeatCount="indefinite"/></g>')

    return f"""<g transform="translate({x},{y}) scale({scale})">
 <g transform="translate({-CX},{-FEET})">
  <g{P["tf"]}>
   <g filter="url(#paint)">
    <animateTransform attributeName="transform" type="translate"
      values="0,0; 0,-7; 0,0" dur="{LOOP}s" repeatCount="indefinite" additive="sum"/>
    {P["anim"]}
    <ellipse cx="134" cy="278" rx="74" ry="13" fill="{INK}" opacity=".16"/>
    {P["back"]}
    {_leg(P["legs"][0])}{_leg(P["legs"][1])}
    {_arm(P["al"])}{_arm(P["ar"])}
    <path d="M74 92 C76 64 108 54 140 56 C176 58 198 72 196 104
             C194 140 202 178 190 206 C180 232 150 240 126 238
             C94 236 70 222 68 190 C66 158 72 122 74 92Z" fill="{BODY}"/>
    <circle cx="72" cy="128" r="8" fill="{EAR}"/>
    <circle cx="198" cy="122" r="7" fill="{EAR}"/>
    <path d="M72 128 l-4 0 M198 122 l4 0" stroke="{EAR_LINE}" stroke-width="2"
          stroke-linecap="round"/>
    <g fill="{DEEP}" opacity=".7"><circle cx="86" cy="196" r="2.4"/>
      <circle cx="96" cy="206" r="2.4"/><circle cx="176" cy="96" r="2.4"/>
      <circle cx="184" cy="106" r="2.4"/></g>
    <g transform="translate(0,-26)">
     <circle cx="98" cy="154" r="11" fill="{BLUSH}" opacity="{blush}" filter="url(#fuzz)"/>
     <circle cx="172" cy="150" r="11" fill="{BLUSH}" opacity="{blush}" filter="url(#fuzz)"/>
     {eyes}
     <g filter="url(#ink)">{MOUTH[mouth]}</g>
    </g>
    {P["front"]}
    <g transform="rotate({tilt} 140 58)">
     <path d="M140 58 C138 44 146 32 146 18" stroke="{CREAM}" stroke-width="3.5"
           fill="none" stroke-linecap="round"/>
     <g transform="translate(146,6)">
      <path d="M10 -19 C-6 -14 -16 -4 -16 8 C-16 20 -6 30 10 35
               C-3 26 -8 18 -8 8 C-8 -2 -3 -10 10 -19 Z" fill="{GLOW}"/>
     </g>
    </g>
   </g>
  </g>
 </g>
</g>"""
