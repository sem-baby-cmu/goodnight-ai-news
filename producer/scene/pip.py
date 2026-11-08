"""Pip, as one posable component.

The head (eyes, beak, antenna) and the body shell are drawn by the same code on
every page. What changes per pose is the wing shapes, the body transform, where
the eyes look, and any prop. That is enough for a reader to see a different
action while the character stays recognisably the same bird.

An earlier version only rotated one wing path by a few degrees. On a phone that
reads as "no change at all", so each pose now has its own wing geometry.
"""

LOOP = 2.0
BODY, DARK = "#4A6FE8", "#3454BA"
CREAM, GLOW, BEAK, INK = "#FFF8E6", "#FFD23F", "#F7A23B", "#101A33"

MOOD = {   # antenna tilt, antenna glow, eye openness
    "calm": (0, .92, 1.0), "warm": (-8, 1.0, .94), "curious": (-20, 1.0, 1.1),
    "quiet": (8, .66, .74), "excited": (14, 1.0, 1.14),
}


def _wing(d, flip=False):
    s = ' transform="scale(-1,1)"' if flip else ""
    return f'<g{s}><path d="{d}" fill="{DARK}"/></g>'


def _P(wl, wr, tf="", eye=(0, 0), back="", front="", shut=False, anim=""):
    return {"wl": wl, "wr": wr, "tf": tf, "eye": eye,
            "back": back, "front": front, "shut": shut, "anim": anim}


def _pose(name):
    rest = "M-104 -150 C-150 -160 -158 -92 -124 -60 C-110 -48 -102 -62 -102 -80Z"

    if name == "wave":
        # one wing stretched straight up, well past the head, and it swings
        up = ('<g><path d="M104 -150 C150 -200 176 -268 158 -300 '
              'C146 -320 118 -306 108 -272 L96 -176Z" fill="%s">'
              '<animateTransform attributeName="transform" type="rotate" '
              'values="-14 104 -150; 14 104 -150; -14 104 -150" dur="%ss" '
              'repeatCount="indefinite"/></path></g>' % (DARK, LOOP))
        return _P(_wing(rest), up)

    if name == "point":
        # wing extended horizontally, long and straight, clearly pointing
        pt = (f'<path d="M100 -132 C168 -140 236 -136 268 -126 '
              f'C282 -122 282 -104 268 -100 C236 -90 168 -86 100 -94Z" fill="{DARK}"/>'
              f'<circle cx="286" cy="-113" r="13" fill="{GLOW}">'
              f'<animate attributeName="r" values="11;16;11" dur="{LOOP}s" '
              f'repeatCount="indefinite"/></circle>')
        return _P(_wing(rest), pt, eye=(16, 0))

    if name == "cheer":
        # both wings up in a V, whole body hops
        v = ('M104 -150 C156 -196 190 -254 174 -282 C162 -302 132 -290 '
             '120 -258 L96 -176Z')
        hop = (f'<animateTransform attributeName="transform" type="translate" '
               f'values="0,0; 0,-30; 0,0" dur="{LOOP}s" repeatCount="indefinite" '
               f'additive="sum"/>')
        return _P(_wing(v, flip=True), _wing(v), eye=(0, -4),
                  back=_sparkles(), anim=hop)

    if name == "think":
        # one wing bent up to the chin, head tilted, eyes glance up
        chin = (f'<path d="M100 -140 C150 -150 168 -120 152 -96 '
                f'C140 -78 112 -84 96 -100Z" fill="{DARK}"/>'
                f'<path d="M150 -104 C168 -108 178 -124 170 -140" stroke="{DARK}" '
                f'stroke-width="18" fill="none" stroke-linecap="round"/>')
        return _P(_wing(rest), chin, ' transform="rotate(-9)"', (6, -12),
                  back=_dots())

    if name == "peek":
        # leaning hard to one side, eyes cut to the edge of the frame
        return _P(_wing(rest), _wing(rest, flip=True),
                  ' transform="translate(40,0) rotate(-13)"', (-22, 2))

    if name == "read":
        # both wings forward holding a book, head down
        hold = ('M104 -120 C148 -112 164 -78 146 -58 C132 -42 104 -54 96 -74Z')
        book = (f'<g transform="translate(0,-48)">'
                f'<path d="M-112 -6 L0 -30 L112 -6 L112 62 L0 40 L-112 62Z" fill="{GLOW}"/>'
                f'<path d="M-112 -6 L0 -30 L112 -6 L112 62 L0 40 L-112 62Z" fill="none" '
                f'stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>'
                f'<path d="M0 -30 L0 40" stroke="{INK}" stroke-width="8"/>'
                f'<path d="M-84 12 L-24 1 M-84 32 L-24 21" stroke="{INK}" '
                f'stroke-width="6" opacity=".4" stroke-linecap="round"/>'
                f'<path d="M84 12 L24 1 M84 32 L24 21" stroke="{INK}" '
                f'stroke-width="6" opacity=".4" stroke-linecap="round"/></g>')
        return _P(_wing(hold, flip=True), _wing(hold), ' transform="rotate(7)"',
                  (0, 14), front=book)

    if name == "sleep":
        # slumped, wings tucked low, Zzz drifting up
        tuck = "M-100 -104 C-134 -104 -140 -62 -116 -46 C-104 -38 -98 -52 -98 -68Z"
        z = []
        for i, (x, y, s) in enumerate([(150, -210, 1.0), (200, -270, .76), (242, -318, .56)]):
            z.append(f'<text x="{x}" y="{y}" font-family="Verdana,system-ui" '
                     f'font-size="{int(66*s)}" font-weight="700" fill="{DARK}" '
                     f'opacity=".8">z<animate attributeName="opacity" '
                     f'values="0;.85;0" dur="{LOOP*1.5}s" begin="-{i*0.5:.1f}s" '
                     f'repeatCount="indefinite"/></text>')
        return _P(_wing(tuck), _wing(tuck, flip=True),
                  ' transform="rotate(13) translate(0,16)"', back="".join(z), shut=True)

    if name == "lost":
        # wings hanging, body small and sunken, eyes narrow
        droop = "M-100 -120 C-136 -104 -140 -48 -118 -30 C-106 -20 -98 -40 -98 -62Z"
        q = (f'<text x="150" y="-230" font-family="Verdana,system-ui" font-size="92" '
             f'font-weight="700" fill="{DARK}" opacity=".55">?'
             f'<animate attributeName="opacity" values=".2;.7;.2" dur="{LOOP}s" '
             f'repeatCount="indefinite"/></text>')
        return _P(_wing(droop), _wing(droop, flip=True),
                  ' transform="translate(0,20) scale(.92)"', (0, 8), back=q)

    return _P(_wing(rest), _wing(rest, flip=True))


def _sparkles():
    out = []
    for i, (x, y, r) in enumerate([(-230, -250, 20), (240, -230, 16), (-170, -330, 13),
                                   (190, -340, 18)]):
        out.append(
            f'<path transform="translate({x},{y})" d="M0,-{r} L{r*.3:.0f},-{r*.3:.0f} '
            f'L{r},0 L{r*.3:.0f},{r*.3:.0f} L0,{r} L-{r*.3:.0f},{r*.3:.0f} L-{r},0 '
            f'L-{r*.3:.0f},-{r*.3:.0f}Z" fill="{GLOW}">'
            f'<animate attributeName="opacity" values=".25;1;.25" dur="{LOOP}s" '
            f'begin="-{i*.35:.2f}s" repeatCount="indefinite"/></path>')
    return "".join(out)


def _dots():
    out = []
    for i, (x, y, r) in enumerate([(176, -214, 11), (214, -256, 15), (258, -308, 21)]):
        out.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{DARK}" opacity=".5">'
                   f'<animate attributeName="opacity" values=".12;.7;.12" dur="{LOOP}s" '
                   f'begin="-{i*.4:.1f}s" repeatCount="indefinite"/></circle>')
    return "".join(out)


POSES = ["stand", "wave", "point", "cheer", "think", "peek", "read", "sleep", "lost"]


def pip(x=540, y=700, scale=1.0, mood="calm", pose="stand"):
    tilt, glow, open_ = MOOD.get(mood, MOOD["calm"])
    P = _pose(pose)
    wl, wr, body_tf, shut = P["wl"], P["wr"], P["tf"], P["shut"]
    ex, ey = P["eye"]
    ry = 46 * open_
    if shut:
        eyes = (f'<path d="M-82 -148 q38 26 76 0" stroke="{INK}" stroke-width="11" '
                f'fill="none" stroke-linecap="round"/>'
                f'<path d="M6 -148 q38 26 76 0" stroke="{INK}" stroke-width="11" '
                f'fill="none" stroke-linecap="round"/>')
    else:
        eyes = (f'<ellipse cx="-44" cy="-148" rx="42" ry="{ry:.0f}" fill="{CREAM}"/>'
                f'<ellipse cx="44" cy="-148" rx="42" ry="{ry:.0f}" fill="{CREAM}"/>'
                f'<ellipse cx="{-44+ex}" cy="{-148+ey}" rx="26" ry="{ry*.64:.0f}" fill="{INK}"/>'
                f'<ellipse cx="{44+ex}" cy="{-148+ey}" rx="26" ry="{ry*.64:.0f}" fill="{INK}"/>'
                f'<circle cx="{-36+ex}" cy="{-160+ey}" r="9" fill="{CREAM}" opacity=".92"/>'
                f'<circle cx="{52+ex}" cy="{-160+ey}" r="9" fill="{CREAM}" opacity=".92"/>'
                f'<animateTransform attributeName="transform" type="scale" '
                f'values="1 1;1 .08;1 1" dur="{LOOP}s" keyTimes="0;.9;.95" '
                f'repeatCount="indefinite"/>')

    return f"""<g transform="translate({x},{y}) scale({scale})">
 <g{body_tf}>
  <g filter="url(#paint)">
   <animateTransform attributeName="transform" type="translate"
     values="0,0; 0,-9; 0,0" dur="{LOOP}s" repeatCount="indefinite" additive="sum"/>
   {P["anim"]}
   <ellipse cx="0" cy="14" rx="120" ry="20" fill="{INK}" opacity=".18"/>
   {P["back"]}
   <g transform="translate(0,0)">
     <path d="M-44 -18 l0 26 q0 10 -14 12 l-16 2 q-8 1 -8 -6 q0 -6 8 -8 l14 -4 l0 -22z"
           fill="{BEAK}"/>
     <path d="M44 -18 l0 26 q0 10 14 12 l16 2 q8 1 8 -6 q0 -6 -8 -8 l-14 -4 l0 -22z"
           fill="{BEAK}"/>
   </g>
   {wl}
   <path d="M-112 -56 C-112 -236 112 -236 112 -56 C112 -14 62 -6 0 -6
            C-62 -6 -112 -14 -112 -56Z" fill="{BODY}"/>
   <ellipse cx="0" cy="-62" rx="66" ry="54" fill="{CREAM}"/>
   {wr}
   <g>{eyes}</g>
   <polygon points="-18,-116 0,-92 18,-116" fill="{BEAK}"/>
   {P["front"]}
   <g transform="rotate({tilt} 0 -214)">
     <line x1="0" y1="-198" x2="0" y2="-256" stroke="{DARK}" stroke-width="13"
           stroke-linecap="round"/>
     <circle cx="0" cy="-266" r="15" fill="{GLOW}" opacity="{glow}">
       <animate attributeName="r" values="15;19;15" dur="{LOOP}s" repeatCount="indefinite"/>
     </circle>
   </g>
  </g>
 </g>
</g>"""
