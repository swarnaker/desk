# LINE — Product Requirements

Signal-only launchpad radar for **Pons, o1, Base, and Pump**.
Never holds keys. Never swaps. Never invents tokens.
This file is source of truth. If UI/types/copy drift, this document wins.

## 1. Positioning
LINE is the radar traders open before GMGN / Axiom / a wallet.
GMGN owns holder intel + execution. Axiom owns Solana Pulse + quick-buy. DexScreener owns the chart and is late on factory/curve rows. Pons / o1 / Pump are venues, not terminals.
LINE owns pad-accurate discovery on Robinhood + Base + Pump, including rows before a DEX indexes a pair.
One sentence: Understand Pons, o1, and Pump as different machines on one screen.

## 2. Non-goals
Do not build: wallet connect/custody/keys; in-app swap/snipe/limit/TP/SL/copy-trade; Telegram execution; token launcher; fake PEPE rows or synthetic heat; affiliation claims with Robinhood, Pons Labs, o1, or Pump.fun.
CTA = external GMGN / DexScreener / explorer.

## 3. Trust rules
1. Chrome always SIGNAL ONLY + `LINE never holds keys and never swaps. Paste CA in the header to open a token.`
2. /docs/wallet-security is a real route.
3. Secrets on server. No API keys in browser.
4. Missing stats `—`. Never fabricate DEV%/sniper%/bundle%/honeypot.
5. Protocol contracts are not whales.
6. Stage inferred unless factory PoolGraduated / Pump migrated / o1 pool live.
7. Same-name ticker copies hidden unless watched.

## 4. Surfaces
Radar `/` three-lane hunt. Token desk `/t/{chain}/{ca}`. Tape `/tape`. Whales `/whales`. Security `/docs/wallet-security`. Search in header.
Sticky header: LINE wordmark, live dot, RADAR|TAPE|WHALES, search, pad counts `3 Pons · 1 O1`.

## 5. Radar lanes
Three columns desktop / stacked mobile. Ingest early, display late. T+0 must not flood the radar.
Default radar is **survived names only** (graduated / moving / locked-v4 / o1 live). Curve chip OFF by default. The board is not a curve firehose.

**Age gate (default 6h).** A row is hidden from the radar unless at least one is true: `ageSec >= minAge` (3600 for chip "1h", 7200 for "2h", 21600 for "6h", 0 for "any age"); watched or FIRST (client watch set / markFirst); missing age only if survived locked major (BOOK). Stretch fill >= 0.70 does **not** punch ON_CURVE onto the default board. Stretch punches the age gate only when the Curve chip is on (`filters.curve === true`): then ON_CURVE may appear if `ageSec >= minAge` OR `curveFillPct >= 0.70`. Server still ingests every Dex/factory row into the snapshot (`firstSeenAt` at factory time if factory). `hiddenUnderAge` = count of ingested rows with `ageSec < minAge` that are NOT stretch (real number, 0 is valid; includes copies later hidden). Footer phrase matches the chip: N hidden under 6h (default) / 1h / 2h / any. GET `/api/radar` defaults to the same 6h+bonding+activity gates as the UI (`curve=1` include ON_CURVE, still typically age>=6h unless stretch fill>=0.70 with Curve on; `age=any` skip the floor; `age=1h` min 3600; `age=2h` min 7200; omitted/`age=6h` = 21600). Full ingest is persisted; the response is gated. Client `applyFilters` still runs (watch, vol0 BOOK, pad chips). Order: age gate, then bonding gate, then activity gate, then other filters, then copies. Watched bypass the AGE and ACTIVITY gates only — they do not bypass the bonding gate. Activity: hide unless vol1hUsd >= 5000 OR watched. Unwatched must have vol1hUsd >= 5000 (tx>=20 alone is no longer enough). Dead graduates stay off. 1h/2h chips remain for early tape. A watched ON_CURVE stays hidden until Curve is on.

**Bonding gate (default `filters.curve === false`).** Hide all ON_CURVE Pons/Pump rows. Zero ON_CURVE on the default board. Show only survived. o1 is never on-curve. `isOnCurve(row)`: pad PONS or PUMP and stage === ON_CURVE. `isSurvived(row)`: o1 LIVE_POOL or GRADUATED or MOVING (locked v4 after tax); Pons GRADUATED or MOVING or LIVE_POOL (locked-v4 book); Pump GRADUATED or MOVING; BASE not ON_CURVE, treat LIVE_POOL/GRADUATED/MOVING as survived, CASHCAT padSub=RH with liq is survived book. Factory still ingest; store firstSeenAt; do not display until age>=6h AND isSurvived (graduated or o1 live) AND activity, unless watched. Factory-only T+0 stays in snapshot/`hiddenUnderAge`, not on the board. Curve chip ON: ON_CURVE may appear, still behind the age gate.

Lanes AFTER the gates:
NEW: survived (graduated/live/locked-v4) AND age in [6h, 24h) + activity (typically age >= 6h via default gate). o1 6h–24h LIVE_POOL → NEW. 1h/2h chips can place younger survived names in NEW. Factory-only FACTORY / raw ON_CURVE: if they remain in tokens, lane can be NEW but bonding+age gates hide them.
STRETCH: ON_CURVE AND fill >= 0.70 AND (Pons/Pump). Server may still tag these STRETCH so when Curve is on they land in STRETCH. When Curve is off they are filtered out so STRETCH is empty. o1 never STRETCH.
BOOK: survived AND age >= 24h + activity (or missing age on a locked major). o1 age>=24h → BOOK. Hide BOOK rows with `vol1hUsd == 0` or null unless watched; NEW/STRETCH unchanged by this rule.
Sort in lane: movers first, then heat desc. RadarBoard rows `[...NEW, ...STRETCH, ...BOOK]`. No canonical pin. No 4-name pin.
Banners (real counts): `N factory launches shown before Dex indexed a pair.` (only factory-before-Dex rows that passed both age and bonding gates; likely 0). `Merged N Pons/O1/Base rows from previous snapshot.` `N hidden under 6h` (matches 1h/2h/any chip when selected). `STALE · last success Xs ago`. Empty board: if filtered length is 0 but ingest had young rows, designed empty + the hidden count. Do not invent rows.

## 6. TokenRow
Pad PONS|O1|BASE|PUMP. Chain robinhood|base|solana. Lane NEW|STRETCH|BOOK.
Stage FACTORY|ANTI_SNIPE|ON_CURVE|LIVE_POOL|GRADUATED|MOVING.
Quote ETH|WETH|USDC|USDG|STOCK|SOL|UNKNOWN.
Fields: id `${chain}:${ca}`, symbol, name, logoUrl?, ca, chain, pad, padSub?, quote, quoteCa?, lane, stage, moving, heat 0-400, risk {level, flags}, mcapUsd?, liqUsd?, vol1hUsd?, vol1hDeltaUsd?, buyPct?, buys?, sells?, uniqueBuyers1h?, uniqueSellers1h?, boostsActive?, ageSec?, curveFillPct? (Pons/Pump only), taxEndsAt? ISO, firstSeenAt, updatedAt, sources[], links {gmgn,dex,scan}, xHandle?, holders?, deployer?, deployerLaunchCount7d?, sameNameCopies?. uniqueBuyers1h / uniqueSellers1h / boostsActive are null when the API omits them — never invent 0.
Columns: Token | CA | Pad | Physics | Heat | Risk | Mcap | Liq | 1h vol | Buy% | Age | Stage | Links
Physics: Pons CURVE pct + quote + tax countdown; o1 TAX Ns then LOCKED V4; Pump BOND pct then MIGRATED; Base GRADUATED/MOVING/LIVE_POOL → LOCKED V4, otherwise pair age + liq; empty stats em-dash.

## 7. State machines
Pons RH 4663. V1 instant locked Uni v3. V2 bonding curve. Factory V1 0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB Factory V2 0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e (also catalog factories 0x0c37a24F5D23A486FA692d1500881d698B1F77a4 and 0x7E1EAbd52Ae29598e6483F72dCf1a70b14284dB8). Router 0xe33e9e479df8802cb0866d5d05258bec4cf62948 Hook 0xe5e702641ea86f4ae6cc3cdaed2b886f976be044 Locker 0x267444d099b10fb5ed7c3cc7b7c767adca574952 Graduation executor 0xc7819b64a1daecd7ec19856d026cb14efbd89046 PoolManager (NOT a Pons filter) 0x8366a39cc670b4001a1121b8f6a443a643e40951. Discovery is the public graduated catalog plus factory V1/V2 — never Dex keyword search "pons" or "robinhood".
TokenLaunched -> FACTORY|ON_CURVE lane NEW, tax ~5s ANTI_SNIPE overlay. curveFillPct = quoteReserved/threshold, STRETCH when fill>=0.70. LaunchSwept+PoolGraduated -> GRADUATED lane BOOK. Then MOVING on vol.
Threshold 4.2 ETH or per-asset USDG/stock.

o1 Base 8453 + RH 4663. NOT a curve. Never ON_CURVE or curve fill. Base factory 0xa52ad458cE0282a971ecC71C051A32f28946bb9F. 1B supply, 18 dec, opening FDV ~$4k, tax 99%->1% over 16s, LP locked. Launch: if now < launchAt+16s ANTI_SNIPE TAX countdown else LIVE_POOL (survived locked v4; NEW if age<24h, BOOK if age>=24h). o1 never STRETCH via curve. Quote ETH USDC USDG STOCK.

Pump Solana: Created ON_CURVE NEW (hidden unless Curve on). STRETCH bonding>=~70%. MIGRATED / PumpSwap / Raydium (pump mint) = GRADUATED (physics MIGRATED), same 6h + vol1hUsd >= 5000 + BIRTH/WAKE rules as Pons/o1. Raw ON_CURVE stays hidden on the default board. Pump CASHCAT copy hidden when RH CASHCAT exists.

Generic Base: only if not o1/Pons. Skip Gecko if Dex has the name.

## 8. Heat 0-400
freshness decay after 6h, buyPct>55, vol/mcap accel, moving, curveFill->1 (Pons/Pump only), tax window small boost. Penalties: thin LP, same-name copies, high bundle/sniper if known. RED cap: red cannot outrank a green mover.
Risk GREEN/AMBER/RED as in PRODUCT. Hide risky = RED + honeypot/mint-auth/freeze/extremely thin LP. AMBER stays.

## 9. Filters
Row1 All pads|Pons|O1|Base|Pump; All mood|Buy|Sell|Whales|Snipes; Liq $0$5k$20k$50k; Mcap any$5k$20k$50k$100k; Age 3h 12h any (max age).
Row2 age gate 1h | 2h | 6h (default) | any age; Curve (off by default — bonding gate); bucket any|1-6h|older; O1 gate; Desk (watched+FIRST+movers); Watch; FIRST; Export/Import; Hide risky; Stocks quote if cheap.
`Filters.ageGate`: `"1h" | "2h" | "6h" | "any"`. `DEFAULT_FILTERS.ageGate = "6h"`. `Filters.curve`: boolean. `DEFAULT_FILTERS.curve = false`.
Watch JSON v1 merge import.

## 10. Desk /t/{chain}/{ca}
Identity pad lane stage heat risk, desk badge ORGANIC or BOOSTED (DexScreener boosts > 0) or — if unknown, full CA (click copies, 1s copied hint), facts (including 1h unique buyers/sellers or —), PHYSICS panel, holders or —, Deployer row (CopyCa address + 7d launch count on this pad, or —; AMBER SERIAL if same deployer has >= 3 launches in 7d with mcap now < $5k). Never invent a launch count. If factory RPC / official records missing, dash and skip the flag. Clones, heat breakdown, prints if any, external links. Invalid CA designed empty. No swap button.

## 11. Tape/Whales V1 types only if needed; full UI is V2. Exclude protocol list from whales.

## 12. Data
IDataSource listRadar getToken listTape health.
Adapters:
- DexScreener search **pumpfun, cashcat, basecat only**. Do **not** Dex-search "pons", "o1", or "robinhood" as discovery (those queries return pad tokens $PONS/$O and leftovers 7645/HOOD/18932). Dex `tokens/v1` batches (~30) fill vol/liq/buyPct on official CAs.
- Pons graduated catalog (PUBLIC, no auth): `GET https://www.ponsfamily.com/api/pons-launches/graduations?catalog=1&v=8` — this is how HMM/DELTA/MOTION/YOLO appear without RPC.
- Pons factory V1 `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB` TokenLaunched (needs ROBINHOOD_RPC_URL). Missing key → miss "not wired".
- Pons factory V2 `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` TokenLaunched (needs ROBINHOOD_RPC_URL). Missing key → miss "not wired".
- o1 launch API `GET https://api.launch.o1.exchange/v1/tokens?chain_id=8453|4663&market=all&sort=trending|volume_24h|newest&limit=50` header `x-api-key: $O1_API_KEY`. Missing O1_API_KEY → miss "not wired" per chain, never invent o1 names.
- o1 factory fallback (needs BASE_RPC_URL). Missing → miss "not wired".
- Gecko Base secondary (skip names Dex already has).

Pad = PONS only if the row came from pons catalog / factory V1 / factory V2 (sources include pons). Do not classify every robinhood Dex hit as PONS. Generic RH leftovers must not appear as Pons.
Merge chain:ca lowercase. Official/factory row first; Dex upgrades in place. Snapshot data/radar-snapshot.json.
Env DEXSCREENER_BASE_URL ROBINHOOD_RPC_URL BITQUERY_API_KEY BASE_RPC_URL SOLANA_RPC_URL O1_API_KEY.
HealthFooter: factory 0/1 (off) when V1+V2+o1 factory are all misses. Catalog ok is a separate live source ("pons catalog 1/1") and must not claim factory is wired.

## 13. Visual
bg #07080B surface #0E1016 card #111318 hairline #1E2230 text #E8E6DF muted #8B90A0 gold #E8B923 live #3DDC97 buy #1FA971 sell #E5484D. Gold selected chips black text. Tabular. 52-56px rows. prefers-reduced-motion.

## 14. V1 must: types, apis, header+three-lane, physics, search+desk, watch/FIRST/export/import/hide risky, security, health footer.

## 15. Acceptance
1 live names or designed empty/stale
2 paste real CA opens desk with real links
3 no in-app custody chrome
4 no hardcoded fake tickers
5 factory-only rows before Dex, banner real
6 o1 never bonding-curve fill
7 Pons V2 grad by hook not PoolManager
8 gold chips terminal not Bootstrap
9 /docs/wallet-security not 404
10 health footer numbers move

## 16. Copy bank (exact)
SIGNAL ONLY
LINE never holds keys and never swaps. Paste CA in the header to open a token.
New names on Pons and Base
TOP IS NEW + MOVERS
Fresh launches and CAs that just started printing buys jump to the top. Stage is inferred from pair age and liquidity/mcap -- not an official pad graduation.
Paste CA / Sol mint
drawdown rules -> docs/wallet-security

## 17. If adapter not wired: return [] and honest health miss. Never mock token arrays.

## 18. Runner
BIRTH, WAKE, sort, and same-ticker copies apply to **every** Pons, o1, and Pump row. CASHCAT, BASECAT, $PONS, and $O are examples of names Dex may return, not an allow-list. Do not pin them first, force their lane to BOOK, skip the WAKE bar, or show a CANONICAL pill as a product feature. CASHCAT padSub=RH is pad accuracy (RH mascot, not a Pons launch), not a runner pin.

**BIRTH** (any token). Pill only on NEW: `isSurvived` (just-graduated Pump/Pons, or o1 live) AND age < 24h. Never BOOK. Never ON_CURVE. Never age >= 70 days. Never a raw curve name. A 7h survived name with activity is NEW and BIRTH is allowed. A 90-minute Pump still ON_CURVE is hidden unless Curve is on and is not BIRTH. A 3-minute name is not shown on the default 6h board (counted in hidden under 6h). No allow-list. o1 never uses `curveFillPct`.

**WAKE** (any token, exact):
`wake = ageSec >= 24h AND vol1hUsd != null AND vol1hUsd >= max(3 * (vol24hUsd/24), 25000) AND uniqueBuyers1h >= 15`
Missing `vol24hUsd` → hourly baseline 0 so bar = $25k (still need $25k 1h). Missing `uniqueBuyers1h` → skip WAKE (never invent 0). Dust cannot WAKE. A wash-tape name with $40k/h and 3 unique buyers is not WAKE. Dead copies with ~$100/h are not WAKE. No canonical exception.
Hide BOOSTED-only names when boosts are known and uniqueBuyers1h is known and < 10. If boost count is unknown, do not hide on this rule.
GET `/api/radar` default `on_curve=0` (Curve off). `curve=1` or `on_curve=1` includes ON_CURVE.

**Sort:** table is NEW, then STRETCH, then BOOK from `splitLanes`. In-lane: movers first (green movers before red), then heat desc. RED cannot outrank a green mover. When Curve is off, STRETCH is empty so a 70% Pump curve does not outrank BOOK majors on the default board. With Curve on, a 70% Pump curve (STRETCH) still renders before BOOK.

**Copies:** group by `tickerKey(symbol)` = trim+upper+strip quotes/spaces. Keep ONLY the highest `mcapUsd` row per ticker (missing mcap = -1). All other same-ticker rows attach as `clones[]` on the kept row (COPY on the desk). Pump CASHCAT is COPY when RH CASHCAT exists. Server never keeps FIRST extras. Watched copies may stay on the client board only. Do not prefer hardcoded CAs. Age+bonding gates apply first. Watch does not bypass the bonding gate.
