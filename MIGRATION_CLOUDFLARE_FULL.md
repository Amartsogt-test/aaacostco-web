# Plan — Move EVERYTHING to Cloudflare (off Firebase)

> **Honest framing first.** This is a **full backend rewrite**, not a config change.
> Realistic effort: **weeks-to-months** for one developer. The frontend (Cloudflare
> Pages) and edge caching are already done; the hard 90% is **Auth, realtime, and the
> data model**. Do it **strangler-fig style** (piece by piece, app stays live) — never
> big-bang. If the goal is just *speed from Mongolia*, the current hybrid already
> captures most of it (static catalog from the UB edge); going all-Cloudflare is mainly
> about consolidation / cost / removing the US-Firestore round-trip on live reads.

---

## 1. What we're moving (current app, grounded)

- **~18 Firestore collections:** products, orders, users, chats(+messages), coupons,
  settings, categories, reviews, products_ratings, sms_codes, carts, daily_reports,
  dailyManifests, filters, home_products, posts, system, mail.
- **26 Cloud Functions:** 13 callable (`onCall`), 4 HTTP webhooks (`onRequest`),
  8 Firestore triggers (`onDocument*`), 7 cron (`onSchedule`).
- **Firebase Auth:** SMS (carrier webhook), Facebook OAuth, anonymous, admin custom claim.
- **Firebase Storage:** product images.
- **Realtime:** `onSnapshot` for chat, order tracking, cart sync.
- **FCM push**, **Trigger-Email** (queueMail).

## 2. Service mapping (Firebase → Cloudflare)

| Firebase | Cloudflare | Difficulty |
|----------|-----------|------------|
| Hosting | **Pages** | ✅ Done |
| Edge caching | **Pages `_headers`** | ✅ Done |
| `onCall` / `onRequest` functions | **Workers** (one router) | 🟡 Mechanical port |
| `onSchedule` cron | **Workers Cron Triggers** | 🟢 Easy |
| `onDocument*` triggers | Fold logic into the Worker that writes the row, or **Queues** | 🟠 Redesign |
| Firestore (data) | **D1** (SQLite, relational) — `+ KV` for hot cache | 🔴 Schema redesign |
| Firestore realtime (`onSnapshot`) | **Durable Objects + WebSocket** (or SSE / polling) | 🔴 Build from scratch |
| Firestore security rules | **Worker-side authorization** | 🟠 Re-implement |
| Firebase Auth | **Custom (Workers + KV sessions + JWT)** or 3rd-party (Clerk/Supabase/Auth0) | 🔴 Hardest |
| Firebase Storage | **R2** | 🟢 Easy (copy + rewrite URLs) |
| FCM push | **Web Push via Workers (VAPID)** | 🟡 |
| Trigger-Email | **Workers + email API** (Resend / MailChannels) | 🟢 |

## 3. The three hard problems (decide these first)

### A. Authentication 🔴
Firebase Auth gives phone/SMS, Facebook OAuth, anonymous sessions, and admin custom
claims + the security-rule integration — none of which Cloudflare provides natively.
Options:
- **Build custom** on Workers: KV-backed sessions, JWT, your existing SMS-via-carrier-
  webhook flow, Facebook OAuth by hand, bcrypt admin passwords. Most control, most work.
- **Third-party** (Clerk / Supabase Auth / Auth0): faster, but adds a dependency and cost,
  and you still wire phone-SMS + admin roles.
- **Recommendation:** decide build-vs-buy before anything else — auth gates everything.

### B. Realtime (chat, order status, cart sync) 🔴
`onSnapshot` is free realtime in Firestore. On Cloudflare:
- **Durable Objects + WebSocket** per conversation/order (the proper way), or
- **SSE** from a Worker, or
- **Polling** (simplest; the order-status poller already exists for QPay).
- **Recommendation:** start with polling (cheapest), add Durable Objects only for chat.

### C. Data model (Firestore docs → D1 relational) 🔴
Design D1 tables: `products`, `orders` + `order_items`, `users`, `chats` + `messages`,
`coupons`, `loyalty_lots`, `settings`(kv), `categories`, `reviews`, `daily_reports`,
`manifests`. Flexible/nested doc fields → JSON columns where relational doesn't fit.
D1 limit: 10 GB/database (fine for this catalog). KV in front for the hot read paths
(catalog/search already served as static JSON — keep that).

## 4. Phased plan (strangler-fig — app stays live throughout)

**Phase 0 — Foundations (low risk)**
- ✅ Pages hosting + `_headers` (done).
- Move **images → R2** (copy `product-images/*`, put `images.costco.mn` in front, rewrite
  URLs in the scraper + product docs).
- Stand up a **Workers** project + a **D1** database (empty) + **KV** namespace.

**Phase 1 — Read path (low risk, high value)**
- Keep Firestore as source of truth for now. Build a Worker that serves catalog/search
  reads from D1/KV. Sync products Firestore→D1 nightly (your pipeline already builds the
  static index — point it at D1 too). Front-end reads from the Worker/edge. Reversible.

**Phase 2 — Auth (gated on decision A)**
- Implement the chosen auth. Run it in parallel (dual-auth) until proven, then cut over.

**Phase 3 — Write path / transactions**
- Port the callable + webhook functions to Workers: `createOrder` (+price-audit),
  `validateCoupon`, Wire/QPay invoice + callbacks, SMS request/verify, returns.
- Move orders/users/coupons/loyalty to D1. Re-implement security-rule checks in the
  Worker. The `onDocument*` trigger logic (loyalty credit, tier recompute, rating
  recompute, notifications) folds into these write Workers.

**Phase 4 — Cron**
- Port the 7 `onSchedule` jobs to **Workers Cron Triggers** (tier sync, loyalty expiry,
  manifest, price fix, index rebuild, abandoned-cart). Mechanical.

**Phase 5 — Realtime + push + email**
- Chat → Durable Objects (or polling first). Web Push via Workers. Email via Resend/
  MailChannels. Order tracking → polling.

**Phase 6 — Decommission Firebase**
- Once all reads/writes/auth run on Cloudflare and are verified, freeze Firestore, do a
  final D1 sync, flip the last reads, and retire the Firebase project.

## 5. Effort / risk

| Phase | Effort | Risk |
|-------|--------|------|
| 0 Images→R2 + scaffolding | days | 🟢 low |
| 1 Read path (D1/KV + Worker) | 1–2 wks | 🟢 low (reversible) |
| 2 Auth | 1–3 wks | 🔴 high |
| 3 Write/transactions + rules | 2–4 wks | 🔴 high (money paths) |
| 4 Cron | days | 🟢 low |
| 5 Realtime/push/email | 1–2 wks | 🟠 medium |
| 6 Decommission | days | 🟠 medium |

## 6. Decisions needed from you (before Phase 2/3)
1. **Auth:** build custom on Workers, or adopt Clerk/Supabase/Auth0?
2. **Realtime:** polling-only (cheapest) or Durable Objects for chat?
3. **Data:** D1 (SQLite) as primary, with KV for hot reads — agree?
4. **Scope/urgency:** full cut-over, or stop after Phase 1 (read path on Cloudflare,
   transactions stay on Firebase) — which already removes the US-Firestore latency for
   browsing, the main Mongolia pain point?

## 7. Recommendation
Do **Phase 0 + Phase 1** now (images→R2, read path on D1/KV) — low risk, and it captures
the remaining Mongolia-latency win for live data. **Pause and evaluate** before Phases 2–3
(auth + transactions): those are the expensive, risky part, and the hybrid (Cloudflare
front + Firebase back) is a perfectly good long-term resting point. Going further is a
consolidation/cost decision, not a performance necessity.
