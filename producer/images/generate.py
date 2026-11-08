"""P1, P2: image generation test.

Runs each page of a script through 2 providers x 4 prompt versions, saves every
image, and writes a cost and timing log plus an HTML contact sheet for review.

Needs: OPENAI_API_KEY and/or GEMINI_API_KEY in the environment.
    pip install openai google-genai pillow
    python images/generate.py --script input/pip_helper_school.json --age 5to7
"""
import argparse, base64, json, os, pathlib, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "results" / "images"

# v1 scene only. v2 adds the character sheet. v3 adds the style guide.
# v4 adds a reference image (handled separately per provider).
PROMPT_VERSIONS = ["v1", "v2", "v3", "v4"]


def load_block(path, heading):
    """Pull one '## heading' section out of the style guide."""
    text = (ROOT / path).read_text()
    out, keep = [], False
    for line in text.splitlines():
        if line.startswith("## "):
            keep = heading.lower() in line.lower()
            continue
        if keep:
            out.append(line)
    return "\n".join(out).strip()


def build_prompt(page, version, character, style, tone_map):
    scene = page["scene_description"]
    if scene.startswith("PLACEHOLDER:"):
        scene = scene[len("PLACEHOLDER:"):].strip()
    parts = [f"Children's picture book illustration. {scene}."]
    if version in ("v2", "v3", "v4"):
        parts.append(f"The character: {character}")
    if version in ("v3", "v4"):
        parts.append(f"Visual style: {style}")
        parts.append(f"Lighting for a {page['tone']} page: {tone_map.get(page['tone'], '')}")
        parts.append("No text, letters or numbers. No logos. Nothing frightening.")
    return " ".join(p for p in parts if p)


def gen_openai(prompt, ref=None):
    from openai import OpenAI
    t0 = time.time()
    r = OpenAI().images.generate(
        model="gpt-image-1", prompt=prompt, size="1024x1024", n=1)
    return base64.b64decode(r.data[0].b64_json), time.time() - t0


def gen_gemini(prompt, ref=None):
    from google import genai
    t0 = time.time()
    c = genai.Client()
    r = c.models.generate_images(
        model="imagen-4.0-generate-001", prompt=prompt,
        config={"number_of_images": 1, "aspect_ratio": "1:1"})
    return r.generated_images[0].image.image_bytes, time.time() - t0


PROVIDERS = {"openai": gen_openai, "gemini": gen_gemini}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--age", default="5to7", choices=["5to7", "8to10"])
    ap.add_argument("--pages", default="", help="e.g. 1,2,5. Default: all")
    ap.add_argument("--providers", default="openai,gemini")
    ap.add_argument("--versions", default=",".join(PROMPT_VERSIONS))
    a = ap.parse_args()

    script = json.loads((ROOT / a.script).read_text())
    pages = script[f"script_{a.age}"]
    if a.pages:
        want = {int(x) for x in a.pages.split(",")}
        pages = [p for p in pages if p["page"] in want]

    character = load_block("style_guide.md", "Pip character sheet")
    style = load_block("style_guide.md", "Visual style")
    tone_map = {}
    for line in load_block("style_guide.md", "Tone to lighting").splitlines():
        if line.startswith("|") and "|" in line[1:]:
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) == 2 and not cells[0].startswith(("Tone", ":--", "---")):
                tone_map[cells[0]] = cells[1]

    OUT.mkdir(parents=True, exist_ok=True)
    log = []
    for prov in a.providers.split(","):
        fn = PROVIDERS[prov]
        for ver in a.versions.split(","):
            for page in pages:
                prompt = build_prompt(page, ver, character, style, tone_map)
                name = f"{a.age}_p{page['page']:02d}_{prov}_{ver}.png"
                row = {"provider": prov, "version": ver, "page": page["page"],
                       "age": a.age, "file": name, "prompt": prompt}
                try:
                    data, secs = fn(prompt)
                    (OUT / name).write_bytes(data)
                    row.update(seconds=round(secs, 1), bytes=len(data), ok=True)
                    print(f"ok   {name}  {secs:.1f}s  {len(data)//1024}KB")
                except Exception as e:
                    row.update(ok=False, error=str(e)[:300])
                    print(f"FAIL {name}  {e}")
                log.append(row)
                (ROOT / "results" / "images_log.json").write_text(
                    json.dumps(log, indent=2))

    contact_sheet(log, a.age)
    ok = sum(1 for r in log if r.get("ok"))
    print(f"\n{ok}/{len(log)} images. Log: results/images_log.json")
    print("Review: results/contact_sheet.html")


def contact_sheet(log, age):
    """One row per page, one column per provider+version, for eyeballing P1 and P2."""
    cols = sorted({(r["provider"], r["version"]) for r in log})
    pages = sorted({r["page"] for r in log})
    by = {(r["page"], r["provider"], r["version"]): r for r in log}
    h = ["<!doctype html><meta charset=utf-8><title>Producer image test</title>",
         "<style>body{font:14px system-ui;background:#1A1A2E;color:#FFF8E6;padding:20px}",
         "table{border-collapse:collapse}td,th{padding:6px;text-align:center;vertical-align:top}",
         "img{width:200px;border-radius:8px;display:block}.f{color:#E8483A;font-size:12px}</style>",
         f"<h1>Image test, ages {age}</h1>",
         "<p>P1: is every image kid safe and in one style? "
         "P2: does Pip look the same across pages?</p><table><tr><th>page</th>"]
    h += [f"<th>{p}<br>{v}</th>" for p, v in cols]
    h.append("</tr>")
    for pg in pages:
        h.append(f"<tr><th>{pg}</th>")
        for p, v in cols:
            r = by.get((pg, p, v))
            if r and r.get("ok"):
                h.append(f'<td><img src="images/{r["file"]}"></td>')
            else:
                h.append(f'<td class=f>{(r or {}).get("error", "-")[:60]}</td>')
        h.append("</tr>")
    h.append("</table>")
    (ROOT / "results" / "contact_sheet.html").write_text("\n".join(h))


if __name__ == "__main__":
    main()
