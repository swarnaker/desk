# FIRST HOUR API - Deployment Complete

## ✅ Merged to Master

**Commit SHA**: `b7c0f05e1fc4f51d90fa37fa6506ea73922f0368`

Merge commit: https://github.com/swarnaker/desk/commit/b7c0f05e1fc4f51d90fa37fa6506ea73922f0368

## Changes Made

1. **Added `maxDuration = 60`** to `/api/first-hour/route.ts`
   - Allows RPC eth_getLogs over 80,000 blocks
   - Prevents serverless timeout during DexScreener batch enrichment

2. **Verified Implementation**
   - ✅ Uses `fetchPonsTokens` from `@/lib/firstHour/pons-data`
   - ✅ Matches standalone firsthour logic (80k block window)
   - ✅ Health reports "rpc not wired" vs actual counts
   - ✅ No changes to Radar or Telegram

## 🔧 Manual Action Required

### Set Environment Variable in Vercel Production

The API requires `ROBINHOOD_RPC_URL` to be set in Vercel production environment.

**Via Vercel Dashboard:**
1. Go to https://vercel.com/swarnaker/desk
2. Settings → Environment Variables
3. Add new variable:
   - **Name**: `ROBINHOOD_RPC_URL`
   - **Value**: `https://rpc.mainnet.chain.robinhood.com`
   - **Environment**: Production ✅ (check only Production)
4. Redeploy or wait for next deployment

**Via Vercel CLI:**
```bash
vercel env add ROBINHOOD_RPC_URL production
# When prompted, paste: https://rpc.mainnet.chain.robinhood.com
```

### Verification

After setting the environment variable and redeploying:

**Expected Response** (with RPC configured):
```json
{
  "tokens": [...], // ~24 tokens
  "health": [
    { "name": "Pons catalog", "detail": "7 graduated (cached)" },
    { "name": "RPC graduations", "detail": "24 RPC grads (cached)" },
    { "name": "RPC bonding", "detail": "0 bonding (cached)" }
  ],
  "timestamp": 1725734800000
}
```

**Without RPC configured** (catalog-only):
```json
{
  "tokens": [...], // ~7 tokens
  "health": [
    { "name": "Pons catalog", "detail": "7 graduated (cached)" },
    { "name": "RPC graduations", "ok": false, "detail": "rpc not wired" },
    { "name": "RPC bonding", "ok": false, "detail": "rpc not wired" }
  ],
  "timestamp": 1725734800000
}
```

## Live URL

**Production**: https://linespace.space/api/first-hour

## Implementation Details

### Data Sources

1. **Pons Catalog** (public API)
   - `GET https://www.ponsfamily.com/api/pons-launches/graduations?catalog=1&v=8`
   - Returns ~7 graduated tokens

2. **RPC Graduations** (requires `ROBINHOOD_RPC_URL`)
   - `eth_getLogs` for PoolGraduated events: `0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259`
   - `eth_getLogs` for LaunchSwept events: `0xcdb72f157fd3666758a6ce201387ffb52038c7562e4fff352828da1096c4b6b4`
   - Scans last 80,000 blocks
   - Returns ~24 RPC-harvested graduations

3. **RPC Bonding** (requires `ROBINHOOD_RPC_URL`)
   - `eth_getLogs` for TokenLaunched events: `0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a`
   - Scans last 80,000 blocks
   - Returns bonding curve tokens

### Performance

- **Timeout**: 60 seconds (`maxDuration = 60`)
- **Cache**: 5 minutes (300,000ms)
- **Block window**: 80,000 blocks (~8 hours at 10s/block)
