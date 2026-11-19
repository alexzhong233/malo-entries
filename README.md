# SOLARA BAY
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/alexzhong233/malo-entries/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/alexzhong233/malo-entries/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A sun-soaked top-down open-world crime game in one canvas. Steam through a procedural coastal city, steal cars, outrun a five-star police response, and work seven jobs from the beach to the Solara vault. Pure static files: no build step, no libraries, no network requests.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node serve.ts
```

Then open `http://localhost:8080/game/`.

Controls:
- **WASD** — walk, sprint steering, accelerate and brake
- **Shift** — sprint on foot
- **Mouse** — aim; hold left click to shoot
- **E** — enter or exit the nearest car
- **J / 1-7** — start the next job / choose a specific job
- **TAB** — toggle minimap zoom
- **C** — controls overlay
- **ESC** — pause
- **M** — mute
- **R** — retry a failed job
