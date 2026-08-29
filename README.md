# LINE

Signal-only launchpad radar for Pons, o1, Base, and Pump.
LINE never holds keys and never swaps. Paste CA in the header to open a token.

Dev: next on port 3001. Do not take :3000. No tunnel.

Env (server, never ship secrets):

```
DEXSCREENER_BASE_URL=
ROBINHOOD_RPC_URL=
BITQUERY_API_KEY=
BASE_RPC_URL=
SOLANA_RPC_URL=
O1_API_KEY=
```

Unwired adapters return [] and an honest health miss (`detail: not wired`).
Pons discovery is the public graduated catalog + factory V1/V2, not Dex keyword search.

Routes: / /t/{chain}/{ca} /docs/wallet-security /api/radar /api/health /api/token
Unknown stats = em dash. Watch import merges, never wipes.
