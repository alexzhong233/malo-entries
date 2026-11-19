# CONTEXT — make.fun news-image-20261119

## Contest
Sum up 19 November 2026's world news in one image, `/output/entry.png`.
Contest date: **Thursday 19 November 2026** — this is the ONLY date the image may name.

## Constraints
- Python 3.13, stdlib only (zlib, struct). Hand-rolled PNG writer, embedded 5x7 bitmap font, scale factors.
- Output: PNG, <=1024x1024 px, <=1 MiB, deterministic (byte-identical across runs, sha256 both), no network/randomness/timestamps.
- Honors OUT_DIR env (default /output; test with OUT_DIR=out).
- Layout: masthead 'WORLD NEWS' + '19 NOVEMBER 2026' highlight band; 2x4 story-card grid (region/color header, flat pictogram, 1-2 line uppercase label + sub-line); bottom ticker strip.

## The day's 8 verified stories (Nov 19, 2026, multi-source)
1. ASIA-PACIFIC / Diplomacy: First-ever US-China-Russia trilateral summit — Trump, Xi, Putin meet in Shenzhen at APEC; nuclear arms and Ukraine war on agenda; "together we are making history".
2. EUROPE / Ukraine: Coalition of the Willing meets in Berlin — Merz hosts 30+ leaders incl. Macron, Zelenskyy; EU proposes EUR 45B loan for Ukraine (25B military, 20B budget).
3. MIDDLE EAST / Conflict: Iran widens Gulf attacks — strikes US air base in Kuwait, targets in Bahrain; Hormuz crude flows down to 8.5M barrels/day.
4. MIDDLE EAST / Yemen-Saudi: Houthi missile debris damages Riyadh financial district (PIF Tower); Saudi-led coalition strikes Saada, Yemen.
5. BUSINESS / Tech: Nvidia quarterly revenue $115.8B, up 103% year-on-year; forecasts ~$130B Q4 on AI demand.
6. AFRICA / Health: DRC Ebola outbreak passes six months — WHO: 11,000+ infected, 5,400+ dead, still uncontrolled.
7. AMERICAS / Politics: Alaska special race — Democrat Mary Peltola defeats Republican Dan Sullivan, Democrats take 56-44 Senate majority.
8. ASIA / Korea: Korea's CSAT college entrance exam — 550,000 test-takers nationwide; only black pencils allowed amid AI-cheating fears.

Ticker extra (brief): migrants boat sinks off Senegal (~100 aboard, dozens missing); Bangladesh protests over Hasina's return; ICJ to rule in Rohingya genocide case; Cambridge Dictionary word of the year: "human".

## Judge criteria (verbatim from competition)
1. names the day — contest date prominent, ANY other date ranks last;
2. 8 consequential stories across regions and fields;
3. a viewer who missed the day can tell what happened from the image alone;
4. faithful reported facts, no hype/speculation as fact;
5. craft: one clear composition, legible at 300px, no garbled text.

## Defect checklist for review
(a) no date text other than 19 November 2026 anywhere; (b) no clipped text; (c) digits from digit glyphs (verify '5,400+' renders); (d) no stray artifacts; (e) no large empty whitespace; (f) all words fully rendered; (g) legible at ~300px.

Implementation note: `main.py` writes a filter-0 RGB PNG with a hand-rolled zlib/struct encoder and a 5x7 bitmap font (scales 2-8); each card reserves 15 chars per scaled label line and 20 per fine-print line, so no copy clips and two runs are byte-identical.
