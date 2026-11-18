# Task: Build the make.fun news-image-20261118 entry

Write `main.py` (Python 3.13, STDlib ONLY — no third-party imports, the grading sandbox has no Pillow/numpy) at this repository root. When run twice it must write the identical PNG to /output/entry.png (create the dir if needed). Constraints: PNG or JPEG named entry.png, at most 1 MiB, at most 1024x1024 pixels, whole valid file, NO network, deterministic bytes (no randomness, no timestamps in output).

# The image must sum up the world's news of Wednesday, 18 November 2026

An AI judge compares entries pairwise and picks the one that best sums up that day's world news. Judge criteria, most important first:
1. It is one day's news and NAMES that day: specific events of 18 Nov 2026 recognisable in the image, and the date shown.
2. Selection and breadth: the day's most consequential stories ACROSS regions and fields, not one country's.
3. It reads: a viewer who missed the day can tell what happened from the image alone; each story clear from picture + short labels; nothing false or self-contradictory.
4. Faithful: what happened, as reported, no hype or speculation as fact.
5. Craft: one clear composition, clean rendering, legible at ~300 px across, no garbled text.

It must NOT look like news from before 13 November 2026 (house images show 13 Nov 2026; images of earlier days lose).

# The day's top stories (verified, from the world's newsrooms, 18 Nov 2026)

INTERNATIONAL / CONFLICT:
- Ukraine struck the Kerch (Crimean) Bridge with drones and missiles; part of the road section collapsed into the sea. Zelensky called it "unprecedented". Russia also struck two bridges in Kyiv with ballistic missiles, killing at least 2.
- US precision strikes hit an Iranian missile launch site on Qeshm Island, Strait of Hormuz ("self-defence" after IRGC attacked a US radar site in Bahrain — Iran's 3rd attack on US targets in 5 days). Kuwait intercepted hostile drones; Bahrain intercepted Iranian aerial attacks. Third US carrier strike group arrives in Middle East.
- Trump flies to China: will meet Xi Jinping and Vladimir Putin Thursday in the FIRST-EVER US-China-Russia trilateral meeting, on the sidelines of APEC in Shenzhen. Nuclear arms control, Ukraine war, trade, AI and chips on the agenda. Putin to APEC: economic coercion is "a thing of the past".

AMERICAS:
- Democrat Mary Peltola wins Alaska's Senate race: Democrats take a 56-44 US Senate majority, biggest net gain since 1958.
- US loses measles elimination status after 26 years (5,400+ cases); RFK Jr. faces fierce backlash.
- NSA's highly classified internal communications network went down; part of a wave of US tech outages (Microsoft, FAA, JPMorgan). Rubio: "zero evidence" of foreign involvement.

ASIA:
- Mongolian President Khurelsukh announces resignation amid abuse-of-power and bribery allegations.
- Bangladesh's first nuclear power plant (Rooppur, 2,400 MW, Russian-assisted) connects to the national grid on trial.
- Modi at Quad summit in Manila (first Quad leaders' meeting in 2+ years, hosted by Trump): calls for peace, stability, predictability.

MIDDLE EAST / OTHER:
- Israeli Knesset elects new speaker Matan Kahana (opposed to Netanyahu) 66-52; Netanyahu's opponents now control the legislative agenda.
- UK sanctions 8 firms over West Bank settlement expansion; Australia sanctions individuals and a company too.
- Canadian PM Carney and China's Xi agree to expand trade despite US tariff threats.
- Gold falls below $3,800/oz, lowest in over a year.

CULTURE / TECH:
- Grand Theft Auto VI launches at midnight tonight after 13 years; ~14.9M digital preorders (~$1.45B), projected biggest opening ever.
- Jensen Huang (ex-Nvidia CEO) signals interest in returning as CEO; Nvidia shuts the door. He quit last week after affair revelations.

# Technical design guidance (follow it)

Build a clean "newspaper front page / news poster" style 1024x1024 PNG:
- Draw with pure Python stdlib: write PNG scanlines manually (zlib, struct) — pixels only, no font files.
- Implement a small embedded 5x7 (or 6x8) pixel bitmap font as constant data for A-Z, 0-9, punctuation; write a text drawing helper with scale factors (e.g. 2x/3x/4x for headline sizes). Text MUST be crisp and correctly spelled — test-render and verify.
- Layout suggestion: top masthead band with big "WORLD NEWS" + the date "WEDNESDAY NOVEMBER 18, 2026" prominent (the date must be very visible). Below, a clean grid of ~8 story cards: each with a simple flat-colour icon-like pictogram drawn from rectangles/polygons (e.g. broken bridge span, missile/shield, handshake of three flags, ballot box, nuclear plant/atom, vial/syringe, rocket/gamepad) plus a 1-2 line uppercase label naming the story and region. Bottom strip: small ticker of extra headlines.
- Flat colours, strong contrast, generous whitespace; legible when shrunk to 300 px. Keep every label SHORT.
- Verify: run main.py, check output exists, is a valid PNG ≤ 1 MiB, exactly 1024x1024, and byte-identical across two runs (use sha256sum). Iterate until all checks pass. Also commit the final files with git.

Work only inside this directory. Commit with git (set a local git identity first).
