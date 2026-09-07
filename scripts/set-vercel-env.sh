#!/bin/bash
# Set ROBINHOOD_RPC_URL for desk project on Vercel
# Run this script after authenticating with `vercel login`

set -e

PROJECT="desk"
RPC_URL="https://rpc.mainnet.chain.robinhood.com"

echo "Setting ROBINHOOD_RPC_URL for project: $PROJECT"
echo "Value: $RPC_URL"
echo ""

# Set for Production
echo "Setting for Production..."
echo "$RPC_URL" | vercel env add ROBINHOOD_RPC_URL production --yes 2>/dev/null || echo "$RPC_URL" | vercel env add ROBINHOOD_RPC_URL production

# Set for Preview
echo "Setting for Preview..."
echo "$RPC_URL" | vercel env add ROBINHOOD_RPC_URL preview --yes 2>/dev/null || echo "$RPC_URL" | vercel env add ROBINHOOD_RPC_URL preview

echo ""
echo "✅ Environment variables set successfully!"
echo ""
echo "Next steps:"
echo "1. Redeploy or wait for next deployment"
echo "2. Verify at: https://linespace.space/api/first-hour"
echo ""
echo "Expected health with RPC configured:"
echo '  { "name": "RPC graduations", "detail": "~24 RPC grads" }'
echo '  { "name": "RPC bonding", "detail": "0 bonding" }'
