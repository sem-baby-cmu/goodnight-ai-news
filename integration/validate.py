#!/usr/bin/env python3
"""Check story.json files against story.schema.json. Standard library only.

  python3 -I integration/validate.py path/to/story.json [more.json ...]
  python3 -I integration/validate.py --owner Storyteller path/to/story.json

Without --owner: full check. Use it on the file you RECEIVE. A failure is the
producer's bug, so report it; do not patch the file by hand.
With --owner X: check only the top-level fields whose x-owner is X. Use it on
the file you PRODUCE, before you hand it off. For --owner Scout, the file keeps
Scout's own field `title`; the check reads it as source_title.

Exit code 0 = all files pass, 1 = at least one error, 2 = usage or read error.
Supports the schema subset used in story.schema.json: type, enum, required,
properties, items, $ref, minItems, maxItems, minimum, maximum, minLength,
pattern, uniqueItems.
"""
import json
import re
import sys
from pathlib import Path

SCHEMA = json.loads((Path(__file__).parent / "story.schema.json").read_text())
TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool,
         "object": dict, "array": list}


def check(value, schema, path, errors):
    if "$ref" in schema:
        schema = SCHEMA["$defs"][schema["$ref"].rsplit("/", 1)[-1]]
    t = schema.get("type")
    if t:
        ok = isinstance(value, TYPES[t]) and not (t in ("integer", "number") and isinstance(value, bool))
        if not ok:
            errors.append(f"{path}: expected {t}, got {type(value).__name__}")
            return
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: {value!r} not in {schema['enum']}")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{path}: empty string")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{path}: {value!r} does not match {schema['pattern']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: {value} < {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: {value} > {schema['maximum']}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", 10**9):
            errors.append(f"{path}: {len(value)} items, want {schema.get('minItems', 0)}..{schema.get('maxItems', 'any')}")
        if schema.get("uniqueItems") and len({json.dumps(v, sort_keys=True) for v in value}) != len(value):
            errors.append(f"{path}: duplicate items")
        for i, v in enumerate(value):
            if "items" in schema:
                check(v, schema["items"], f"{path}[{i}]", errors)
    if isinstance(value, dict):
        for k in schema.get("required", []):
            if k not in value:
                errors.append(f"{path}.{k}: missing")
        for k, sub in schema.get("properties", {}).items():
            if k in value:
                check(value[k], sub, f"{path}.{k}", errors)


def validate(story, owner=None):
    errors = []
    schema = SCHEMA
    if owner:
        mine = {k for k, v in SCHEMA["properties"].items() if v.get("x-owner") == owner}
        if not mine:
            return [f"no field has x-owner {owner!r}"]
        schema = {**SCHEMA,
                  "required": [k for k in SCHEMA["required"] if k in mine],
                  "properties": {k: v for k, v in SCHEMA["properties"].items() if k in mine}}
    check(story, schema, "$", errors)
    # Consumer rule: Playmate's scene-tap reads scene_description on page 3 (playmate/prompts.py).
    if owner in (None, "Storyteller") and isinstance(story.get("script_5to7"), list):
        p3 = [p for p in story["script_5to7"] if isinstance(p, dict) and p.get("page") == 3]
        if p3 and not p3[0].get("scene_description"):
            errors.append("$.script_5to7[page 3].scene_description: missing (Playmate scene-tap needs it)")
    return errors


def main(argv):
    owner = None
    if argv[:1] == ["--owner"] and len(argv) >= 2:
        owner, argv = argv[1], argv[2:]
    if not argv:
        print(__doc__)
        return 2
    bad = 0
    for f in argv:
        try:
            story = json.loads(Path(f).read_text())
        except (OSError, ValueError) as e:
            print(f"{f}: cannot read: {e}")
            return 2
        if owner == "Scout" and isinstance(story, dict) and "title" in story and "source_title" not in story:
            story = {**story, "source_title": story["title"]}  # Scout keeps `title`; story.json calls it source_title
        errs = validate(story, owner)
        print(f"{f}: {'PASS' if not errs else f'FAIL ({len(errs)} errors)'}")
        for e in errs[:40]:
            print(f"  {e}")
        if len(errs) > 40:
            print(f"  ... {len(errs) - 40} more")
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
