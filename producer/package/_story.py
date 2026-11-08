"""Shared input resolution for the build targets.

Lullabyte is keyed by date: `--date` (default today) reads input/<date>.json
and output goes to results/<date>/. `--script` stays as an escape hatch for a
file kept somewhere else.
"""
import argparse, datetime as dt, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / "results"


def add_args(ap):
    ap.add_argument("--date", help="story date, YYYY-MM-DD. Default: today")
    ap.add_argument("--script", help="override the input path")
    ap.add_argument("--age", default="5to7", choices=["5to7", "8to10"])
    return ap


def load(a):
    """Returns (date, script dict, pages for the chosen age, output dir)."""
    date = a.date or dt.date.today().isoformat()
    src = pathlib.Path(a.script) if a.script else ROOT / "input" / f"{date}.json"
    if not src.is_absolute():
        src = ROOT / src
    if not src.exists():
        raise SystemExit(f"no story for {date}: {src} not found.\n"
                         f"Available: "
                         f"{', '.join(sorted(p.stem for p in (ROOT/'input').glob('*.json'))) or 'none'}")
    script = json.loads(src.read_text())
    date = script.get("date", date)
    out = RES / date
    out.mkdir(parents=True, exist_ok=True)
    return date, script, script[f"script_{a.age}"], out
