I want to create a storybook.

## Audience and Language

- Target age: 5 years old
- Book language: English

## Story Content

The story is based on the following news article:

```json
{
  "id": "ai-maya-rediscovery",
  "title": "AI Spotted a Maya Site, but Was It Really a New Discovery?",
  "source_links": [
    "https://www.theverge.com/ai-artificial-intelligence/1032125/ai-agents-maya-site-archeology-discovery",
    "https://doi.org/10.1016/j.jasrep.2025.105288"
  ],
  "date": "2026-11-12",
  "confidence": 5,
  "first_rating": "green",
  "full_text": "A researcher used a team of 48 AI agents to examine lidar maps of the Maya region in Mexico. Lidar is a technology that sends laser pulses toward the ground to create a three-dimensional map. Because some laser light can pass through gaps in trees, the resulting data can reveal shapes hidden beneath a forest canopy. The AI agents identified patterns that looked like plazas, raised platforms, buildings, and a pyramid-shaped mound.\n\nThe location was initially presented as a possible unmapped Maya site. The researcher contacted Mexico's National Institute of Anthropology and History and was reportedly told that the site was not listed in its official register. However, archaeologists later found that the same location had already appeared in a scientific paper published in 2025. It was visible in a map produced through earlier lidar research.\n\nThe researcher corrected the original claim and acknowledged that the AI agents had rediscovered the location rather than discovered it for the first time. An official government register may be incomplete, and a location can be missing from that database while still being documented in academic research or known to local communities.\n\nThe result does not mean that AI is useless for archaeology. The agents successfully examined a large geographic dataset and recognized potentially important structures. The failure occurred during the verification stage, when the finding was not fully compared with previous scholarship before being described as new.\n\nThis story demonstrates why scientific discovery requires more than detecting an interesting pattern. Researchers must search earlier studies, inspect maps and figures, consult specialists, consider local knowledge, and sometimes conduct fieldwork. AI can help scientists process large amounts of information, but it cannot replace subject expertise, careful verification, or peer review."
}
```

## Available Characters

Use the characters provided in:

`storybook_main/00_storybook_design`

## Storyboard Request

Please design a 10-page storyboard.

For each page, describe:

- The background
- The characters
- The interactive elements
- The layer structure needed for subtle animation

At this stage, first plan how each page should be presented and provide written descriptions only. Do not create any images yet.

## Illustration Style

- Each page should look like a complete, hand-drawn storybook illustration.
- Use only a small amount of subtle frame-by-frame animation. The animation does not need to be perfectly smooth.
- Example movements include a gently moving hand or blinking eyes.
- Preserve an intentionally hand-drawn, frame-by-frame feeling at approximately 4–8 frames per second.

## Interactive Elements

There are two types of interactive elements. Include 2–4 of each type on every page.

### 1. Self-Animating Characters or Elements

Examples:

- A head gently moving from side to side
- A hand moving up and down
- A tree swaying
- Eyes blinking

### 2. Click-Activated Objects or Characters

Examples:

- Tap a door to open it frame by frame. Tap it again to close it.
- Tap a bird to make it blink, hop, or flap its wings.
- Tap a character to make them wave, blink, or change expression.
- Tap a lamp to turn it on.
- Tap a plant to make its leaves sway gently.

## Background Requirements

- The background should be the main bottom layer.
- Leave open space near the bottom for story text.
- The boundary of the text area should feel organic rather than forming a rigid, straight line.
- Use the following file only as a style reference:

`storybook_main/sample-storybook/page-01.png`

## Image and Animation Assets

Do not create each page as a single MP4 file. Use separate layered assets instead:

- Background: PNG
- Interactive characters and objects: transparent-background PNG
- Each frame-by-frame action: multiple transparent-background PNG files
- Store the assets for each page in a separate folder.
- Use clear and consistent filenames for every asset.

Suggested structure:

```text
page-01/
├── background.png
├── foreground.png
├── door-closed.png
├── door-opening-01.png
├── door-opening-02.png
├── door-opening-03.png
├── door-open.png
├── bird-idle.png
├── bird-action-01.png
├── bird-action-02.png
└── bird-action-03.png
```

Do not reference any files that I have not specifically mentioned.
