# AGENTS.md — LINE

Read `PRODUCT.md` first. That file wins over this file, over comments, and over your instincts.

You are building LINE: a signal-only launchpad radar for Pons, o1, Base, and Pump.

---

## Always

- Ship working files. Do not stop after an outline.
- Use real DexScreener + factory/RPC adapters. Empty or STALE is valid.
- Pons discovery is the public graduated catalog (`/api/pons-launches/graduations?catalog=1`) plus factory V1/V2. Never Dex-search "pons" or "robinhood" as the discovery path.
- o1 discovery is `api.launch.o1.exchange/v1/tokens` with `O1_API_KEY`. If the key is missing, miss "not wired" and return []. Never invent o1 names.
- Keep secrets on the server. Env vars only.
- Render unknown stats as `—`.
- Keep the chrome copy exactly as in PRODUCT.md.
- Dedup by `chain:ca`. Upgrade factory rows when Dex arrives. Do not duplicate.
- Exclude protocol contracts from WHALES (Pons factory/router/hook/locker/executor, Uni v4 PoolManager, o1 factories/hooks/escrows).
- Detect Pons V2 graduated pools by hook `0xe5e702641ea86f4ae6cc3cdaed2b886f976be044`, never by PoolManager.
- Give o1 a 16s anti-snipe countdown, then `LIVE_POOL`. Never a bonding-curve fill.
- Prefer a designed empty/stale/error state over fake data.

---

## Never

- Never connect a wallet, embed a wallet, or render Connect / Sign / Approve / Swap / Snipe / Copy trade.
- Never hold keys, seeds, or session signers.
- Never invent tokens, tickers, heat, DEV%, sniper%, bundle%, or honeypot results. Never invent o1 launches when O1_API_KEY is unset.
- Never claim official affiliation with Robinhood, Pons Labs, o1, or Pump.fun.
- Never call inferred stage “official graduation” unless the factory event or migrate is real.
- Never blank a cached radar when one adapter dies. Mark STALE.
- Never put API keys in client code.
- Never 404 `/docs/wallet-security`.
- Never build a token launcher.
- Never treat PoolManager as a Pons filter.
- Never show `ON_CURVE` or `CURVE xx%` on an o1 row.
- Never count lockers, hooks, factories, or burn as whales.
- Never overwrite a watchlist on Import. Merge. Drop invalid CAs.

---

## Build order (V1 only unless asked)

1. Types + heat/stage/filter pure functions + `IDataSource`
2. `/api/health` + `/api/radar` (DexScreener + factory merge)
3. Header + three-lane radar (`NEW | STRETCH | BOOK`)
4. Search → `/t/{chain}/{ca}` desk
5. Watch / FIRST / Export / Import / Hide risky
6. `/docs/wallet-security` + README

V2 (holders, deployer dossier, classified tape/whales, stock lane, X handle) only after V1 acceptance in PRODUCT.md passes.

---

## Visual lock

Near-black terminal. Gold `#E8B923` selected chips. No Bootstrap dashboard look. Tabular nums. Desktop density first.

---

## When stuck

If an API is missing a key or is down: return `[]`, increment health misses, keep last snapshot if you have one.

If you are about to add mock PEPE rows: stop. That is a bug.

If you are about to add wagmi / RainbowKit / a Buy that sends a tx: stop. Link out to GMGN or DexScreener instead.
