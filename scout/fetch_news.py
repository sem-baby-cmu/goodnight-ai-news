"""
Scout: News sources -> daily AI news (test S1)

Pulls AI news from 4 RSS feeds, removes duplicates, and saves today's
stories as JSON in the format Storyteller expects.

Run once a day (Wed, Thu, Fri) for test S1:
    python fetch_news.py

Output:
    data/YYYY-MM-DD.json   today's deduplicated stories
    s1_counts.csv          one row per run: date, raw count, unique count
No extra packages needed (Python 3.9+ standard library only).
"""

import csv
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from pathlib import Path

FEEDS = {
    "TechCrunch AI": "https://techcrunch.com/category/artificial-intelligence/feed/",
    "MIT Technology Review AI": "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    "The Verge AI": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    "OpenAI News": "https://openai.com/news/rss.xml",
}

SIMILARITY = 0.75          # titles this similar are treated as the same story
MIN_STORIES_PER_DAY = 3    # S1 pass bar
HERE = Path(__file__).parent
DATA_DIR = HERE / "data"
COUNTS_FILE = HERE / "s1_counts.csv"
ATOM = "{http://www.w3.org/2005/Atom}"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "goodnight-ai-scout/0.1"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read()


def clean(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", text).strip()


def parse_date(value):
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return value


def parse_feed(source, raw):
    root = ET.fromstring(raw)
    stories = []
    for item in root.iter("item"):  # RSS 2.0
        stories.append({
            "title": clean(item.findtext("title")),
            "summary": clean(item.findtext("description")),
            "date": parse_date(item.findtext("pubDate")),
            "link": (item.findtext("link") or "").strip(),
            "source": source,
        })
    for entry in root.iter(f"{ATOM}entry"):  # Atom
        link_el = entry.find(f"{ATOM}link")
        stories.append({
            "title": clean(entry.findtext(f"{ATOM}title")),
            "summary": clean(entry.findtext(f"{ATOM}summary") or entry.findtext(f"{ATOM}content")),
            "date": parse_date(entry.findtext(f"{ATOM}updated") or entry.findtext(f"{ATOM}published")),
            "link": link_el.get("href", "") if link_el is not None else "",
            "source": source,
        })
    return [s for s in stories if s["title"]]


def norm(title):
    return re.sub(r"[^a-z0-9 ]", "", title.lower())


def dedupe(stories):
    """Merge stories with the same link or very similar titles.
    A story covered by several outlets keeps every source link
    (the draft's expected insight: multi-source = trust signal)."""
    unique = []
    for s in stories:
        for u in unique:
            same_link = s["link"] and s["link"] in u["source_links"]
            similar = SequenceMatcher(None, norm(s["title"]), norm(u["title"])).ratio() >= SIMILARITY
            if same_link or similar:
                if s["link"] and s["link"] not in u["source_links"]:
                    u["source_links"].append(s["link"])
                if s["source"] not in u["sources"]:
                    u["sources"].append(s["source"])
                break
        else:
            unique.append({
                "title": s["title"],
                "summary": s["summary"],
                "date": s["date"],
                "sources": [s["source"]],
                "source_links": [s["link"]] if s["link"] else [],
                # Filled in by later Scout tests (S3 to S5):
                "full_text": None,
                "claims": [],
                "confidence": None,
                "first_rating": None,
            })
    return unique


def main():
    today = datetime.now().strftime("%Y-%m-%d")
    all_stories, per_feed, errors = [], {}, {}
    for source, url in FEEDS.items():
        try:
            items = parse_feed(source, fetch(url))
            per_feed[source] = len(items)
            all_stories.extend(items)
        except Exception as exc:  # a failed feed is a finding, not a crash
            per_feed[source] = 0
            errors[source] = str(exc)

    unique = dedupe(all_stories)
    multi = [u for u in unique if len(u["sources"]) > 1]
    # Stories published in the last 24 hours (RSS also returns older items)
    now = datetime.now(timezone.utc)
    recent = []
    for u in unique:
        try:
            if (now - datetime.fromisoformat(u["date"])).total_seconds() <= 86400:
                recent.append(u)
        except (TypeError, ValueError):
            pass

    DATA_DIR.mkdir(exist_ok=True)
    out = DATA_DIR / f"{today}.json"
    out.write_text(json.dumps({
        "run_date": today,
        "feeds": per_feed,
        "errors": errors,
        "raw_count": len(all_stories),
        "unique_count": len(unique),
        "last_24h_count": len(recent),
        "multi_source_count": len(multi),
        "stories": unique,
    }, indent=2, ensure_ascii=False))

    new_file = not COUNTS_FILE.exists()
    with COUNTS_FILE.open("a", newline="") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["run_date", "raw_count", "unique_count", "last_24h_count", "multi_source_count", "pass"])
        w.writerow([today, len(all_stories), len(unique), len(recent), len(multi),
                    "yes" if len(recent) >= MIN_STORIES_PER_DAY else "no"])

    print(f"Scout run {today}")
    for source, n in per_feed.items():
        print(f"  {source}: {n} items" + (f"  (ERROR: {errors[source]})" if source in errors else ""))
    print(f"Raw: {len(all_stories)} | Unique: {len(unique)} | Last 24h: {len(recent)} | In 2+ sources: {len(multi)}")
    print(f"S1 today: {'PASS' if len(recent) >= MIN_STORIES_PER_DAY else 'FAIL'} (need {MIN_STORIES_PER_DAY}+ new stories)")
    print(f"Saved: {out}")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
