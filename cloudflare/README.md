# Cloudflare migration — Phase 0–1 (read path off Firebase)

Concrete, runnable starting point for moving the backend to Cloudflare. Built so far:

| File | What it is |
|------|-----------|
| `d1-schema.sql` | D1 (SQLite) schema for all ~18 Firestore collections. **Verified** against SQLite. |
| `wrangler.toml` | The backend Worker config — D1 + KV + R2 bindings. |
| `worker/index.js` | Phase-1 **read-path API** Worker: `/api/products`, `/api/product/:id`, `/api/search`, `/api/categories` — served from D1 with a KV cache. **Syntax-verified.** |
| `export-firestore-to-d1.mjs` | Reads every Firestore collection → emits `seed/seed-<table>.sql`. **Syntax-verified.** |

## Run order (on your machine — needs wrangler + Firestore creds)

```bash
# 1. Provision (one-time)
wrangler d1 create costco                      # paste database_id → wrangler.toml
wrangler kv namespace create CACHE             # paste id        → wrangler.toml
wrangler r2 bucket create costco-images

# 2. Create tables
wrangler d1 execute costco --file=cloudflare/d1-schema.sql

# 3. Export data from Firestore and load it into D1
node cloudflare/export-firestore-to-d1.mjs
for f in cloudflare/seed/seed-*.sql; do wrangler d1 execute costco --file="$f"; done

# 4. Deploy the read-path Worker
cd cloudflare && wrangler deploy

# 5. Point the front-end's catalog/search reads at the Worker URL (or a /api route on
#    the Pages domain via a Pages Function binding). Reversible — Firestore stays the
#    source of truth until later phases.
```

## Verify
- `curl https://costco-api.<your>.workers.dev/api/products?limit=5` → active products.
- `curl .../api/search?q=protein` → matches.
- `curl .../api/categories` → the menu categories.

## Not yet built (later phases — see ../MIGRATION_CLOUDFLARE_FULL.md)
- **Phase 2 Auth** (decision needed: custom Workers+KV vs Clerk/Supabase).
- **Phase 3 Write/transactions** (createOrder + price-audit, Wire/QPay webhooks, returns)
  + Worker-side authorization (replacing firestore.rules) + the onDocument trigger logic
  (loyalty credit, tier recompute, rating recompute) folded into the write Workers.
- **Phase 4 Cron** — the 7 onSchedule jobs → Workers Cron Triggers.
- **Phase 5** realtime (chat → Durable Objects / polling), Web Push, email.
- **Images → R2**: copy `product-images/*` into the `costco-images` bucket; point
  `images.costco.mn` at it; rewrite product image URLs.

This is **Phase 0 + the Phase-1 read path** — low risk, reversible, and it removes the
US-Firestore round-trip for browsing (the main Mongolia latency cost). Pause and evaluate
before Phases 2–3 (auth + money paths).
