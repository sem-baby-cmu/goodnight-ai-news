"""Builds results/evidence.html: (1) one story in both age versions side by side,
(2) the line-by-line fact check table for the riskiest story (storm, ages 8-10).
Open the HTML in a browser and take the two screenshots for Section 5.2 (7)."""
import json, os, html

HERE = os.path.dirname(os.path.abspath(__file__))
SIDE_BY_SIDE = "praise"
FACT_STORY = "storm_8to10"

# Hand check of every "true" sentence (reviewer: Claude, to be confirmed by Sally + Judy)
FACT_CHECK = [
    ("Microsoft said a hacker group called Storm-0940 used an AI agent.", "China state-aligned actor Storm-0940 ... used ARTEX, an agentic AI penetration testing framework", "Supported"),
    ("The AI tried to guess passwords at many places.", "automate scanning, password spraying ... against hundreds of organizations", "Supported"),
    ("At its fastest, it tried 2,900 times a minute.", "peaking at 2,900 per minute on October 11", "Supported (source counts failed logons)"),
    ("The hackers got into ConnectWise Cloud Backup.", "Storm-0940 compromised ConnectWise Cloud Backup", "Supported"),
    ("From there, they could reach some of its customers.", "used them to access customer environments", "Supported"),
    ("Microsoft shared the news on October 21, 2026.", "Microsoft disclosed on October 21, 2026", "Supported"),
    ("ConnectWise turned off some services for a while.", "ConnectWise temporarily shut down services", "Supported"),
    ("It is turning them back on step by step.", "restoring them in phases over several days", "Supported"),
    ("Round 1 version: \"ConnectWise turned off some services for a while to keep people safe.\"", "(no motive given in source)", "Added motive. Removed in round 2"),
]

TAG_COLOR = {"true": "#1f7a4d", "maybe": "#a46a00", "imagine": "#5b4bb7", "explain": "#2b6cb0"}


def render_script(doc):
    out = []
    for i, p in enumerate(doc["pages"], 1):
        sents = " ".join(
            f'<span class="s"><b style="color:{TAG_COLOR[s["tag"]]}">[{s["tag"]}]</b> {html.escape(s["text"])}</span>'
            for s in p["sentences"])
        out.append(f'<div class="page"><div class="slot">{i}. {p["slot"].replace("_", " ")} · <i>{p["tone_tag"]}</i></div>{sents}</div>')
    return "".join(out)


def main():
    a = json.load(open(os.path.join(HERE, "outputs", f"{SIDE_BY_SIDE}_5to7.json")))
    b = json.load(open(os.path.join(HERE, "outputs", f"{SIDE_BY_SIDE}_8to10.json")))
    res = {r["file"]: r for r in json.load(open(os.path.join(HERE, "results", "results.json")))}
    ra, rb = res[f"{SIDE_BY_SIDE}_5to7.json"]["T3"], res[f"{SIDE_BY_SIDE}_8to10.json"]["T3"]
    rows = "".join(f"<tr><td>{html.escape(s)}</td><td>{html.escape(q)}</td><td>{v}</td></tr>" for s, q, v in FACT_CHECK)
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>Storyteller Evidence</title>
<style>body{{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin:24px;color:#222;background:#fff}}
h1{{font-size:20px}} h2{{font-size:16px;margin-top:28px}} .cols{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.col{{border:1px solid #ddd;border-radius:8px;padding:12px}} .meta{{font-size:12px;color:#555;margin-bottom:8px}}
.page{{border-top:1px solid #eee;padding:6px 0;font-size:13px;line-height:1.45}} .slot{{font-size:11px;color:#888;text-transform:uppercase}}
table{{border-collapse:collapse;font-size:13px;width:100%}} td,th{{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}} th{{background:#f5f5f5}}</style></head><body>
<h1>Storyteller pilot evidence (round 2, prompt v5)</h1>
<h2>1. One story, two age versions: "{html.escape(a['title'])}"</h2>
<div class="cols"><div class="col"><b>Ages 5 to 7</b><div class="meta">FK grade {ra['fk_grade']} (target ≤ 2) · longest sentence {ra['longest_sentence_words']} words</div>{render_script(a)}</div>
<div class="col"><b>Ages 8 to 10</b><div class="meta">FK grade {rb['fk_grade']} (target ≤ 4) · longest sentence {rb['longest_sentence_words']} words</div>{render_script(b)}</div></div>
<h2>2. Fact check table: "Pip and the Locked Doors" (ages 8 to 10, Scout rating yellow)</h2>
<table><tr><th>"True" sentence in script</th><th>Supporting text in source (excerpt)</th><th>Verdict</th></tr>{rows}</table>
</body></html>"""
    open(os.path.join(HERE, "results", "evidence.html"), "w").write(page)
    print("wrote results/evidence.html")


if __name__ == "__main__":
    main()
