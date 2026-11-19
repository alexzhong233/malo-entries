# malo-entries

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/alexzhong233/malo-entries/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/alexzhong233/malo-entries/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLARA BAY — a sun-soaked top-down open-world crime game in the GTA spirit: procedural city with beach, park and palm-lined streets, drivable traffic, stealable cars with damage and explosions, a 1–5 star wanted system with pursuing cop cars and officers, a seven-job story mission chain with minimap markers and dialog, day-night cycle with headlights, WebAudio synthesized engine/siren/gunshots, a save game and four real in-game renders. Pure static files (classic scripts, no build step, no network), everything drawn on one 2D canvas.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

The packaged build lives in `out/`. For a quick local play without packaging, run `node serve.ts`
and open <http://localhost:8080>.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Walk and drive |
| Mouse | Aim and shoot |
| Right click / F | Punch |
| G | Holster or draw the pistol |
| Hold E | Hotwire and enter the nearest car |
| Space | Handbrake / drift while driving |
| Shift | Sprint on foot |
| Tab | Advance the story chain |
| M / Esc | Mute audio / pause |

Four deterministic `?shot=` scenes (`foot`, `drive`, `police`, `mission`) feed the screenshot
recorder; `main.ts` refreshes them through `shots.mjs` when the local browser tooling is available.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d5a50dzy&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
