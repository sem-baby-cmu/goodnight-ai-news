"""Render one animation cycle as frames, for video.

Everything in parts.py shares a 2.0s period, so FPS * LOOP frames cover a whole
cycle. ffmpeg then repeats that run to fill however long the page needs, with
no visible seam.
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import parts  # noqa: E402

FPS = 12


def cycle(svg, out_dir, prefix, size, fps=FPS):
    """Write fps*LOOP PNGs sampling one full animation cycle."""
    from playwright.sync_api import sync_playwright
    out_dir = pathlib.Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    n = int(round(fps * parts.LOOP))
    paths = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--force-color-profile=srgb"])
        pg = b.new_page(viewport={"width": size[0], "height": size[1]},
                        device_scale_factor=1)
        pg.set_content(
            f'<style>html,body{{margin:0;background:#0E0C22}}'
            f'svg{{display:block;width:{size[0]}px;height:{size[1]}px}}</style>{svg}')
        pg.wait_for_timeout(260)
        for i in range(n):
            t = i * parts.LOOP / n
            pg.evaluate(f"document.querySelector('svg').setCurrentTime({t})")
            pg.wait_for_timeout(45)
            f = out_dir / f"{prefix}_{i:03d}.png"
            pg.screenshot(path=str(f))
            paths.append(f)
        b.close()
    return paths
