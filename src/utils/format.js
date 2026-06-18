// @ts-check
/**
 * format.js — single source of truth for user-facing formatting.
 *
 * Money, phone and date formatting were previously inlined (and subtly
 * inconsistent) across ~16 files. Centralising them keeps the UI consistent and
 * makes the rules testable.
 */

/**
 * Format a PRODUCT PRICE for display. Missing / zero / negative amounts render
 * as the fallback ("Бэлэн бус") because for a product, 0 means "unavailable".
 * For neutral amounts that can legitimately be zero (shipping fees, totals) use
 * {@link formatAmount} instead.
 * @param {number} amount
 * @param {string} [symbol='₮']
 * @param {string} [fallback='Бэлэн бус']
 * @returns {string}
 */
export function formatMoney(amount, symbol = '₮', fallback = 'Бэлэн бус') {
    const n = typeof amount === 'number' && isFinite(amount) ? amount : 0;
    if (n <= 0) return fallback;
    return `${Math.round(n).toLocaleString('en-US')}${symbol}`;
}

/**
 * Format a neutral money amount (fees, totals, deltas) — always shows the
 * number, including 0. Invalid input is treated as 0.
 * @param {number} value
 * @param {string} [symbol='₮']
 * @returns {string}
 */
export function formatAmount(value, symbol = '₮') {
    const n = typeof value === 'number' && isFinite(value) ? value : 0;
    return `${Math.round(n).toLocaleString('en-US')}${symbol}`;
}

/**
 * Normalise a Mongolian phone number to "+976 XXXX XXXX".
 * Accepts raw digits, local 8-digit numbers, or already-prefixed strings.
 * Returns the original input if it doesn't look like an 8-digit MN number.
 * @param {string|number} phone
 * @returns {string}
 */
export function formatPhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    // take the last 8 digits (drops a leading 976 country code if present)
    const local = digits.slice(-8);
    if (local.length !== 8) return String(phone);
    return `+976 ${local.slice(0, 4)} ${local.slice(4)}`;
}

/**
 * Coerce Firestore Timestamp | ISO string | Date | number → Date (or null).
 * @param {*} value
 * @returns {Date|null}
 */
export function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'object' && typeof value.toDate === 'function') {
        try { return value.toDate(); } catch { return null; }
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date value (Firestore Timestamp / ISO / Date) for display.
 * @param {*} value
 * @param {{withTime?:boolean, locale?:string, fallback?:string}} [opts]
 * @returns {string}
 */
export function formatDate(value, opts = {}) {
    const { withTime = false, locale = 'mn-MN', fallback = '—' } = opts;
    const d = toDate(value);
    if (!d) return fallback;
    const dateOpts = { year: 'numeric', month: '2-digit', day: '2-digit' };
    if (withTime) { dateOpts.hour = '2-digit'; dateOpts.minute = '2-digit'; }
    try {
        return d.toLocaleString(locale, dateOpts);
    } catch {
        return d.toISOString().slice(0, withTime ? 16 : 10).replace('T', ' ');
    }
}
