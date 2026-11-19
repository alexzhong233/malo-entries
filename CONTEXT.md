# Task: improve the token-radar-01 entry (all code you write goes into this repo)

You are improving a working entry for the make.fun bounty "Build the best token launch radar". The starter in this repo is a working entry handed in unchanged it would be an ordinary entry of the field — change the value model, the page and the farm plans to be clearly better. All work must be done by you, editing the files in this repo (do not copy starter from elsewhere).

## How to run / test
- Snapshot input: `../input/snapshot.json` (from the repo dir) — sealed DefiLlama protocol data: `protocols` (758 entries, ten fields each: slug, name, category, chains, tvl_usd, change_7d, mcap_usd, listed_at, gecko_id, symbol), `watchlist` (40 slugs: TVL ≥ $50M, no token recorded — gecko_id and symbol both null, not a wrapped/staked/bridged/exchange product).
- Run: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json` (Node 22, stdlib only, TypeScript runs natively).
- Output: out/board.json, out/data.js, out/dashboard/, out/screenshots/, out/dossier.json.

## Hard gate rules (the sealed scorer refuses violations; the entry is INVALID if any fail)
- `main.ts` at repo root, Node 22, standard library ONLY (no npm installs, no network).
- board.json: object with `rows` array, 100–4000 rows, ≤8 MiB. Each row: `slug` (must be a slug in the snapshot's protocols, no whitespace, once each), non-empty `name`, positive whole `rank`, positive whole `implied_value_usd` (≤100,000,000,000,000), `farm_steps` array of 3–12 strings each 20–600 chars after trim.
- ranks exactly 1..N once each; implied_value_usd must NOT rise as rank ascends (rank 1 = highest value); not all equal.
- Every slug in the snapshot's `watchlist` must appear among the rows. Board may (and should) include protocols outside the watchlist (at least 60 beyond it) — the watchlist is a floor, never a ceiling.
- dashboard/: index.html + ≥1 .css + ≥1 .js, ≤400 files, ≤4 MiB total, filenames letters/digits/._- (not starting with . or -). NO http:// or https:// anywhere in HTML attribute values, <style> bodies, inline script imports, CSS files, or JS import/export/require/dynamic-import specifiers. Page renders with no network (reads data.js written beside it).
- screenshots/: exactly 3–4 images (PNG or JPEG), each ≤512 KiB but ideally 300–350 KB, long side ≤1440 px, short side ≥800 px. Names like 1-board.png, 2-detail.png, 3-filtered.png. You cannot take screenshots yourself — leave the existing three placeholder screenshots in place; the operator replaces them from a real render.
- dossier.json must be byte-identical to `buildDossier('/output', {text_max_bytes: 65536})` from vendor/makefun-board.ts — keep using the starter's main.ts structure that calls buildDossier; do not hand-write dossier.json.
- Keep the dashboard's total source under 64 KB so the judge reads it whole in the dossier: aim for index.html + app.css + app.js together well under 60,000 bytes. Every source file shows in the dossier — that is your pitch to the judge.
- Program runs in a container: no network, 1 CPU, 1024 MB, 120 s, runs TWICE and both runs must write identical bytes (no timestamps/randomness in output; deterministic only).

## What the judge rewards (in priority order)
1. A working radar: covers every watchlist protocol, ranks pre-token ones by a stated implied value; screenshots and code agree (the judge reads the dossier source next to the screenshots — the page must look exactly like what the code renders).
2. The value model: implied value follows from the snapshot's own figures — TVL, 7-day growth, how long it has run with no token (listed_at) — NOT from a hardcoded list of names. Must separate protocols whose token already trades from those still to come.
3. Farm plans: concrete steps with what they COST and how LONG they take, not slogans.
4. Dashboard as a page: sortable and filterable, readable at a glance, detail view per protocol.
5. Looks made: chosen palette, consistent spacing, readable type — not a framework pasted wholesale.

## Explicit deliverables for you
1. Rewrite `lib/model.ts` scoring: a defensible implied-value model, e.g. implied value derived from TVL and comparable token-bearing protocols' mcap/tvl multiples (compute the median or regression multiple from token-bearing protocols IN the snapshot and apply it to pre-token TVL, modulated by 7-day momentum and age-without-token, with sane caps). State the formula on the page and in the code. Handle nulls (change_7d, listed_at) without NaN.
2. Rework `dashboard/` (index.html, app.css, app.js): dark, distinctive palette (not default Tailwind blue/purple gradient), sortable columns (TVL, implied value, momentum, age, category), a search + category filter, a detail view (click a row) showing the model breakdown (each factor's contribution), chains, and the farm plan with per-step cost/time. Everything reads from data.js.
3. Enrich `farm_steps` in the model: concrete, protocol-specific steps mentioning deposit assets, chains, expected APR from the data where derivable, cost (gas, impermanent loss risk, deposit size to matter) and time. 3–12 steps, each 20–600 chars.
4. Verify: run the program twice into two dirs and diff them (must be identical); validate board.json against every gate rule above with a small node script you write and run; check every watchlist slug is covered; check no http/https in the forbidden places; print file sizes.
5. Iterate at least twice: after your first run, re-read your output and the gate rules, find weaknesses, and revise the code. Do not stop after one pass.

## Other rules
- Do not create files outside this repo. Do not touch anything in /root outside this project dir.
- Never put URLs (http:// or https://) in HTML attributes, style bodies or JS import specifiers. Visible text may mention names like "DefiLlama" without a URL.
- The entry message/title stays with the operator; don't worry about it.
