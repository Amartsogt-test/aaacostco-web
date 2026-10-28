-- ============================================================================
-- Migration 001 — FTS5 full-text product search (replaces slow LIKE '%q%' scans).
-- Apply once:
--   npx wrangler d1 execute costco --remote --config cloudflare/wrangler.toml \
--       --file=cloudflare/migrations/001-fts-search.sql
-- Idempotent: safe to re-run. The Worker /api/search falls back to LIKE if this
-- table is absent, so deploying the code before applying this migration is fine.
-- ============================================================================

-- Searchable text only (id UNINDEXED so we can join back to products for the row).
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  id UNINDEXED, name, name_mn, englishName, brand
);

-- Keep the FTS index in sync with the products table.
CREATE TRIGGER IF NOT EXISTS products_fts_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts (id, name, name_mn, englishName, brand)
  VALUES (new.id, new.name, new.name_mn, new.englishName, new.brand);
END;

CREATE TRIGGER IF NOT EXISTS products_fts_ad AFTER DELETE ON products BEGIN
  DELETE FROM products_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS products_fts_au AFTER UPDATE ON products BEGIN
  DELETE FROM products_fts WHERE id = old.id;
  INSERT INTO products_fts (id, name, name_mn, englishName, brand)
  VALUES (new.id, new.name, new.name_mn, new.englishName, new.brand);
END;

-- One-time backfill of rows that existed before the triggers (idempotent).
INSERT INTO products_fts (id, name, name_mn, englishName, brand)
SELECT id, name, name_mn, englishName, brand FROM products
WHERE id NOT IN (SELECT id FROM products_fts);
