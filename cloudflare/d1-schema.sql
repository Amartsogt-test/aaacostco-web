-- ============================================================================
-- costco.mn — Cloudflare D1 schema (Firestore → SQLite migration, Phase 0)
-- ============================================================================
-- Design notes:
--  * Money: prices are INTEGER. Product price/originalPrice/warehouse are KRW (₩);
--    order totals/fees are MNT (₮). (Matches the app: item.price=KRW, order.total=MNT.)
--  * Flexible/nested Firestore fields (arrays, maps) are kept as JSON TEXT columns —
--    SQLite has json_extract() for querying them; relational where it pays off.
--  * Timestamps stored as TEXT ISO-8601 (what the app already writes), so a copy
--    from Firestore needs no conversion.
--  * Apply:  wrangler d1 execute costco --file=cloudflare/d1-schema.sql
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- products ---
CREATE TABLE IF NOT EXISTS products (
  id                      TEXT PRIMARY KEY,          -- Costco product code
  name                    TEXT,                      -- original (Korean)
  name_mn                 TEXT,
  englishName             TEXT,
  brand                   TEXT,
  code                    TEXT,
  image                   TEXT,                       -- main image URL (R2 after Phase 0)
  price                   INTEGER DEFAULT 0,          -- ₩ (online)
  originalPrice           INTEGER DEFAULT 0,          -- ₩ (pre-discount)
  estimatedWarehousePrice INTEGER DEFAULT 0,          -- ₩ (store price)
  estimatedMarkupKrw      INTEGER DEFAULT 0,
  hasDiscount             INTEGER DEFAULT 0,          -- 0/1
  hidePriceValue          INTEGER DEFAULT 0,          -- Costco hides online price
  priceFromWarehouse      INTEGER DEFAULT 0,
  status                  TEXT DEFAULT 'active',      -- active|inactive|pendingReview|deleted
  categoryCode            TEXT,                       -- cos_X (top-level menu code)
  targetCode              TEXT,
  weight                  REAL,
  barcode                 TEXT,
  stock                   TEXT,
  shortDescription        TEXT,
  description             TEXT,
  description_mn          TEXT,
  ratingsAvg              REAL DEFAULT 0,
  reviewCount             INTEGER DEFAULT 0,
  restricted              INTEGER DEFAULT 0,
  restrictedNote          TEXT,
  specifications          TEXT,                       -- JSON
  additionalCategories    TEXT,                       -- JSON array
  categoryPath            TEXT,                       -- JSON array (browse: contains code)
  images                  TEXT,                       -- JSON array
  lastScraped             TEXT,
  createdAt               TEXT,
  updatedAt               TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_status        ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_categoryCode  ON products(status, categoryCode);
CREATE INDEX IF NOT EXISTS idx_products_lastScraped   ON products(status, lastScraped);
CREATE INDEX IF NOT EXISTS idx_products_barcode       ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_code          ON products(code);
CREATE INDEX IF NOT EXISTS idx_products_status_upd    ON products(status, updatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_products_status_disc   ON products(status, hasDiscount);
CREATE INDEX IF NOT EXISTS idx_products_status_target ON products(status, targetCode);

-- ------------------------------------------------------------------ users ---
CREATE TABLE IF NOT EXISTS users (
  uid                TEXT PRIMARY KEY,
  phone              TEXT,
  name               TEXT,
  email              TEXT,
  isAdmin            INTEGER DEFAULT 0,
  loginProvider      TEXT,
  registrationMethod TEXT,
  loyaltyPointsKRW   INTEGER DEFAULT 0,               -- aggregate ₩ (server-authoritative)
  loyaltyLots        TEXT,                            -- JSON [{krw,creditedAt,expiresAt,orderId}]
  totalSpendKRW      INTEGER DEFAULT 0,
  tier               TEXT DEFAULT 'Silver',
  followStatus       TEXT,                            -- JSON
  addresses          TEXT,                            -- JSON array (saved delivery addresses)
  fcmTokens          TEXT,                            -- JSON array (web-push tokens)
  createdAt          TEXT,
  lastLogin          TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ----------------------------------------------------------------- orders ---
CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,                  -- DDHHNN
  userId            TEXT,
  customer          TEXT,
  customerEmail     TEXT,
  recipientName     TEXT,
  recipientPhone    TEXT,
  recipientPhone2   TEXT,
  recipientRegister TEXT,
  recipientCustomsAddress TEXT,
  recipientAddress  TEXT,
  deliveryMode      TEXT,
  branch            TEXT,
  deliveryFee       INTEGER DEFAULT 0,                 -- ₮
  total             INTEGER DEFAULT 0,                 -- ₮ (goods+shipping, pre-fee)
  amountPaid        INTEGER DEFAULT 0,                 -- ₮ (total + payment fee)
  paymentFee        INTEGER DEFAULT 0,                 -- ₮
  currency          TEXT DEFAULT 'MNT',
  paymentMethod     TEXT,
  couponCode        TEXT,
  couponDiscount    INTEGER DEFAULT 0,
  tierDiscount      INTEGER DEFAULT 0,
  pointsRedeemedKRW INTEGER DEFAULT 0,
  pointsDiscount    INTEGER DEFAULT 0,
  launchSale        INTEGER DEFAULT 0,
  pointsCredited    INTEGER DEFAULT 0,
  pointsCreditedKRW INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'Processing',
  trackingStage     TEXT DEFAULT 'received',
  trackingHistory   TEXT,                              -- JSON array
  priceAudit        TEXT,                              -- JSON (server price-audit)
  shipmentGroup     TEXT,
  qpay              TEXT,                              -- JSON {invoiceId,amount,paid,...}
  wire              TEXT,                              -- JSON {intentId,amount,paid,...}
  returnRequest     TEXT,                              -- JSON
  brokerageConsent  INTEGER DEFAULT 0,
  deliveryLocation  TEXT,                              -- JSON
  createdAt         TEXT,
  date              TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_userId        ON orders(userId, date);
CREATE INDEX IF NOT EXISTS idx_orders_recipientPhone ON orders(recipientPhone);
CREATE INDEX IF NOT EXISTS idx_orders_stage         ON orders(trackingStage);
CREATE INDEX IF NOT EXISTS idx_orders_createdAt     ON orders(createdAt);
CREATE INDEX IF NOT EXISTS idx_orders_date          ON orders(date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shipmentGroup ON orders(shipmentGroup);

CREATE TABLE IF NOT EXISTS order_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      TEXT,
  name            TEXT,
  price           INTEGER DEFAULT 0,                   -- ₩ unit
  quantity        INTEGER DEFAULT 1,
  image           TEXT,
  shippingMethod  TEXT DEFAULT 'ground',
  selectedOptions TEXT                                 -- JSON
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ------------------------------------------------------------ chats / msgs ---
CREATE TABLE IF NOT EXISTS chats (
  id            TEXT PRIMARY KEY,
  userId        TEXT,
  userName      TEXT,
  lastMessage   TEXT,
  lastMessageAt TEXT,
  unreadByAdmin INTEGER DEFAULT 0,
  unreadByUser  INTEGER DEFAULT 0,
  needsAdmin    INTEGER DEFAULT 0,
  createdAt     TEXT
);
CREATE INDEX IF NOT EXISTS idx_chats_userId ON chats(userId);
CREATE INDEX IF NOT EXISTS idx_chats_lastMsg ON chats(lastMessageAt DESC);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  text        TEXT,
  isFromAdmin INTEGER DEFAULT 0,
  createdAt   TEXT,
  read        INTEGER DEFAULT 0,
  pinned      INTEGER DEFAULT 0,
  liked       INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, createdAt);

-- --------------------------------------------------------- coupons / cats ---
CREATE TABLE IF NOT EXISTS coupons (
  code        TEXT PRIMARY KEY,                        -- uppercase
  active      INTEGER DEFAULT 1,
  type        TEXT,                                    -- percent|fixed
  value       REAL DEFAULT 0,
  minOrderMNT INTEGER DEFAULT 0,
  cap         INTEGER,                                 -- max uses
  used        INTEGER DEFAULT 0,
  expiresAt   TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,                      -- cos_X
  label         TEXT,
  url           TEXT,
  imageUrl      TEXT,
  banner        TEXT,
  subcategories TEXT,                                  -- JSON tree
  updatedAt     TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id        TEXT PRIMARY KEY,
  productId TEXT,
  userId    TEXT,
  rating    INTEGER,
  text      TEXT,
  createdAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(productId);

-- ----------------------------------------------- carts / settings / system ---
-- Cart sync (one row per user; items as JSON).
CREATE TABLE IF NOT EXISTS carts (
  userId    TEXT PRIMARY KEY,
  items     TEXT,                                      -- JSON
  updatedAt TEXT
);

-- Key/value docs: settings/{general,admin_auth,scraper}, system/*, filters, home_products.
CREATE TABLE IF NOT EXISTS settings  ( id TEXT PRIMARY KEY, data TEXT, updatedAt TEXT );
CREATE TABLE IF NOT EXISTS system    ( id TEXT PRIMARY KEY, data TEXT, updatedAt TEXT );

-- Reports & manifests (id = date string; payload as JSON).
CREATE TABLE IF NOT EXISTS daily_reports   ( id TEXT PRIMARY KEY, data TEXT );
CREATE TABLE IF NOT EXISTS daily_manifests ( id TEXT PRIMARY KEY, data TEXT );

-- Ephemeral SMS sessions (short-lived; cron/TTL can purge expired rows).
CREATE TABLE IF NOT EXISTS sms_codes (
  sessionId TEXT PRIMARY KEY,
  phone     TEXT,
  code      TEXT,
  verified  INTEGER DEFAULT 0,
  expiresAt TEXT,
  createdAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_sms_expires ON sms_codes(expiresAt);
CREATE INDEX IF NOT EXISTS idx_sms_phone_created ON sms_codes(phone, createdAt);
CREATE INDEX IF NOT EXISTS idx_sms_code_verify ON sms_codes(code, verified, expiresAt);

-- Product rating aggregate (kept in sync by the write path that touches reviews).
CREATE TABLE IF NOT EXISTS products_ratings (
  productId TEXT PRIMARY KEY,
  avg       REAL DEFAULT 0,
  count     INTEGER DEFAULT 0
);
