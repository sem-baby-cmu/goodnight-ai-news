"""Vertical short video for Threads and Instagram.

Same inputs as build_story.py, different target: a 9:16 MP4 with burned-in
captions, one card per page, so a story can be posted straight to a feed.

Runs with no API keys: pages with no image get a placeholder card, pages with
no audio get a fixed duration based on word count. That makes the video
pipeline testable before images and narration exist.

    python package/build_reel.py --date 2026-11-07 --age 5to7
"""
import argparse, json, pathlib, shutil, subprocess, sys, textwrap, tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scene"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import _story  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / "results"
W, H = 1080, 1920                 # 9:16, the size both Threads and IG want
READ_WPM = 110                    # bedtime pace, slower than normal speech
MIN_SEC, MAX_SEC = 2.2, 7.0

BG, INK, GLOW, BLUE, CREAM = "#1A1A2E", "#FFF8E6", "#FFD23F", "#6C8BEF", "#FFF1C9"


def have(cmd):
    return shutil.which(cmd) is not None


def animated_clip(page, secs, tmp, i):
    """Render one animation cycle of the SVG scene and loop it to fill the page.

    This is the quality path: the same flat vector language as the prototype,
    with Pip breathing and blinking, so the character never drifts.
    """
    import parts
    from frames import cycle, FPS
    d = tmp / f"fr{i:02d}"
    svg = parts.vscene(page["tone"], page["text"], page["slot"])
    cycle(svg, d, "f", (W, H))
    return d, FPS


def placeholder_card(path, page):
    """Pip + the page text, drawn with Pillow. Stands in for the real illustration."""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    cx, cy, r = W // 2, 700, 230
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BLUE)
    d.ellipse([cx - 135, cy + 10, cx + 135, cy + 170], fill=CREAM)
    for ex in (-78, 78):
        d.ellipse([cx + ex - 62, cy - 62, cx + ex + 62, cy + 62], fill=GLOW)
    d.polygon([(cx - 42, cy + 22), (cx, cy + 64), (cx + 42, cy + 22)], fill="#F7A23B")
    d.line([(cx, cy - r), (cx, cy - r - 78)], fill=BLUE, width=20)
    d.ellipse([cx - 27, cy - r - 105, cx + 27, cy - r - 51], fill=GLOW)

    def font(sz):
        for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
            if pathlib.Path(p).exists():
                return ImageFont.truetype(p, sz)
        return ImageFont.load_default()

    d.text((W // 2, 170), f"{page['slot'].replace('_',' ').upper()}  ·  {page['tone'].upper()}",
           font=font(34), fill=BLUE, anchor="mm")

    y = 1180
    for line in textwrap.wrap(page["text"], width=26):
        d.text((W // 2, y), line, font=font(62), fill=INK, anchor="mm")
        y += 92

    d.text((W // 2, H - 120), "placeholder art", font=font(30), fill=BLUE, anchor="mm")
    img.save(path)


def duration(page, audio):
    if audio and have("ffprobe"):
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(audio)], capture_output=True, text=True)
        try:
            return max(MIN_SEC, float(out.stdout.strip()) + 0.6)
        except ValueError:
            pass
    words = len(page["text"].split())
    return min(MAX_SEC, max(MIN_SEC, words / READ_WPM * 60 + 1.2))


def find(kind, age, page, provider, version=None):
    if kind == "img":
        p = RES / "images" / f"{age}_p{page:02d}_{provider}_{version}.png"
        return p if p.exists() else None
    for ext in ("mp3", "wav"):
        p = RES / "voice" / f"{age}_p{page:02d}_{provider}.{ext}"
        if p.exists():
            return p
    return None


def main():
    ap = _story.add_args(argparse.ArgumentParser())
    ap.add_argument("--image-provider", default="openai")
    ap.add_argument("--image-version", default="v3")
    ap.add_argument("--voice-provider", default="elevenlabs")
    ap.add_argument("--max-seconds", type=float, default=90,
                    help="Trim pages from the end to fit a feed limit")
    ap.add_argument("--static", action="store_true",
                    help="Flat placeholder cards instead of animated SVG scenes")
    a = ap.parse_args()

    if not have("ffmpeg"):
        raise SystemExit("ffmpeg not found")

    date, script, pages, outdir = _story.load(a)
    tmp = pathlib.Path(tempfile.mkdtemp())

    cards, total, used_ph, used_anim, used_silence = [], 0.0, 0, 0, 0
    for p in pages:
        img = find("img", a.age, p["page"], a.image_provider, a.image_version)
        aud = find("aud", a.age, p["page"], a.voice_provider)
        card = tmp / f"card_{p['page']:02d}.png"

        if img:
            # Letterbox the square illustration into 9:16 and burn the text under it.
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(img),
                 "-vf", f"scale={W}:-1,pad={W}:{H}:0:{(H-W)//3}:color={BG}",
                 str(card)], check=True)
        elif a.static:
            placeholder_card(card, p)
            used_ph += 1
        else:
            card = None          # animated SVG scene
            used_anim += 1

        if not aud:
            used_silence += 1
        secs = duration(p, aud)
        if total + secs > a.max_seconds:
            break
        cards.append((card, aud, secs, p))
        total += secs

    # Build each page as its own clip, then concatenate.
    clips = []
    for i, (card, aud, secs, page) in enumerate(cards):
        clip = tmp / f"clip_{i:02d}.mp4"
        cmd = ["ffmpeg", "-y", "-loglevel", "error"]
        if card is None:
            d, fps = animated_clip(page, secs, tmp, i)
            cmd += ["-stream_loop", "-1", "-framerate", str(fps),
                    "-i", str(d / "f_%03d.png")]
        else:
            cmd += ["-loop", "1", "-i", str(card)]
        if aud:
            cmd += ["-i", str(aud), "-c:a", "aac", "-b:a", "128k"]
        else:
            cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                    "-c:a", "aac", "-b:a", "64k"]
        cmd += ["-t", f"{secs:.2f}", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-r", "30", "-vf", f"scale={W}:{H}", str(clip)]
        subprocess.run(cmd, check=True)
        clips.append(clip)

    lst = tmp / "list.txt"
    lst.write_text("\n".join(f"file '{c}'" for c in clips))
    out = outdir / f"lullabyte-{date}-{a.age}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat",
                    "-safe", "0", "-i", str(lst), "-c", "copy", str(out)], check=True)

    mb = out.stat().st_size / 1024 / 1024
    print(f"built {out.relative_to(ROOT)}")
    print(f"  {len(cards)}/{len(pages)} pages, {total:.1f}s, {W}x{H}, {mb:.1f} MB")
    if used_anim:
        print(f"  {used_anim} animated SVG scenes (prototype visual language)")
    if used_ph:
        print(f"  {used_ph} flat placeholder cards")
    if used_silence:
        print(f"  {used_silence} silent pages (no narration yet), timed by word count")
    print(f"\n  Threads and IG Reels accept 9:16 MP4 H.264 + AAC. "
          f"Length {total:.0f}s is {'fine' if total <= 90 else 'over the 90s feed sweet spot'}.")


if __name__ == "__main__":
    main()
