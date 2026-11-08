"""Render SVG scenes to PNG frames with headless Chromium.

Chromium is used instead of cairosvg because the prototype's paper-grain filter
relies on feTurbulence and feDisplacementMap, which only a browser renders
faithfully. SMIL animation also means a frame can be captured at a given time.
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import parts  # noqa: E402

W, H = 1600, 900


def render(svgs, out_dir, size=(W, H), at_seconds=None):
    """svgs: list of (name, svg_string). Returns list of written paths."""
    from playwright.sync_api import sync_playwright
    out_dir = pathlib.Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--force-color-profile=srgb"])
        pg = b.new_page(viewport={"width": size[0], "height": size[1]},
                        device_scale_factor=1)
        for name, svg in svgs:
            pg.set_content(
                f'<style>html,body{{margin:0;background:#0E0C22}}'
                f'svg{{display:block;width:{size[0]}px;height:{size[1]}px}}</style>{svg}')
            if at_seconds:
                # Freeze SMIL at a chosen moment so stills are not all identical.
                pg.evaluate(f"document.querySelector('svg').setCurrentTime({at_seconds})")
            pg.wait_for_timeout(220)   # let the filter settle
            path = out_dir / f"{name}.png"
            pg.screenshot(path=str(path))
            written.append(path)
        b.close()
    return written


if __name__ == "__main__":
    out = pathlib.Path(__file__).parent.parent / "results" / "scene_preview"
    jobs = [(t, parts.scene(t)) for t in parts.SKIES]
    for p in render(jobs, out, at_seconds=1.4):
        print("wrote", p.relative_to(p.parents[2]), p.stat().st_size // 1024, "KB")
