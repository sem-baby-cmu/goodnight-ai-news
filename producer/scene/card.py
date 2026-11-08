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
import world  # noqa: E402

W, H = 1080, 1350
# Grandstander: rounded and playful, drawn for children's reading. Heavy enough
# to hold against a night sky, with normal letter spacing so it stays quick to
# read. Fredoka is the fallback with the closest metrics.
FONT = "Grandstander, Fredoka, Nunito, sans-serif"
FONT_VAR = "font-variation-settings:'wght' 700"
SHOW_TAGS = False
PAPER, INK, GLOW, SOFT = "#FFF4DE", "#101A33", "#FFD23F", "#A8B0D6"

# story beat -> pose. Time and place come from the script's own setting.
BEAT = {
    "cover": "wave", "character": "read", "news_discovery": "point",
    "exploration": "peek", "challenge": "lost", "turning_point": "stand",
    "resolution": "cheer", "reflection": "sleep", "real_world_facts": "point",
    "quiz": "think",
}
DEFAULT_SETTING = {"time": "night", "place": "street"}

TAG_COLOR = {"true": "#5FD6A0", "maybe": "#FFC266",
             "imagine": "#C3A6FF", "explain": "#8FC2FF"}

# The tags are how the product teaches media literacy, but "true / maybe /
# imagine / explain" are our words, not a parent's. On a feed card they get
# spelled out. The slot name (COVER, CHARACTER...) is purely our story
# structure and never appears.
TAG_LABEL = {"true": "really happened", "maybe": "not sure yet",
             "imagine": "story part", "explain": "what it means"}


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
    pose = BEAT.get(page["slot"], "stand")
    s = page.get("setting", DEFAULT_SETTING)
    time, place = s.get("time", "night"), s.get("place", "street")
    back, front = world.place(place, time)
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
<defs>{parts.PAINT_FILTER}{world.sky(time)}
 <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#05040E" stop-opacity="{.80 if time == 'day' else .88}"/>
  <stop offset=".72" stop-color="#05040E" stop-opacity="{.62 if time == 'day' else .66}"/>
  <stop offset="1" stop-color="#05040E" stop-opacity="0"/>
 </linearGradient></defs>

<rect width="{W}" height="{H}" fill="url(#sky)"/>
{world.clouds(time)}
{world.stars(time)}
{world.light(time)}
{back}
{pip(W//2, world.GROUND_Y + 58, 1.16, tone, pose)}
{front}
<rect x="0" y="0" width="{W}" height="{band:.0f}" fill="url(#band)"/>

{head}
{"".join(chips)}
<text x="64" y="{H-58}" font-family="{FONT}" font-size="26"
 font-weight="700" fill="{PAPER}" opacity=".62">Lullabyte</text>
<text x="{W-64}" y="{H-58}" text-anchor="end" font-family="{FONT}"
 font-size="26" font-weight="700" fill="{PAPER}" opacity=".62">{page["page"]} / {total}</text>
</svg>"""
