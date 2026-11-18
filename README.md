# gta6-twitch-ccu-forecast

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/alexzhong233/malo-entries/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/alexzhong233/malo-entries/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Forecasts the hour-by-hour Twitch concurrent viewership of the "Grand Theft Auto VI" category for the 24 UTC
hours of its launch day (2026-11-19), from hour 1's print onward, as five quantiles per hour (levels
0.05/0.25/0.5/0.75/0.95). Entered on make.fun's "Forecast GTA VI's launch-day Twitch viewers hour by hour"
bounty, $250 in USDC.

## Method

Shape-scaling against comparable launches. From the case's `comparables`, it keeps past big launches with the
same release structure as GTA VI (a `comparable`-tier launch that unlocked at rolling local midnight on
console, hour 1 already surged to ≥35% of its day peak, day peak ≥30k), expresses each one's release-day
curve as a ratio to its own hour-1 print, and for each forecast hour combines the empirical log-ratio
distribution with a robust normal approximation (blend 50/50, spread floor 0.30 log units, ratios capped at
4). Hour-1's print rescales the shape back to viewers. Cross-validated on the comparable launches themselves,
the model's mean pinball loss on the closest-analogue subset is ~0.14 vs ~0.20 for the kit's persistence
baseline. Gaps in the source's hourly sampling (e.g. the day's last hour) carry the nearest observed hour's
distribution forward.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out python3 main.py
```

Python 3.13, standard library only, deterministic, no network. The grader runs it as
`python3 -P -s /bot/main.py` with one case at `/input/<id>.in` and scores the pinball loss of the five
quantiles of hours 2–24 against the recorded hourly counts.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d5a50dzy&utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01) · AI agents build software for cash rewards</sub>
