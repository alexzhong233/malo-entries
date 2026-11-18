# Entry: news-image-20261117 — "Sum up 17 November's world news in one image"

## Hard constraints (from the kit rules — obey exactly)
- `main.py`, Python 3.13, **pure standard library only**, no network, fully deterministic.
- Renders `/output/entry.png`; honor `OUT_DIR` env var (default `/output`). ≤1024x1024, ≤1 MiB.
- Must be a manual PNG writer + embedded bitmap font (no PIL). Judge compares 300px thumbnails pairwise; the winner is the image that best summarizes the day's world news.

## The news — ALL from November 17, 2026 (verified). Do not depict or print any other date. The date "17 NOVEMBER 2026" must be huge and prominent.
Pick 8 of these (spread across regions and domains):

1. **US/Asia**: Trump in Manila opens Asia trip — ASEAN + Quad summits (photo with Modi, Takaichi, Albanese); says he "may" meet Kim Jong Un in China during trip.
2. **Middle East**: Iran fires drones at a U.S. radar facility in Bahrain — third Iranian strike on Bahrain in 5 days; U.S. retaliates against Iranian targets along the shipping route (Strait of Hormuz tanker also attacked near Oman).
3. **Middle East**: Winter rains flood Gaza's makeshift shelters; Germany's foreign minister demands Israel let significantly more humanitarian aid into Gaza before winter.
4. **Climate/COP31 (Antalya, Türkiye)**: Johan Rockström warns of climate tipping points and efforts to sideline science; four nations pledge $200M to the GEF as adaptation costs rise.
5. **US tech**: A highly-classified NSA computer network went down; DHS chief offers theory about America's tech meltdown; Nvidia creates an oversight committee for national security and export controls.
6. **Ukraine**: Quote of the Day — "Russian strikes expose Ukraine to winter chill" (NYT, Nov 17).
7. **Africa**: WFP steps in for thousands of families who fled violence in Ethiopia, sheltering in Moyale, Kenya. "Hunger should not be a concern."
8. **Taiwan**: Taiwan says it "urgently needs" $14 billion in U.S. arms; says the deal is "up to" Trump.
9. **Jordan**: blocks Telegram messaging app to counter "extremism and radicalization."
10. **Sports**: In India, MS Dhoni announces IPL retirement (5 IPL titles, 5,439 runs); Alcaraz sweeps aside Tiafoe at ATP Finals.

## Design direction (must differ from prior 11/18 entry: don't reuse its layout)
- Suggested composition idea (you may improve it): a bold "front page / globe" design — huge date banner "17 NOVEMBER 2026" across the top; below, a 2-column grid of story tiles each with a small icon drawn in vector shapes (crosshair for Bahrain strike, rain cloud for Gaza, thermometer/warning for Ukraine winter, globe+ship for Trump Asia trip, leaf/CO2 for COP31, wheat bowl for Kenya/Ethiopia, padlock for Jordan Telegram, cricket bat for sports).
- Each tile: short 3-6 word headline in large type + 1 line of detail. Legible at 300px is mandatory — minimum body font ~14px at 1024 canvas, headlines much bigger.
- Striking dark theme with a strong accent color; high contrast; no gibberish glyphs (only ASCII in your embedded font).
- Leave generous margins; avoid text clipping.

## Deliverable checklist
- main.py at repo root; LICENSE (MIT, must contain literal line `SPDX-License-Identifier: MIT`); README.md can be a placeholder for now.
- After writing main.py, run `OUT_DIR=out python3 main.py` twice and verify the two PNGs are byte-identical (determinism) and the file is ≤1 MiB, ≤1024x1024.
