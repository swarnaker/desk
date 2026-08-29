# Deploy LINE (durable)

Quick Cloudflare tunnels expire. Use a real host. LINE is **signal-only**: no wallet, no swaps, no keys in the browser.

Private repo: https://github.com/swarnaker/desk

This is **not** Grok Build. There is no in-app Publish button here.

## 1. Secrets stay off git

`.env` and `.env.local` are gitignored. Never commit `O1_API_KEY`, `ADMIN_PASSWORD`, or other secrets. `.env.example` has **names only**.

## 2. Vercel (Next.js)

1. [vercel.com](https://vercel.com) → Add New → Project → Import `swarnaker/desk` (GitHub, private).
2. Framework: Next.js. Root: repo root. Build: default (`next build`).
3. **Settings → Environment Variables** (Production + Preview). Names only, no quotes in this doc:

| Name | Required | Notes |
| --- | --- | --- |
| `ADMIN_USER` | yes | Single admin. Site stays locked without both admin vars. |
| `ADMIN_PASSWORD` | yes | Server-only. Cookie is httpOnly / SameSite=Lax / Secure on https. |
| `O1_API_KEY` | for o1 board | Header `x-api-key`. Unset = o1 not wired. |
| `TELEGRAM_BOT_TOKEN` | optional | Watched BIRTH/WAKE. Unset = telegram not wired. |
| `TELEGRAM_CHAT_ID` | optional | Same. |
| `ROBINHOOD_RPC_URL` | optional | Pons factory. Unset = factory off. |
| `BASE_RPC_URL` | optional | o1 factory fallback. |
| `BITQUERY_API_KEY` | optional | Pons factory fallback. |
| `SOLANA_RPC_URL` | optional | Leave empty. |
| `DEXSCREENER_BASE_URL` | optional | Default public Dex API. |
| `PAYBOX_INTENT_URL` | optional | Intent URL only, no credentials, unset = clipboard+panel only. Never a user/password. |

Never add `NEXT_PUBLIC_*` copies of these. Never paste secrets into the repo or chat.

4. Deploy. Hostname is `*.vercel.app` (or your domain). Open `/login`, then the 6h radar.

## 3. After deploy

- Unauthenticated `/` → `/login`. APIs → `{ ok: false }`.
- `/api/health` is up and must not list tokens or secrets.
- Do not attach a public Cloudflare quick tunnel.

## 4. GitHub

Already exported as a **private** repo: `swarnaker/desk` on `master`. Push from `/workspace/line` after changes. Do not `git add .env.local`.
