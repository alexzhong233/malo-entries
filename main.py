"""Hourly Twitch CCU forecast for the GTA VI launch window.

The model is intentionally small and deterministic: it keeps only comparable
launches with a rolling/midnight console unlock (the same shape as GTA VI),
builds each one's release-day viewer curve relative to its hour-1 print, and
combines the empirical distribution of those log ratios with a robust normal
approximation. Blending the two keeps the tails sensible when only a handful of
comparables survive the filters.

Inputs are JSON case files in MAKEFUN_INPUT_DIR (default /input); one compact
JSON output is written per case into MAKEFUN_OUTPUT_DIR (default /output).
"""

import json
import math
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

TAUS = (0.05, 0.25, 0.5, 0.75, 0.95)
ZS = (-1.645, -0.674, 0.0, 0.674, 1.645)
HOURS = tuple(range(2, 25))

# The input text is lowercased before matching, so the marker is lowercase too.
TIER_RE = re.compile(r"tier:\s*([a-z-]+)")
EXCLUDED_UNLOCK_WORDS = ("simultaneous", "global unlock", "10 am", "14:00z")
ROLLING_WORDS = ("midnight local", "rolling")


def parse_ts(value):
    """Parse the case timestamps as UTC-aware datetimes (trailing Z is ISO-ish)."""
    text = value[:-1] + "+00:00" if value.endswith("Z") else value
    return datetime.fromisoformat(text)


def day_curve(comp):
    """Map hour offset from day_start to viewers, for the first 24 hours only.

    Offsets (rather than clock hours) are used because day_start anchors the
    release day; the two coincide for the midnight-UTC starts in the data, but
    offsets remain correct if a start is shifted.
    """
    start = parse_ts(comp["day_start"])
    end = start + timedelta(hours=24)
    curve = {}
    for row in comp.get("hourly", []):
        ts = parse_ts(row["from"])
        if start <= ts < end:
            hour = int((ts - start).total_seconds() // 3600)
            if 0 <= hour <= 23:
                curve[hour] = row["viewers"]
    return curve


def comparable_text(comp):
    """Concatenate the unlock metadata; missing optional fields contribute nothing."""
    return " ".join(
        str(comp.get(key) or "") for key in ("unlock", "notes", "source")
    ).lower()


def ratio_curve(comp):
    """Return hour -> c[h]/c[1] if this comp matches every pool filter.

    Returns None otherwise. Hours with no (or non-positive) sample are simply
    absent from the result, which is how the per-hour aggregation treats them.
    """
    curve = day_curve(comp)
    if not curve or 1 not in curve or curve[1] <= 0:
        return None

    text = comparable_text(comp)
    tier_match = TIER_RE.search(text)
    if tier_match is None or tier_match.group(1) != "comparable":
        return None

    is_rolling = any(word in text for word in ROLLING_WORDS)
    contradicting = any(word in text for word in EXCLUDED_UNLOCK_WORDS)
    if not is_rolling or contradicting:
        return None

    peak = max(curve.values())
    if peak < 30000 or curve[1] < 0.35 * peak:
        return None

    base = curve[1]
    ratios = {}
    for hour in range(1, 25):
        viewers = curve.get(hour)
        if viewers is not None and viewers > 0:
            ratios[hour] = viewers / base
    return ratios


def quantile_at(sorted_values, position):
    """Linear interpolation of a sorted sample at a real (0-based) position."""
    last = len(sorted_values) - 1
    low = min(max(int(position), 0), last)
    high = min(low + 1, last)
    frac = position - int(position)
    return sorted_values[low] + frac * (sorted_values[high] - sorted_values[low])


def forecast_row(hour, p1, pool, last_good=None):
    """Build one output row from the surviving comparable ratio curves.

    `last_good` carries the previous hour's (logs, quantiles) so a gap in the
    source data (e.g. the day's last sample) extrapolates from the nearest
    observed hour instead of collapsing to flat persistence.
    """
    logs = []
    for _, ratios in pool:
        ratio = ratios.get(hour)
        if ratio is not None and 0 < ratio < 4.0:
            logs.append(math.log(ratio))
    logs.sort()  # sorted iteration keeps empirical quantiles deterministic

    if not logs:
        if last_good is not None:
            return {"hour": hour, "q": list(last_good[1]["q"])}, None
        return {"hour": hour, "q": [round(p1, 2)] * 5}, None

    n = len(logs)
    mu = sum(logs) / n
    if n < 4:
        sd = 0.30
    else:
        q25 = logs[int(0.25 * (n - 1))]
        q75 = logs[int(0.75 * (n - 1))]
        sd = max((q75 - q25) / 1.349, 0.30)

    quantiles = []
    for tau, z in zip(TAUS, ZS):
        empirical = quantile_at(logs, tau * (n - 1))
        q_ln = 0.5 * empirical + 0.5 * (mu + z * sd)
        q = p1 * math.exp(q_ln)
        q = min(max(q, 0.01), 1e9)
        # Running max enforces the required ordering before rounding; rounding
        # is monotone, so it cannot break it afterwards.
        q = max(q, quantiles[-1]) if quantiles else q
        quantiles.append(round(q, 2))
    row = {"hour": hour, "q": quantiles}
    return row, logs


def solve_case(data):
    """Compute the full 23-hour forecast payload for one parsed case."""
    hour_one = [row["viewers"] for row in data["known"] if row.get("hour") == 1]
    p1 = max(max(hour_one), 1) if hour_one else 1

    pool = []
    for comp in data.get("comparables", []):
        ratios = ratio_curve(comp)
        if ratios is not None:
            pool.append((str(comp.get("name", "")), ratios))
    pool.sort(key=lambda item: item[0])

    rows, carried = [], None
    for h in HOURS:
        row, logs = forecast_row(h, p1, pool, last_good=carried)
        rows.append(row)
        if logs:
            carried = (logs, {"hour": h, "q": list(row["q"])})
    return {"hours": rows}


def main():
    input_dir = Path(os.environ.get("MAKEFUN_INPUT_DIR") or "/input")
    output_dir = Path(os.environ.get("MAKEFUN_OUTPUT_DIR") or "/output")
    output_dir.mkdir(parents=True, exist_ok=True)

    for input_path in sorted(input_dir.glob("*.in")):
        with input_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)

        payload = solve_case(data)
        output_path = output_dir / (str(data["id"]) + ".out")
        with output_path.open("w", encoding="utf-8", newline="") as handle:
            handle.write(json.dumps(payload, separators=(",", ":")))

        medians = {row["hour"]: row["q"][2] for row in payload["hours"]}
        print(
            f"{data['id']} medians: "
            + " ".join(f"h{h}={medians.get(h)}" for h in (2, 6, 12, 24))
        )


if __name__ == "__main__":
    main()
