/**
 * rate.js — lightweight KV-counter rate limiting (free; no Durable Objects).
 *
 * Soft limiter: a fixed window per (bucket, client-IP) stored in KV. KV has no atomic
 * increment, so a burst of truly-simultaneous requests could slip a few over — fine for
 * abuse mitigation (brute-force / spam), which is the goal. Fail-OPEN: if KV errors we
 * allow the request rather than block legitimate traffic.
 */

const clientIp = (request) =>
  request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

// In-memory sliding window map per isolate — avoids burning KV writes on every single call.
const memBuckets = new Map();

/**
 * allowRequest(env, request, bucket, limit, windowSec) → true if under the limit.
 * `bucket` namespaces the limit (e.g. 'sms', 'adminlogin', 'orders').
 */
export async function allowRequest(_env, request, bucket, limit, windowSec) {
  try {
    const now = Date.now();
    if (memBuckets.size > 5000) {
      for (const [k, v] of memBuckets.entries()) {
        if (v.exp <= now) memBuckets.delete(k);
      }
    }
    const key = `rl:${bucket}:${clientIp(request)}`;
    const entry = memBuckets.get(key);
    if (!entry || entry.exp <= now) {
      memBuckets.set(key, { count: 1, exp: now + windowSec * 1000 });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count += 1;
    return true;
  } catch {
    return true; // fail open
  }
}
