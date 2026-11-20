import type { RegistrySnapshot } from "@storybook/dsl";

// Test data. Each entry is `{ kind, renderer, version, manifest }` copied from
// the `asset.json` that the asset pipeline (#11, #12) built for the S1 spike
// into `tools/assets/out/<key>/v<n>/` on 2026-11-19. `tools/assets/out/` is
// not tracked, so the tests cannot read it. The `cow` entry keeps only the
// poses `front` and `walk` and their `legal` pairs, which are the poses the
// spike pages use.
export const SPIKE_REGISTRY_FIXTURE: RegistrySnapshot = { assets: {
  "pip": {
    "kind": "character",
    "renderer": "svg-rig",
    "version": 2,
    "manifest": {
      "kind": "character",
      "poses": [
        {
          "id": "front",
          "file": "pip.svg",
          "foot": {
            "x": 111,
            "y": 416
          },
          "box": {
            "x": 0,
            "y": 0,
            "w": 232,
            "h": 416
          },
          "face": {
            "x": 48,
            "y": 92,
            "w": 139,
            "h": 106
          }
        }
      ],
      "expressions": [
        "happy",
        "sad",
        "angry",
        "surprised",
        "worried"
      ],
      "legal": [
        {
          "pose": "front",
          "expression": "happy"
        },
        {
          "pose": "front",
          "expression": "sad"
        },
        {
          "pose": "front",
          "expression": "angry"
        },
        {
          "pose": "front",
          "expression": "surprised"
        },
        {
          "pose": "front",
          "expression": "worried"
        }
      ],
      "flippable": true,
      "parts": [
        "part-leg-left",
        "part-leg-right",
        "part-arm-left",
        "part-arm-right",
        "part-body",
        "part-head",
        "part-antenna",
        "part-face",
        "part-eyes"
      ]
    }
  },
  "cow": {
    "kind": "character",
    "renderer": "webp",
    "version": 1,
    "manifest": {
      "kind": "character",
      "poses": [
        {
          "id": "front",
          "file": "front-happy.webp",
          "foot": {
            "x": 146,
            "y": 394
          },
          "box": {
            "x": 1,
            "y": 0,
            "w": 279,
            "h": 394
          },
          "face": {
            "x": 43,
            "y": 32,
            "w": 195,
            "h": 158
          },
          "expression": "happy"
        },
        {
          "id": "walk",
          "file": "walk-happy.webp",
          "foot": {
            "x": 177,
            "y": 373
          },
          "box": {
            "x": 0,
            "y": 0,
            "w": 249,
            "h": 373
          },
          "face": {
            "x": 38,
            "y": 30,
            "w": 174,
            "h": 149
          },
          "expression": "happy"
        }
      ],
      "expressions": [
        "happy",
        "sad",
        "angry",
        "surprised",
        "worried",
        "thinking"
      ],
      "legal": [
        {
          "pose": "front",
          "expression": "happy"
        },
        {
          "pose": "walk",
          "expression": "happy"
        }
      ],
      "flippable": true
    }
  },
  "tree": {
    "kind": "scenery",
    "renderer": "webp",
    "version": 1,
    "manifest": {
      "kind": "scenery",
      "poses": [
        {
          "id": "default",
          "file": "default.webp",
          "foot": {
            "x": 173,
            "y": 396
          },
          "box": {
            "x": 0,
            "y": 0,
            "w": 331,
            "h": 396
          }
        }
      ],
      "expressions": [],
      "legal": [],
      "flippable": true
    }
  },
  "fence": {
    "kind": "scenery",
    "renderer": "webp",
    "version": 1,
    "manifest": {
      "kind": "scenery",
      "poses": [
        {
          "id": "default",
          "file": "default.webp",
          "foot": {
            "x": 363,
            "y": 229
          },
          "box": {
            "x": 0,
            "y": 0,
            "w": 422,
            "h": 229
          }
        }
      ],
      "expressions": [],
      "legal": [],
      "flippable": true
    }
  },
  "toolbox": {
    "kind": "prop",
    "renderer": "webp",
    "version": 1,
    "manifest": {
      "kind": "prop",
      "poses": [
        {
          "id": "default",
          "file": "default.webp",
          "foot": {
            "x": 169,
            "y": 297
          },
          "box": {
            "x": 0,
            "y": 0,
            "w": 340,
            "h": 297
          }
        }
      ],
      "expressions": [],
      "legal": [],
      "flippable": true
    }
  },
  // copied from `tools/assets/out/meadow/v1/asset.json` (`cli meadow`, #67).
  "meadow": {
    "kind": "backdrop",
    "renderer": "svg",
    "version": 1,
    "manifest": {
      "kind": "backdrop",
      "description": "an open meadow with soft hills",
      "size": { "width": 2400, "height": 1200 },
      "variants": [
        { "sky": "day", "file": "day.svg" },
        { "sky": "cloudy", "file": "cloudy.svg" },
        { "sky": "dusk", "file": "dusk.svg" },
        { "sky": "night", "file": "night.svg" }
      ]
    }
  }
} };
