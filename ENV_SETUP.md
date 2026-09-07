# Environment Variable Setup for FIRST HOUR API

## ✅ Code Changes Complete

**Master Commit**: `b7c0f05e1fc4f51d90fa37fa6506ea73922f0368`
- Added `maxDuration = 60` to `/api/first-hour/route.ts`
- Uses `fetchPonsTokens` from `@/lib/firstHour/pons-data`
- RPC harvest logic matches standalone firsthour (80k block window)

## 🔧 Required: Set ROBINHOOD_RPC_URL in Vercel

### Environment Variable

```bash
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com
```

**Scope**: Production + Preview

### Method 1: Vercel Dashboard (Recommended)

1. Go to https://vercel.com/swarnaker/desk
2. Navigate to **Settings** → **Environment Variables**
3. Click **Add New**
4. Fill in:
   - **Key**: `ROBINHOOD_RPC_URL`
   - **Value**: `https://rpc.mainnet.chain.robinhood.com`
   - **Environments**: ✅ Production, ✅ Preview
5. Click **Save**
6. Redeploy or wait for next deployment

### Method 2: Vercel CLI

#### Option A: Using the provided script

```bash
cd /workspace
./scripts/set-vercel-env.sh
```

#### Option B: Manual CLI commands

```bash
# Authenticate first
vercel login

# Set for Production
echo "https://rpc.mainnet.chain.robinhood.com" | vercel env add ROBINHOOD_RPC_URL production

# Set for Preview
echo "https://rpc.mainnet.chain.robinhood.com" | vercel env add ROBINHOOD_RPC_URL preview
```

### Method 3: Vercel API (if you have a token)

```bash
# Get your Vercel token from https://vercel.com/account/tokens
VERCEL_TOKEN="your_token_here"
PROJECT_ID="your_project_id"
TEAM_ID="your_team_id"

# Add to Production
curl -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "ROBINHOOD_RPC_URL",
    "value": "https://rpc.mainnet.chain.robinhood.com",
    "type": "encrypted",
    "target": ["production"]
  }'

# Add to Preview
curl -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "ROBINHOOD_RPC_URL",
    "value": "https://rpc.mainnet.chain.robinhood.com",
    "type": "encrypted",
    "target": ["preview"]
  }'
```

## Verification

### Before Setting (Catalog Only)

```bash
curl https://linespace.space/api/first-hour | jq '.health'
```

Expected:
```json
[
  {
    "name": "Pons catalog",
    "ok": true,
    "detail": "7 graduated (cached)"
  },
  {
    "name": "RPC graduations",
    "ok": false,
    "detail": "rpc not wired"
  },
  {
    "name": "RPC bonding",
    "ok": false,
    "detail": "rpc not wired"
  }
]
```

Token count: ~7

### After Setting (Full RPC Harvest)

```bash
curl https://linespace.space/api/first-hour | jq '.health'
```

Expected:
```json
[
  {
    "name": "Pons catalog",
    "ok": true,
    "detail": "7 graduated (cached)"
  },
  {
    "name": "RPC graduations",
    "ok": true,
    "detail": "24 RPC grads (cached)"
  },
  {
    "name": "RPC bonding",
    "ok": true,
    "detail": "0 bonding (cached)"
  }
]
```

Token count: ~24

## Why This RPC URL?

- **Public Robinhood Chain RPC**: https://rpc.mainnet.chain.robinhood.com
- **No authentication required**: Public endpoint
- **Safe for Vercel**: Can be stored in environment variables
- **Same as standalone**: firsthour-puce.vercel.app uses this URL

## Troubleshooting

### Environment variable not taking effect

1. **Redeploy required**: Environment variables only apply to new deployments
   - Trigger a redeploy from Vercel Dashboard
   - Or push a new commit to trigger automatic deployment

2. **Check environment**: Ensure variable is set for the correct environment (Production/Preview)

3. **Verify logs**: Check deployment logs for any RPC connection errors

### API still showing "rpc not wired"

1. **Clear cache**: RPC results are cached for 5 minutes
2. **Wait for new deployment**: Check deployment timestamp
3. **Verify variable name**: Must be exactly `ROBINHOOD_RPC_URL`

## Summary

✅ **Code**: Merged to master (commit b7c0f05)  
🔧 **Action Required**: Set `ROBINHOOD_RPC_URL` in Vercel  
🎯 **Goal**: Enable RPC harvest for ~24 tokens instead of catalog-only ~7 tokens
