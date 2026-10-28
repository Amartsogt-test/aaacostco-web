/**
 * backup.js — daily D1 snapshot to R2 (free tier). Dumps the business-critical tables
 * as JSON to the IMAGES bucket under backups/<date>/. No-ops if R2 isn't enabled.
 *
 * Restore is manual (read the JSON and re-INSERT) — this is a safety net against
 * accidental data loss, not a hot standby.
 */

const TABLES = ['orders', 'order_items', 'users', 'coupons', 'settings', 'categories'];

export async function backupToR2(env) {
  if (!env.IMAGES) return { skipped: 'no-r2' };
  const date = new Date().toISOString().slice(0, 10);
  let saved = 0;
  for (const t of TABLES) {
    try {
      const { results } = await env.DB.prepare(`SELECT * FROM ${t}`).all();
      const key = `backups/${date}/${t}.json`;
      await env.IMAGES.put(key, JSON.stringify(results || []), { httpMetadata: { contentType: 'application/json' } });
      saved++;
    } catch (e) { console.error(`backup ${t} failed:`, e); }
  }
  return { date, tables: saved };
}
