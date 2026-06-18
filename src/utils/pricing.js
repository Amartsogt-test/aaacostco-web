// @ts-check
/**
 * pricing.js — single source of truth for the price a customer SEES.
 *
 * Historically this logic was copy-pasted (slightly differently) inside
 * ProductCard and ProductDetail, which is exactly the kind of duplication that
 * causes subtle, money-losing pricing bugs in an e-commerce app. This module
 * centralises it as one pure, unit-tested function.
 *
 * Field precedence mirrors the data produced by the scraper + admin overrides:
 *   current price : manualPriceKRW → price → priceKRW
 *   original price: manualOriginalPriceKRW → originalPrice → originalPriceKRW
 *                   → oldPrice → baseOldPrice
 *
 * Behaviour preserved from the original components:
 *  - If a discount has EXPIRED (discountEndDate in the past), revert to the
 *    original price as the current price and drop the strikethrough.
 *  - Old (strikethrough) price is only shown when hasDiscount === true AND the
 *    old price is strictly greater than the price being displayed.
 *  - ProductCard shows the warehouse price (estimatedWarehousePrice) as the main
 *    price; ProductDetail shows the online price. Toggle with `useWarehousePrice`.
 */

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

/**
 * @param {object} product
 * @param {object} opts
 * @param {'MNT'|'KRW'} opts.currency
 * @param {number} opts.wonRate           KRW→MNT multiplier
 * @param {boolean} [opts.useWarehousePrice=false]  prefer estimatedWarehousePrice as main price
 * @param {Date}   [opts.now=new Date()]   injectable clock (for testing)
 * @returns {{
 *   priceInKRW:number, oldPriceInKRW:number, warehousePriceKRW:number,
 *   mainPriceKRW:number, displayPrice:number, displayOldPrice:number|null,
 *   isExpired:boolean, hasDiscount:boolean, currencySymbol:string
 * }}
 */
export function getDisplayPricing(product, opts = {}) {
    const {
        currency = 'MNT',
        wonRate = 1,
        useWarehousePrice = false,
        now = new Date(),
    } = opts;

    const p = product || {};

    let priceInKRW = num(p.manualPriceKRW) || num(p.price) || num(p.priceKRW) || 0;
    let oldPriceInKRW =
        num(p.manualOriginalPriceKRW) || num(p.originalPrice) || num(p.originalPriceKRW) ||
        num(p.oldPrice) || num(p.baseOldPrice) || 0;

    // Expiration: a lapsed discount reverts to the original price and hides the strikethrough.
    const discountEnd = p.discountEndDate ? new Date(p.discountEndDate) : null;
    const isExpired = !!(discountEnd && discountEnd < now);
    if (isExpired && oldPriceInKRW > 0) {
        priceInKRW = oldPriceInKRW;
        oldPriceInKRW = 0;
    }

    const warehousePriceKRW = num(p.estimatedWarehousePrice) || priceInKRW;
    const mainPriceKRW = useWarehousePrice ? warehousePriceKRW : priceInKRW;

    // If currency is MNT, convert everything to MNT.
    const isMNT = currency === 'MNT';
    const displayPrice = isMNT ? Math.round(mainPriceKRW * wonRate) : mainPriceKRW;

    // Strikethrough old price: only when an active discount actually beats the shown price.
    const hasDiscount = p.hasDiscount === true && oldPriceInKRW > 0 && oldPriceInKRW > mainPriceKRW;
    const displayOldPrice = hasDiscount ? (isMNT ? Math.round(oldPriceInKRW * wonRate) : oldPriceInKRW) : null;

    return {
        priceInKRW,
        oldPriceInKRW,
        warehousePriceKRW,
        mainPriceKRW,
        displayPrice,
        displayOldPrice,
        isExpired,
        hasDiscount,
        // Respect currency option
        currencySymbol: isMNT ? '₮' : '₩',
    };
}

/**
 * Parse a discount percentage from messy catalog data ("20", 20, "-20%", "20%").
 * Returns a number in (0,100) or null.
 * @param {*} value
 * @returns {number|null}
 */
export function parsePercent(value) {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

/**
 * Decide how a discount should be DISPLAYED on a product.
 *
 * Guarantees the invariant the UI needs: a price is only marked "discounted"
 * (shown in red) when there is also an ORIGINAL price to show beside it. If the
 * catalog gives a discount % but no stored original price, the original is
 * derived from the percentage so a red price is never shown without a
 * comparison. Expired discounts are never treated as active.
 *
 * @param {object} args
 * @param {number} args.displayPrice          the price currently shown
 * @param {number|null} [args.displayOldPrice] stored original price (already display-converted)
 * @param {boolean} [args.isExpired=false]
 * @param {boolean} [args.hasDiscount=false]   raw product.hasDiscount flag
 * @param {*} [args.discountValue=null]         raw product.discount / discountPercent
 * @returns {{ isDiscounted:boolean, comparisonOldPrice:number|null, percent:number|null }}
 */
export function resolveDiscount({ displayPrice, displayOldPrice = null, isExpired = false, hasDiscount = false, discountValue = null }) {
    const none = { isDiscounted: false, comparisonOldPrice: null, percent: null };
    if (!hasDiscount || isExpired) return none;

    const pct = parsePercent(discountValue);
    const old = displayOldPrice || (pct ? Math.round(displayPrice / (1 - pct / 100)) : null);
    if (!old || old <= displayPrice) return none;

    const percent = pct ?? Math.round(((old - displayPrice) / old) * 100);
    return { isDiscounted: true, comparisonOldPrice: old, percent };
}
