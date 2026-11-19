# S1 asset spike: results

Issue: #15. Epic: #8, milestone S1. The owner fills every empty cell. The
implementer does not record numbers here.

| Field | Value |
| :-- | :-- |
| Date | |
| Commit SHA | |
| Build command | `pnpm --filter @storybook/app run spike:build` |

## Method

0. Once per machine, for the smoke test only: install the WebKit browser with
   `pnpm --filter @storybook/app exec playwright install webkit`. Smoke check
   (WebKit, iPhone 13 profile; a smoke check, not a device result):
   `pnpm --filter @storybook/app run smoke:spike`.
1. Build: `pnpm --filter @storybook/app run spike:build`. It writes to
   `apps/storybook/dist-spike/`, never to `dist/`. Serve:
   `pnpm --filter @storybook/app run spike:preview`. It serves `dist-spike/` on
   `0.0.0.0:4173`. Do not deploy after a spike build: run a normal build first.
2. The phone and the tablet are on the same Wi-Fi as the laptop. Open
   `http://<laptop LAN IP>:4173/spike/<n>?probe=1`.
3. Before each run: close other tabs, turn Low Power Mode or Battery Saver
   off, and do not touch the screen during the 22 s.
4. Run 3 times per page per device. Reload between runs.
5. **Frame time verdict**: pass when the highest p95 of all phone runs on all
   3 pages is at most 33 ms.
6. **4G load**: desktop Chrome, DevTools Network "Disable cache" on,
   throttling preset "Fast 4G". Load each page once with `?probe=1` and
   record `assetLoadMs`. Target: at most 2000 ms.
7. **Holes**: on each device and page, watch for 60 s and tap every tappable
   layer 3 times. Fail if paper or background shows at a joint, if a gap opens
   between parts, or if a cut-out shows a hole or halo.
8. **Clean-up time**: stopwatch per asset. Start: the first edit of that
   asset's crop entry, or the first shape for an SVG. Stop: the owner accepts
   the asset in the scene. Commands that run in between count.

## Devices

| Role | Model | OS version | Browser and version |
| :-- | :-- | :-- | :-- |
| Phone | | | |
| Tablet | | | |

## Frame time

One row per device, page, and run. `over33` is the count of frames longer
than 33.4 ms.

| Device | Page | Run | p95 (ms) | p50 (ms) | max (ms) | over33 |
| :-- | :-- | :-- | --: | --: | --: | --: |
| Phone | 1 | 1 | | | | |
| Phone | 1 | 2 | | | | |
| Phone | 1 | 3 | | | | |
| Phone | 2 | 1 | | | | |
| Phone | 2 | 2 | | | | |
| Phone | 2 | 3 | | | | |
| Phone | 3 | 1 | | | | |
| Phone | 3 | 2 | | | | |
| Phone | 3 | 3 | | | | |
| Tablet | 1 | 1 | | | | |
| Tablet | 1 | 2 | | | | |
| Tablet | 1 | 3 | | | | |
| Tablet | 2 | 1 | | | | |
| Tablet | 2 | 2 | | | | |
| Tablet | 2 | 3 | | | | |
| Tablet | 3 | 1 | | | | |
| Tablet | 3 | 2 | | | | |
| Tablet | 3 | 3 | | | | |

Highest phone p95 over all runs: ____ ms (pass at most 33 ms).

## 4G load

| Page | `assetLoadMs` (ms) |
| :-- | --: |
| 1 | |
| 2 | |
| 3 | |

## Holes

| Page | Pass or fail | Note |
| :-- | :-- | :-- |
| 1 | | |
| 2 | | |
| 3 | | |

## Clean-up time

| Asset | Minutes |
| :-- | --: |
| `cow` | |
| `tree` | |
| `fence` | |
| `toolbox` | |
| Pip SVG authoring (copied from the #12 PR) | |

## Owner verdict

| Question | Answer |
| :-- | :-- |
| Look accepted on phone and tablet (yes or no) | |
| S1 (pass or fail) | |
| Pip format (`svg-rig` or WebP fallback) | |

## Limit of the probe

The probe measures main-thread frame pacing: the intervals between
`requestAnimationFrame` callbacks. It does not see frames that are dropped only
on the compositor thread. A smooth main thread does not prove a smooth screen.
