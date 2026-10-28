/**
 * set-admin-password.mjs — set the Cloudflare admin login credential.
 * Generates a PBKDF2-SHA256 hash (matching worker/admin-auth.js) and writes the SQL to
 * cloudflare/seed/admin_auth.sql. Then load it into D1:
 *
 *   node cloudflare/set-admin-password.mjs <phone> <password>
 *   wrangler d1 execute costco --remote --file=cloudflare/seed/admin_auth.sql --config cloudflare/wrangler.toml
 *
 * (Run it locally; the password is only used to compute the hash — it is NOT stored.)
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ITER = 100000;

const phone = (process.argv[2] || '').replace(/\D/g, '');
const password = process.argv[3] || '';
if (phone.length < 8 || !password) {
  console.error('Usage: node cloudflare/set-admin-password.mjs <phone> <password>');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), ITER, 32, 'sha256').toString('hex');
const cfg = JSON.stringify({ phone, salt, hash, iterations: ITER }).replace(/'/g, "''");
const tail = phone.slice(-8);

const sql =
  `-- Admin credential (PBKDF2-SHA256). Password is NOT stored, only its hash.\n` +
  `INSERT OR REPLACE INTO settings (id, data, updatedAt) VALUES ('admin_auth', '${cfg}', '${new Date().toISOString()}');\n` +
  `UPDATE users SET isAdmin = 1 WHERE phone LIKE '%${tail}';\n`;

const out = path.join(__dirname, 'seed', 'admin_auth.sql');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, sql);
console.log(`✅ Wrote ${out}`);
console.log(`   Admin phone …${tail}. Load it:`);
console.log(`   wrangler d1 execute costco --remote --file=cloudflare/seed/admin_auth.sql --config cloudflare/wrangler.toml`);
