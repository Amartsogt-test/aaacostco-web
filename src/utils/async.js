// @ts-check
/**
 * async.js — small reliability helpers for network/Firestore calls.
 *
 * Mobile users in Mongolia hit transient network failures, Firestore
 * 'unavailable'/'deadline-exceeded' blips, and cold starts. Retrying those with
 * exponential backoff (instead of surfacing an error on the first hiccup) makes
 * the app feel far more reliable. Permanent errors (permission-denied, not-found,
 * invalid-argument) are NOT retried — that would just waste time.
 */

const defaultSleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Firestore/network error codes that are worth retrying.
const TRANSIENT_CODES = new Set([
    'unavailable',
    'deadline-exceeded',
    'internal',
    'aborted',
    'resource-exhausted',
    'cancelled',
    'unknown',
]);

/**
 * True for errors that are transient and worth retrying.
 */
export function isTransientError(err) {
    if (!err) return false;
    const code = String(err.code || '').replace(/^functions\//, '').toLowerCase();
    if (TRANSIENT_CODES.has(code)) return true;
    // Generic network failures (fetch/XHR) often have no Firestore code.
    const msg = String(err.message || '').toLowerCase();
    return /network|timeout|failed to fetch|connection|offline/.test(msg);
}

/**
 * Run an async function, retrying transient failures with exponential backoff.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} [opts]
 * @param {number}  [opts.retries=3]       max retry attempts (in addition to the first try)
 * @param {number}  [opts.baseDelay=300]   first backoff delay in ms
 * @param {number}  [opts.maxDelay=4000]   cap on backoff delay
 * @param {number}  [opts.factor=2]        exponential growth factor
 * @param {(err:any)=>boolean} [opts.shouldRetry=isTransientError]
 * @param {(ms:number)=>Promise<void>} [opts.sleep]   injectable (for tests)
 * @param {()=>number} [opts.random]       injectable jitter source (for tests)
 * @returns {Promise<T>}
 */
export async function withRetry(fn, opts = {}) {
    const {
        retries = 3,
        baseDelay = 300,
        maxDelay = 4000,
        factor = 2,
        shouldRetry = isTransientError,
        sleep = defaultSleep,
        random = Math.random,
    } = opts;

    let attempt = 0;

    while (true) {
        try {
            return await fn();
        } catch (err) {
            attempt++;
            if (attempt > retries || !shouldRetry(err)) throw err;
            const backoff = Math.min(maxDelay, baseDelay * Math.pow(factor, attempt - 1));
            const jitter = random() * backoff * 0.25; // up to +25% to avoid thundering herd
            await sleep(backoff + jitter);
        }
    }
}
