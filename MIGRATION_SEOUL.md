# Migration Runbook — Firestore → Seoul + Cloudflare

Goal: lowest latency from Mongolia. The **code is already fully env-driven** — no code
changes are needed beyond setting environment variables and redeploying.

Env switches the app uses (already wired):

| Where | Variable | Migrate value |
|-------|----------|---------------|
| `functions/.env` | `FIRESTORE_DATABASE_ID` | `seoul` (the new DB id) |
| `functions/.env` | `FIRESTORE_TRIGGER_REGION` | `asia-northeast3` |
| `.env.local` (client) | `VITE_FIRESTORE_DB_ID` | `seoul` |
| scripts | `FIRESTORE_DATABASE_ID` | `seoul` (set in shell or .env.local) |

Callable/HTTP functions are already in `asia-northeast3`. Only the 5 Firestore document
triggers move (region is now `FIRESTORE_TRIGGER_REGION`, default `us-central1`).

---

## Part A — Firestore → Seoul (asia-northeast3)

> ⚠️ Do this in a **maintenance window**. costco.mn already has a maintenance screen
> (`src/maintenance.js` / `src/main.jsx`) — use it so no writes hit the old DB mid-copy.
> The `costco-fe034.web.app` URL bypasses the maintenance screen, so you can still test.

### 1. Create the Seoul database
Firebase console → Firestore → **Add database** → location **asia-northeast3 (Seoul)** →
database id e.g. **`seoul`** → same security rules. (Or: `gcloud firestore databases create --database=seoul --location=asia-northeast3`.)

### 2. Copy the data (Google managed export/import — reliable, all collections + subcollections)
```bash
# Export the current (default) DB to a GCS bucket
gcloud firestore export gs://costco-fe034-migrate --database='(default)'

# Import that export INTO the new Seoul DB (use the path printed by the export)
gcloud firestore import gs://costco-fe034-migrate/<EXPORT_FOLDER> --database='seoul'
```
(If you don't have a bucket: `gsutil mb -l asia-northeast3 gs://costco-fe034-migrate`.)

### 3. Point the app + functions + scripts at the Seoul DB
- `functions/.env` — add:
  ```
  FIRESTORE_DATABASE_ID=seoul
  FIRESTORE_TRIGGER_REGION=asia-northeast3
  ```
- `.env.local` — add:
  ```
  VITE_FIRESTORE_DB_ID=seoul
  ```

### 4. Redeploy
```bash
firebase deploy --only functions
# The 5 document triggers now deploy to asia-northeast3. Firebase creates the new ones
# but does NOT auto-remove the old us-central1 copies — delete them so they don't
# double-fire against the (now stale) default DB:
firebase functions:delete syncProductPrices onProductCreated notifyOrderStage notifyChatMessage recalcProductRating --region us-central1

npm run build
firebase deploy --only hosting
```

### 5. Verify
- Browse / search on `costco-fe034.web.app` → products load (reads hit Seoul).
- Place a small test order → it appears, and auto-confirms on payment (a trigger firing
  in asia-northeast3 proves triggers work against the Seoul DB).
- Then turn the maintenance screen **off**.

### 6. Rollback (if anything is wrong)
Remove the three env vars (or set `FIRESTORE_DATABASE_ID=(default)`,
`FIRESTORE_TRIGGER_REGION=us-central1`, unset `VITE_FIRESTORE_DB_ID`), redeploy. The app
talks to the original US DB again — which still has all the original data.

---

## Part B — Cloudflare (edge, lowest latency from Mongolia)

### 1. Cache the catalog JSON at the edge (biggest single win — already set up in code)
The site is deployed to **Cloudflare Pages** (`npm run deploy:cloudflare` →
`wrangler pages deploy dist --project-name costco-fe`), NOT a proxied DNS zone — so there
is no zone-level "Cache Rules" page. Edge caching is controlled by a **`public/_headers`**
file (copied to `dist/_headers` at build, read by Pages).

`public/_headers` is now in the repo with:
- `/assets/*` → `immutable` (hashed build files)
- `/*.json` → `max-age=300, stale-while-revalidate=86400` (catalog data, served from the
  Ulaanbaatar PoP)
- `/sw.js`, `/registerSW.js` → `no-cache` (PWA updates ship immediately)

**To apply:** `npm run deploy:cloudflare`. Verify: `home-snapshot.json` / `search-index.json`
responses show `cf-cache-status: HIT` after a couple of loads.

### 2. Images → R2 (optional, removes egress cost + serves from edge)
- Create an R2 bucket; copy `product-images/*` from Firebase Storage into it.
- Put `images.costco.mn` (Cloudflare) in front of the bucket; update image URLs (the
  scraper writes Firebase Storage URLs — add a rewrite, or change the host).

### 3. Hosting on Cloudflare Pages (optional, fully-edge static)
- Build (`npm run build`) → deploy `dist/` to Cloudflare Pages.
- Add a `public/_headers` for cache-control (assets immutable; `*.json` short TTL).
- Keeps the app served entirely from Cloudflare's edge instead of proxying Firebase.

---

## Order of operations (recommended)
1. **Cloudflare cache rule** (Part B.1) — instant win, zero risk, no migration needed.
2. **Firestore → Seoul** (Part A) — in a maintenance window, with rollback ready.
3. R2 / Pages (Part B.2–3) — later, incremental.
