-- ============================================================================
-- Migration 002 — order lifecycle fields needed by the full tracking flow:
--   courier tracking number, extra customs charges, ETA, proof-of-delivery.
-- (returnRequest already exists in the base schema.)
-- Apply once:
--   npx wrangler d1 execute costco --remote --config cloudflare/wrangler.toml \
--       --file=cloudflare/migrations/002-order-lifecycle.sql
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; running twice errors harmlessly on
-- "duplicate column name" — safe to ignore.
-- ============================================================================

ALTER TABLE orders ADD COLUMN trackingNumber    TEXT;   -- courier / шуудангийн дугаар
ALTER TABLE orders ADD COLUMN additionalCharges TEXT;   -- JSON [{label, amount, paid}]
ALTER TABLE orders ADD COLUMN estimatedDelivery TEXT;   -- ETA label
ALTER TABLE orders ADD COLUMN deliveredReceiver TEXT;   -- who received it
ALTER TABLE orders ADD COLUMN deliveredPhoto    TEXT;   -- proof-of-delivery image URL
