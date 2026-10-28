# Codebase Audit — Findings & Fixes

A systematic, layer-by-layer audit of the costco.mn codebase (cleanup of dead code +
hunt for real logic/security bugs). Critical paths (payment, orders, loyalty, customs,
auth, currency) were reviewed end-to-end.

---

## ✅ Real bugs fixed

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 1 | Customs threshold | Unit tests + a checkout toast assumed a **3,000,000₮** duty-free cap, but the code enforces **660,000₮** everywhere else. | Tests realigned to 660k; `PaymentPage` toast made threshold-agnostic. |
| 2 | `AdminProductAdd.jsx` | A stale comment block claimed edit "creates new entries" — contradicting the actual (correct) update/add code. | Misleading comment removed. |
| 3 | Loyalty bonus | Client displayed `percent ?? **5**` while the server credits `percent ?? pointsPercent ?? **0**` → a "5% bonus" could show while **0** is credited. | Client now matches the server exactly (fallback 0). |
| 4 | `functions` manifest (CSV) | Duty-free default was **6,600,000₮** (10× typo) vs 660,000₮ everywhere else. | → 660,000₮. |
| 5 | `functions` manifest (summary) | Taxable-count threshold hardcoded **6,600,000₮** (same 10× typo). | → 660,000₮. |
| 6 | `qpayCallback` | Confirmed an order as fully paid on `paid_amount > 0` — **no amount check** (underpayment could auto-confirm). | Now requires `paid_amount >=` the stored invoice amount. |

## 🔒 Security hardening

| # | Area | Change |
|---|------|--------|
| 7 | `firestore.rules` orders | `create` was `if !isAuth() || …` (a guest could write an arbitrary/forged order). All orders are minted by the `createOrder` Cloud Function (Admin SDK, with price-audit), so client create is now `if false`. |

## 🧹 Dead code removed (34 files → `_archive/`, recoverable, git-ignored)

- **Root (23):** ad-hoc debug one-offs (`check_*`, `find-*`, `get*`, `fix_*`, `test_*`, `inspect-*`, `diagnostic`, …).
- **`scripts/` (5):** superseded / Vercel / old index builders + `core/auto-fix-zero-price.js`.
- **`src` (3 + 2):** `HeroBanner`, `ProductReviews`, `AdminGiftCards` components/pages, plus their orphaned `giftCardService` + `reviewService` (the gift-card & review features are fully inactive frontend-side).
- **1 dead export:** `persistEmailUser` (authUser.js).

## ✔️ Reviewed and confirmed clean (no bug)

- Currency conversion: `* wonRate` (KRW→MNT) / `/ wonRate` (MNT→KRW) consistent everywhere.
- Membership tiers: client (authStore) and server thresholds match (Silver <10M, Gold 10M–20M, Platinum ≥20M ₩).
- Total / 1% wire fee / charged amount: display == charged.
- Loyalty 50% redemption cap: client and server both `* 0.5`.
- Admin auth: secure (no hardcoded backdoor, sha256 PIN hash, random shadow passwords, webhook secrets enforced).
- SMS verification: expiry checked; code confirmed via carrier webhook (secret-gated) → no API brute-force vector.
- `eslint`: clean across utils / store / services / components / pages.
- `store` layer (9 files): all used, no dead exports.

---

## 📋 To apply (run on your machine)

```bash
# 1. Functions fixes (#3 wiring is client; #4–6 are server)
firebase deploy --only functions

# 2. Firestore rule hardening (#7) — then TEST a checkout still works
firebase deploy --only firestore:rules

# 3. Hosting (client fixes: #1 toast, #3 loyalty display)
npm run build
firebase deploy --only hosting

# 4. Verify tests (Windows — sandbox can't run build/full tests)
npm test            # expect 22 (shipments) + 27 + 19 + 12 all passing
```

**After deploying #7:** place a small test order on costco.mn and confirm it still
creates (all orders go through the `createOrder` Cloud Function — the dead client
`orderService.createOrder` / `orderStore.createOrder` path is unused).

## 💡 Recommended (optional)

- Remove the unused `orderService.createOrder` / `orderStore.createOrder` (the only path
  that wrote orders directly — now blocked by rule #7).
- Wire the daily manifest functions to read `settings.dutyFreeThresholdMNT` instead of the
  hardcoded `660000` default, so a future threshold change propagates automatically.
- Set `settings/general.launchSale.percent` (e.g. `5`) explicitly when running the launch
  promo — otherwise the bonus now correctly shows/credits **0%**.
- Gift-card & review backend (`recalcProductRating`, gift-card/review `firestore.rules`)
  is parked (features inactive). Harmless; remove later if not reviving.
