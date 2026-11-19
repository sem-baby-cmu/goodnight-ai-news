"""Pip as a robot owl, as one posable component.

This is the other answer to open issue S2 (what is Pip?). The robot in pip.py
follows the Goodnight, AI prototype; this owl follows the style guide and the
Storyteller script, which say "a little robot owl":

- soft blue body (#6C8BEF) with a cream chest plate (#FFF8E6)
- large round eyes that glow warm yellow, no pupils, no eyebrows
- two wing panels that fold flat against the body
- a short antenna with a round tip that tilts with mood
- no mouth: feeling is carried by eye glow, eye size and antenna tilt

It takes the same arguments, poses and moods as pip.pip(), and draws in the
same native frame (centre x 134, feet at y 276), so every scene, card and
sheet can swap one for the other without moving anything else.
"""
from pip import (LOOP, POSES, BODY, DEEP, EAR, EAR_LINE, BLUSH, INK, GLOW,
                 CREAM, CX, FEET, L_DOWN, R_DOWN, _P, _pose)

CHEST = "#FFF8E6"
DISC = "#8FA6F4"      # facial disc, a lighter blue than the body
FEATHER = "#E9DCC0"   # scallop lines on the chest plate

MOOD = {
    # antenna tilt, eye radius, glow core radius, blush opacity, halo opacity
    # Same keys as pip.MOOD. With no mouth, the eyes carry the mood: wide and
    # bright for excited, small and dim for quiet.
    "calm":    (0, 19.0, 9.0, 0.70, 0.30),
    "warm":    (-7, 19.5, 10.0, 0.95, 0.45),
    "curious": (-18, 21.5, 8.0, 0.65, 0.40),
    "quiet":   (9, 16.0, 6.5, 0.45, 0.15),
    "excited": (13, 23.0, 11.5, 0.95, 0.60),
}


def _wing(d):
    # A wing panel is a fat stroke with a darker edge, so it still poses as
    # cheaply as Pip's arms do.
    return (f'<path d="{d}" stroke="{DEEP}" stroke-width="25" fill="none" '
            f'stroke-linecap="round"/>'
            f'<path d="{d}" stroke="{BODY}" stroke-width="17" fill="none" '
            f'stroke-linecap="round"/>')


def _foot(x):
    return (f'<g stroke="{EAR}" stroke-width="6" fill="none" stroke-linecap="round">'
            f'<path d="M{x} 240 L{x} 268"/>'
            f'<path d="M{x} 268 l-10 8 M{x} 268 l0 9 M{x} 268 l10 8"/></g>')


def _feet(tuck):
    if tuck:
        return (f'<g transform="translate(0,-12)">{_foot(116)}{_foot(152)}</g>')
    return _foot(116) + _foot(152)


def owl(x=540, y=700, scale=1.0, mood="calm", pose="stand"):
    """Draw Pip the robot owl. (x, y) is the ground under her feet."""
    tilt, er, core, blush, halo = MOOD.get(mood, MOOD["calm"])
    P = _pose(pose)
    ex, ey = P["eye"]
    tuck = P["legs"] is not _P()["legs"]

    if P["shut"]:
        eyes = (f'<g stroke="{INK}" stroke-width="4" fill="none" stroke-linecap="round">'
                f'<path d="M92 120 C100 130 116 130 124 120"/>'
                f'<path d="M144 120 C152 130 168 130 176 120"/></g>')
    else:
        eyes = (f'<g filter="url(#fuzz)" opacity="{halo}">'
                f'<circle cx="108" cy="118" r="{er + 9}" fill="{GLOW}"/>'
                f'<circle cx="160" cy="118" r="{er + 9}" fill="{GLOW}"/></g>'
                f'<g filter="url(#ink)">'
                f'<circle cx="108" cy="118" r="{er}" fill="{GLOW}" stroke="{DEEP}" stroke-width="3"/>'
                f'<circle cx="160" cy="118" r="{er}" fill="{GLOW}" stroke="{DEEP}" stroke-width="3"/></g>'
                # No pupils: a brighter core drifts a little to show where she looks.
                f'<circle cx="{108 + ex}" cy="{118 + ey}" r="{core}" fill="{CREAM}" opacity=".9"/>'
                f'<circle cx="{160 + ex}" cy="{118 + ey}" r="{core}" fill="{CREAM}" opacity=".9"/>'
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
    <ellipse cx="134" cy="278" rx="70" ry="12" fill="{INK}" opacity=".16"/>
    {P["back"]}
    {_feet(tuck)}
    <path d="M82 76 L74 40 C90 46 102 56 108 66 Z" fill="{BODY}" stroke="{DEEP}"
          stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M186 76 L194 40 C178 46 166 56 160 66 Z" fill="{BODY}" stroke="{DEEP}"
          stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M134 60 C176 60 200 88 200 130 C200 180 192 222 166 236
             C150 244 118 244 102 236 C76 222 68 180 68 130 C68 88 92 60 134 60Z"
          fill="{BODY}"/>
    <path d="M134 152 C160 152 172 172 170 198 C168 222 154 234 134 234
             C114 234 100 222 98 198 C96 172 108 152 134 152Z" fill="{CHEST}"/>
    <g stroke="{FEATHER}" stroke-width="2.4" fill="none" stroke-linecap="round">
     <path d="M112 182 q7 7 14 0 q8 7 16 0 q7 7 14 0"/>
     <path d="M114 202 q6 7 13 0 q7 7 14 0 q6 7 13 0"/>
     <path d="M120 220 q7 6 14 0 q7 6 14 0"/></g>
    <circle cx="108" cy="118" r="34" fill="{DISC}"/>
    <circle cx="160" cy="118" r="34" fill="{DISC}"/>
    <circle cx="84" cy="146" r="9" fill="{BLUSH}" opacity="{blush}" filter="url(#fuzz)"/>
    <circle cx="184" cy="146" r="9" fill="{BLUSH}" opacity="{blush}" filter="url(#fuzz)"/>
    {eyes}
    <path d="M128 140 L140 140 L134 152 Z" fill="{EAR}" stroke="{EAR_LINE}"
          stroke-width="2" stroke-linejoin="round"/>
    {_wing(P["al"])}{_wing(P["ar"])}
    {P["front"]}
    <g transform="rotate({tilt} 134 60)">
     <path d="M134 60 L134 38" stroke="{CREAM}" stroke-width="3.5"
           stroke-linecap="round"/>
     <circle cx="134" cy="32" r="7.5" fill="{GLOW}"/>
    </g>
   </g>
  </g>
 </g>
</g>"""
