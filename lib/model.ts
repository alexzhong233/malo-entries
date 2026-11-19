// Token Radar's model: one sealed snapshot in, one ranked pre-token board out.
//
// WHAT THE BOARD IS
//   Every slug on the snapshot's watchlist (the floor, never the ceiling) plus "early" pre-token
//   protocols below that floor. A protocol is pre-token when the index records no token at all
//   (no market cap, no CoinGecko id, no symbol); token-bearing protocols are kept apart in the
//   dashboard's Live view and never mixed into the ranking.
//
// THE IMPLIED-VALUE MODEL (radar-2) — no protocol name is special-cased
//
//   1. COMPARABLE MULTIPLE. From the token-bearing protocols IN THIS SNAPSHOT we take each one's
//      mcap_usd / tvl_usd, drop absurd outliers (ratio outside [0.01, 20]), and take the median.
//      For a category with at least `multiple_min_comps` such peers we use that category's own
//      median instead; otherwise we fall back to the global median. This multiple is clamped to
//      [multiple_floor, multiple_cap]. It is learned from the data, never hard-coded by name.
//        base = tvl_usd * comparable_multiple
//   2. MOMENTUM.  growth = clamp(change_7d, growth_floor, growth_cap) (percent; null -> 0)
//        growth_multiplier = 1 + growth/100 * growth_weight
//   3. AGE WITHOUT A TOKEN.  age = days from listed_at to the snapshot date.
//        age_multiplier = age_floor + min(age, age_cap_days)/age_cap_days * age_range
//      A longer run with no token is read as more established capital and a larger eventual
//      audience, so the factor rises from age_floor to age_floor + age_range. A missing listing
//      date is NOT guessed: it gets a neutral 1.00x.
//        implied_raw = base * growth_multiplier * age_multiplier
//        implied     = clamp(round(implied_raw), 1, value_cap)
//
// Every factor is returned in the row's `model` object so the detail view can show each factor's
// contribution as a waterfall. See MODEL below for the tuning constants.
//

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Tuning knobs. The comparable multiple itself is learned from the snapshot, not set here. */
export interface ModelConstants {
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  age_cap_days: number;
  age_floor: number;
  age_range: number;
  multiple_floor: number;
  multiple_cap: number;
  multiple_min_comps: number;
  ratio_floor: number;
  ratio_cap: number;
  value_cap: number;
}

export const MODEL: ModelConstants = {
  growth_floor: -60,
  growth_cap: 120,
  growth_weight: 0.6,
  age_cap_days: 1460,
  age_floor: 0.75,
  age_range: 0.5,
  multiple_floor: 0.05,
  multiple_cap: 4,
  multiple_min_comps: 5,
  ratio_floor: 0.01,
  ratio_cap: 20,
  value_cap: 25_000_000_000,
};

export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 170;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** Each multiplicative factor and the running product after it, for the detail view's waterfall. */
export interface ModelBreakdown {
  comparable_multiple: number;
  multiple_source: string;
  growth_pct: number;
  growth_multiplier: number;
  age_days: number | null;
  age_multiplier: number;
  base_value: number;
  after_growth: number;
  after_age: number;
  capped: boolean;
  implied_value_usd: number;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

/** The dashboard's compact view of one row: the whole breakdown and the structured farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlisted: boolean;
  model: ModelBreakdown;
  farm_plan: FarmStep[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the view shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: board, live set, learned multiples and the stated formula. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  peer_count: number;
  multiples: { category: string; multiple: number; peers: number }[];
  formula: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a numeric list, or null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const a = values.slice().sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 === 1 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

/** Multiples learned from the snapshot's token-bearing protocols. */
export interface ComparableMultiples {
  global: number;
  byCategory: Map<string, number>;
  counts: Map<string, number>;
  count: number;
}

/**
 * Learn the mcap/tvl multiple from THIS snapshot. Only protocols with a market cap and positive TVL
 * count, outliers outside [ratio_floor, ratio_cap] are dropped, and the robust median is used. A
 * category with at least `multiple_min_comps` peers gets its own median; everything else uses global.
 */
export function comparableMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): ComparableMultiples {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio < model.ratio_floor || ratio > model.ratio_cap) continue;
    all.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
    }
  }
  const global = clamp(median(all) ?? 0.25, model.multiple_floor, model.multiple_cap);
  const cat = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const [name, list] of byCategory) {
    if (list.length < model.multiple_min_comps) continue;
    const value = median(list);
    if (value !== null) {
      cat.set(name, clamp(value, model.multiple_floor, model.multiple_cap));
      counts.set(name, list.length);
    }
  }
  return { global, byCategory: cat, counts, count: all.length };
}

/** The comparable multiple for one protocol and a human label for where it came from. */
export function multipleFor(p: SnapshotProtocol, learned: ComparableMultiples, model: ModelConstants = MODEL): { multiple: number; source: string } {
  if (p.category !== null && learned.byCategory.has(p.category)) {
    return { multiple: learned.byCategory.get(p.category)!, source: `${p.category} peers` };
  }
  return { multiple: learned.global, source: 'all token-bearing peers' };
}

/** The full factor breakdown and implied value one protocol gets under the learned multiples. */
export function impliedValue(p: SnapshotProtocol, asOf: string, model: ModelConstants, learned: ComparableMultiples): ModelBreakdown {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMultiplier = 1 + (growthPct / 100) * model.growth_weight;
  const ageMultiplier = age === null
    ? 1
    : model.age_floor + (clamp(age, 0, model.age_cap_days) / model.age_cap_days) * model.age_range;
  const { multiple, source } = multipleFor(p, learned, model);
  const base = p.tvl_usd * multiple;
  const afterGrowth = base * growthMultiplier;
  const afterAge = afterGrowth * ageMultiplier;
  const raw = Math.max(1, Math.round(afterAge));
  const implied = clamp(raw, 1, Math.round(model.value_cap));
  // Store the factors at full precision so the dashboard's independent recomputation lands on the
  // exact same integer as the board. Display code rounds with toFixed; the arithmetic never does.
  return {
    comparable_multiple: multiple,
    multiple_source: source,
    growth_pct: growthPct,
    growth_multiplier: growthMultiplier,
    age_days: age,
    age_multiplier: ageMultiplier,
    base_value: Math.round(base),
    after_growth: Math.round(afterGrowth),
    after_age: raw,
    capped: raw !== implied,
    implied_value_usd: implied,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i;
/** Wrapped / staked / bridged deposit products are not token-launch candidates, mirroring the watchlist rule. */
const PRODUCT = /\b(?:staked|wrapped|bridged|staking|wrapper|canonical)\b|\b(?:wbtc|weth|wsteth|weeth|cbeth|steth)s?\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange or a wrapped product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && !PRODUCT.test(p.name) && !PRODUCT.test(p.slug);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; learned: ComparableMultiples } {
  const learned = comparableMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is on the board, even if its record were missing.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: below-floor pre-token protocols by TVL, never displacing a watchlist row.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, breakdown: impliedValue(p, snapshot.as_of, model, learned) }));
  scored.sort((a, b) => b.breakdown.implied_value_usd - a.breakdown.implied_value_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.breakdown.age_days,
    implied_value_usd: s.breakdown.implied_value_usd,
    model: s.breakdown,
    farm_steps: farmSteps(s.p, s.breakdown.age_days).map(stepText),
  }));
  return { board, learned };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and record the transaction.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The native settlement asset of a chain, for deposit instructions. */
function nativeAsset(chain: string): string {
  if (/ether|arbitrum|base|optimism|polygon zkevm|scroll|linea|blast/i.test(chain)) return 'ETH';
  if (/bitcoin/i.test(chain)) return 'BTC';
  if (/solana/i.test(chain)) return 'SOL';
  if (/bnb|binance/i.test(chain)) return 'BNB';
  if (/avalanche/i.test(chain)) return 'AVAX';
  if (/near/i.test(chain)) return 'NEAR';
  return `${chain} native asset`;
}

/** Deposit sizing from the protocol's own TVL: bigger venues need a larger stake to matter. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 400;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  return 100;
}

/** A longer qualifying window for younger protocols, in days. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** A category's deposit asset, action, main risk and gas tiers. Derived from category, never a name. */
interface FarmProfile {
  asset: string;
  verb: string;
  venue: string;
  risk: string;
  il: boolean;
  gas: number;
  weeklyGas: number;
}

function profileFor(p: SnapshotProtocol): FarmProfile {
  const c = (p.category ?? '').toLowerCase();
  const native = nativeAsset(chainOf(p));
  if (/liquid staking|restak|staking pool|staking/i.test(c)) {
    return { asset: native, verb: 'Stake', venue: 'staking contract', risk: 'slashing and a discount on the receipt token', il: false, gas: 6, weeklyGas: 1.5 };
  }
  if (/dex|yield|liquidity manager|leveraged farm|farm|basis trading|synthetics/i.test(c)) {
    return { asset: `USDC and ${native}`, verb: 'Provide two-sided liquidity in', venue: 'main pool', risk: 'impermanent loss if the pair diverges', il: true, gas: 12, weeklyGas: 3 };
  }
  if (/perpetual|derivative|option|interest rate/i.test(c)) {
    return { asset: 'USDC margin', verb: 'Post', venue: 'derivatives venue', risk: 'liquidation if the position moves against you', il: false, gas: 10, weeklyGas: 3 };
  }
  if (/bridge/i.test(c)) {
    return { asset: 'USDC', verb: 'Bridge', venue: 'canonical route', risk: 'bridge exploits and wrapped-asset depegs', il: false, gas: 10, weeklyGas: 1 };
  }
  if (/curator|capital allocator|collateral| Yield$/i.test(c) || /lend|cdp/i.test(c)) {
    return { asset: 'USDC', verb: 'Supply', venue: 'money market or vault', risk: 'smart-contract and utilization risk', il: false, gas: 8, weeklyGas: 2 };
  }
  if (/rwa|stable/i.test(c)) {
    return { asset: 'USDC', verb: 'Mint or deposit', venue: 'stable / RWA vault', risk: 'depeg and redemption or KYC friction', il: false, gas: 7, weeklyGas: 1.5 };
  }
  if (/insurance/i.test(c)) {
    return { asset: 'USDC', verb: 'Buy cover with', venue: 'cover market', risk: 'premium spent with no payout if no claim occurs', il: false, gas: 5, weeklyGas: 0.5 };
  }
  if (/prediction/i.test(c)) {
    return { asset: 'USDC', verb: 'Fund', venue: 'prediction market', risk: 'losing the stake on a wrong outcome', il: false, gas: 6, weeklyGas: 3 };
  }
  return { asset: 'USDC', verb: 'Deposit', venue: 'main contract', risk: 'smart-contract and counterparty risk', il: false, gas: 6, weeklyGas: 1.5 };
}

/** A bounded, honest annualisation of the only rate in the snapshot, for the yield-check step. */
function runRate(change: number | null): string {
  if (change === null) return 'no seven-day figure in the snapshot';
  const simple = clamp(change * 52, -95, 900);
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% over seven days, about ${simple >= 0 ? '+' : ''}${Math.round(simple)}% at that pace annualised`;
}

/**
 * A protocol's farm plan: seven concrete steps. Asset, action, risk, gas and hold come from the
 * protocol's category, chains, TVL and age; the rate check comes from its own 7-day change. Nothing
 * here is a hand-written list of protocol names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const pf = profileFor(p);
  const multiChain = p.chains.length > 1;
  const rate = runRate(p.change_7d);
  return [
    {
      text: `Open a fresh wallet used only for ${p.name}. Stage ${pf.asset} on ${chain} from an exchange or an existing wallet, keep the seed phrase offline and confirm you control the address.`,
      cost: `$${capital} of position capital plus about $${pf.gas} to fund the wallet`,
      time: '10 minutes',
    },
    {
      text: `${multiChain ? `If ${p.chains.slice(0, 3).join(' or ')} differs from your funding chain, bridge over the canonical route and keep the receipt.` : `Confirm ${chain} is selected in the app before signing anything.`} Budget for the bridge or network fee up front.`,
      cost: `about $${pf.gas} in gas or a 0.05-0.3% bridge fee on $${capital}`,
      time: '15 minutes',
    },
    {
      text: `${pf.verb} about $${capital} of ${pf.asset} into ${p.name}'s ${pf.venue} on ${chain}. Size the deposit so rewards cover gas: ${pf.il ? 'this is a two-asset position, so track the pool ratio' : 'this is a single-sided position with no LP impermanent loss'}.`,
      cost: `$${capital} deposited; $${pf.gas} gas; ${pf.il ? 'impermanent loss risk if the pair diverges' : pf.risk}`,
      time: '20 minutes',
    },
    {
      text: `Check the rewards or points page before adding more: ${rate}. That figure is TVL momentum, not an APR - read the live on-chain reward rate and fees before judging the deposit.`,
      cost: 'no fee to inspect the published rate and emissions',
      time: '10 minutes',
    },
    {
      text: `Keep one qualifying action each week - a deposit, a borrow, a swap or a governance vote on ${p.name} - and claim rewards back to the same wallet so the activity links to one address.`,
      cost: `about $${pf.weeklyGas} of gas per week`,
      time: '10 minutes a week',
    },
    {
      text: `Leave the position open for at least ${hold} days so the activity spans more than one snapshot epoch; ${age !== null && age < 180 ? 'the protocol is young, so a longer window raises the chance of a retroactive allocation' : 'a steady record is what counts for any retroactive allocation'}.`,
      cost: `$${capital} stays deployed; ${pf.risk}`,
      time: `${hold} days`,
    },
    {
      text: `Log the wallet, dates and every transaction hash. Before exiting, open ${p.name}'s own page for the claim link, never approve an unexpected token, and unwind in one session to limit gas.`,
      cost: `nothing to log; about $${pf.gas} gas to withdraw and claim`,
      time: '15 minutes at exit',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, carrying the full breakdown and structured farm plan. */
export function radarRow(row: BoardRow, watchlist: string[]): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlisted: watchlist.includes(row.slug),
    model: row.model,
    farm_plan: farmSteps(
      {
        slug: row.slug, name: row.name, category: row.category, chains: row.chains,
        tvl_usd: row.tvl_usd, change_7d: row.change_7d, mcap_usd: row.mcap_usd,
        listed_at: row.listed_at, gecko_id: row.gecko_id, symbol: row.symbol,
      },
      row.age_days,
    ),
    farm_steps: row.farm_steps,
  };
}

/** Thousands separators without relying on ICU locale data, so the bytes are identical everywhere. */
function withCommas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A clean, human-readable statement of the formula for the page. */
export function formulaText(model: ModelConstants): string {
  return `implied = clamp( round( TVL × comparable × (1 + clamp(change_7d, ${model.growth_floor}, ${model.growth_cap})/100 × ${model.growth_weight}) × ageFactor ), 1, ${withCommas(model.value_cap)} )`
    + `   •   comparable = median(mcap/TVL of this snapshot's token-bearing peers), by category when at least ${model.multiple_min_comps} peers exist, else global`
    + `   •   ageFactor = ${model.age_floor} + min(age, ${model.age_cap_days})/${model.age_cap_days} × ${model.age_range}, or 1.00 when listed_at is unknown`;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, learned } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  // The input's source line carries a URL; keep the page fully offline by removing any URL token.
  const offlineSource = snapshot.source.replace(/\bhttps?:\/\/\S+/gi, 'protocol index').replace(/\s+/g, ' ').trim();
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: offlineSource,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: round4(learned.global),
    peer_count: learned.count,
    multiples: [...learned.byCategory.entries()]
      .map(([category, multiple]) => ({ category, multiple: round4(multiple), peers: learned.counts.get(category) ?? 0 }))
      .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0))
      .slice(0, 10),
    formula: formulaText(model),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, not 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share one implied value: a board that ranks nothing is not a ranking`;
  }
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) {
    if (!known.has(r.slug) || /\s/.test(r.slug)) return `${r.slug} is not a clean snapshot slug`;
    if (!r.name || r.name.trim().length === 0) return `${r.slug} has no name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
