# Lullabyte Studio (prototype)

For validation only. Paste a Storyteller script, get the 5 to 7 storybook, and
switch the character (robot or owl), the voice (George, Sarah, Lily) and the
layout (horizontal book, or vertical 4:5 cards for IG and Threads).

Live: https://lullabyte-studio.vercel.app (Vercel project `lullabyte-studio`).

## How it works

- `api/index.py` is one Python WSGI app with no packages. It draws scenes with
  the same `scene/` code the pipeline uses and calls ElevenLabs for voices.
- `web/login.html` and `web/studio.html` are the two pages.
- Voices are made only when someone picks one, and are cached for as long as
  the server instance lives.

## Settings on Vercel

| Name | What |
| :-- | :-- |
| `SITE_PASSWORD` | The team password. With none set, nobody can log in. |
| `ELEVENLABS_API_KEY` | Needs Text to Speech access. |

The password lives only in Vercel, never in this public repo.

## Deploying

Deployed as a folder upload, not from Git. On the server, the unchanged scene
files are fetched from GitHub at a pinned commit (see `REPO` in
`api/index.py`) and `lib/owl.py` is added, so upload this folder with a copy
of `../scene/owl.py` at `lib/owl.py`. Once `owl.py` and the `card.py` character
switch are committed, the pin can move to that commit.
