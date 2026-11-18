# gta6-twitch-ccu-forecast-01 — CONTEXT.md (build brief for the coding agent)

## Task
Write `main.py` (Python 3.13, **standard library only**, no network) at the repo root. It forecasts hourly
Twitch concurrent viewers for the "Grand Theft Auto VI" category for hours 2..24 of 2026-11-19 UTC, given
hour 1's print. Grader runs: `python3 -P -s /bot/main.py` with `PYTHONHASHSEED=0`, 1 CPU, 1024 MB, **8 s wall
budget per case**, no network.

- Input: read every `*.in` file in `MAKEFUN_INPUT_DIR` if set else `/input` (grader leaves both unset; exactly
  one case file per run). JSON schema `makefun/twitch-ccu-case/v1` — keys: `id`, `known` (list; row with
  `hour==1` has `viewers` = hour-1 print), `forecast` (rows with `hour` 2..24), `history`, `history_hourly`,
  `comparables` (list of `{name, day_start, hourly: [{from, viewers, channels}], unlock, notes, source}`), etc.
- Output: for each input `<id>.in` write `<id>.out` into `MAKEFUN_OUTPUT_DIR` if set else `/output` — a
  **regular file**, UTF-8 JSON, ≤65,536 bytes: `{"hours": [{"hour": h, "q": [q05,q25,q50,q75,q95]}, ...]}` —
  **exactly 23 rows, hours 2..24 each once, no other keys anywhere**, each q a finite number >0 and ≤1e9,
  non-decreasing within a row. Any violation = invalid case = disqualified from prizes.
- Must be **deterministic** (no randomness, no wall-clock, no dict-order dependence — use sorted iteration).
- Must run in <8 s (it will be far under; the JSON files are ~1 MB each).

## Model (implement EXACTLY this; it was validated on cross-validated comparable launches, mean pinball loss
≈0.14 vs house baseline ≈0.20 on the closest-analogue subset)

1. `p1 = max(known[hour==1].viewers, 1)`.
2. Parse `comparables`. For each comp `c`:
   - Compute its release-day curve: `day_start` → dict hour 0..23 → viewers, from rows whose ISO timestamp
     (UTC) lies in `[day_start, day_start + 24h)`. Parse ISO 8601 with `datetime.fromisoformat` after
     replacing trailing `Z` with `+00:00`.
   - `peak = max(viewers)` over the day; skip comp if `hour1` missing or ≤0.
   - **Keep the comp in the pool only if ALL hold:**
     a. Its `unlock`+`notes`+`source` text (lowercased, concatenated) matches `Tier:\s*([a-z-]+)` with tier
        == `comparable` (if no Tier marker, treat as `unknown` and EXCLUDE);
     b. rolling-console-unlock analogue: text contains `midnight local` or `rolling`, AND does NOT contain
        `simultaneous`, `global unlock`, `10 am`, `14:00z`;
     c. `peak >= 30000`;
     d. `hour1 >= 0.35 * peak` (hour 1 already surged, like GTA VI's will be).
   - Ratio curve: `r[h] = c[h]/c[1]` for h 1..24 (skip missing/≤0 → treat as absent for that h).
3. For each forecast hour h (2..24):
   - Collect logs `lrs = [ln(r[h]) for comps in pool if r[h] exists and 0 < r[h] < 4.0]`.
   - If empty → emit q = [p1]*5 for that hour.
   - Else: `n = len(lrs)`, sort ascending. `mu = mean(lrs)`. Robust spread:
     `sd = max((q75_emp - q25_emp)/1.349, 0.30)` where q25/q75 are the empirical 25th/75th percentiles of the
     sorted list (index `int(0.25*(n-1))`, `int(0.75*(n-1))`); if `n < 4`, `sd = 0.30`.
   - For each level tau in [0.05, 0.25, 0.5, 0.75, 0.95] with z = [-1.645, -0.674, 0, 0.674, 1.645]:
     empirical quantile `emp` = linear interpolation at position `tau*(n-1)` between neighbors;
     `q_ln = 0.5*emp + 0.5*(mu + z*sd)`; `q = p1 * exp(q_ln)`.
   - Clamp each q to `min(max(q, 0.01), 1e9)`; then enforce non-decreasing by a running max.
4. Round to 2 decimals (half up, use `round(x, 2)`; plain banker's rounding is fine, do not hand-roll).
5. Write the output JSON compactly (`json.dumps`, separators `(",", ":")`).

## Quality gates (verify before finishing)
- Run locally: `mkdir -p out && MAKEFUN_INPUT_DIR=<kit>/input MAKEFUN_OUTPUT_DIR=out python3 main.py` with kit
  input at `/root/makefun/gta6-twitch-ccu-forecast-01-kit/input` (files p00..p03.in). All 4 outputs must exist,
  parse, have exactly 23 rows hours 2..24, non-decreasing positive quantiles, ≤65,536 bytes.
- Determinism: run twice into different dirs, byte-identical outputs.
- Print a one-line summary of each output's median curve (hour 2, 6, 12, 24 medians) so the human can sanity-check.

## Style
- Clean, commented (why-comments), single file `main.py`, ~200 lines. Docstring at top explaining the method.
- No imports beyond json, math, os, sys, pathlib, datetime, re (all stdlib).
