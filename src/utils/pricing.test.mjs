/**
 * Unit tests for the centralised pricing logic.
 * Pure logic, no Firebase — run with:  npm run test:pricing
 */
import { getDisplayPricing, parsePercent, resolveDiscount } from './pricing.js';

let pass = 0, fail = 0;
function eq(name, got, exp) {
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    console.log((ok ? '✓' : '✗ FAIL') + ' ' + name + (ok ? '' : `  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`));
    ok ? pass++ : fail++;
}

const past = '2020-01-01', future = '2999-01-01';

// ---- getDisplayPricing ----
let r = getDisplayPricing({ price: 10000 }, { currency: 'MNT', wonRate: 2.7 });
eq('online MNT displayPrice', r.displayPrice, 27000);
eq('online MNT no old', r.displayOldPrice, null);

r = getDisplayPricing({ price: 10000, estimatedWarehousePrice: 8000 }, { currency: 'MNT', wonRate: 2.7, useWarehousePrice: true });
eq('warehouse main', r.mainPriceKRW, 8000);
eq('warehouse display', r.displayPrice, 21600);

r = getDisplayPricing({ price: 8000, originalPrice: 10000, hasDiscount: true, discountEndDate: future }, { currency: 'KRW', wonRate: 1 });
eq('discount price', r.displayPrice, 8000);
eq('discount old', r.displayOldPrice, 10000);
eq('discount flag', r.hasDiscount, true);

r = getDisplayPricing({ price: 8000, originalPrice: 10000, hasDiscount: true, discountEndDate: past }, { currency: 'KRW', wonRate: 1 });
eq('expired reverts price', r.displayPrice, 10000);
eq('expired hides old', r.displayOldPrice, null);
eq('expired flag', r.isExpired, true);

eq('KRW raw', getDisplayPricing({ price: 5000 }, { currency: 'KRW', wonRate: 2.7 }).displayPrice, 5000);
eq('manual override', getDisplayPricing({ manualPriceKRW: 5000, price: 10000 }, { currency: 'KRW', wonRate: 1 }).displayPrice, 5000);
eq('no discount flag hides old', getDisplayPricing({ price: 8000, originalPrice: 10000, hasDiscount: false }, { currency: 'KRW', wonRate: 1 }).displayOldPrice, null);
eq('symbol MNT', getDisplayPricing({ price: 1 }, { currency: 'MNT', wonRate: 1 }).currencySymbol, '₮');
eq('null product safe', getDisplayPricing(null, { currency: 'MNT', wonRate: 2.7 }).displayPrice, 0);

// ---- parsePercent ----
eq('pct number', parsePercent(20), 20);
eq('pct "20%"', parsePercent('20%'), 20);
eq('pct "-20%"', parsePercent('-20%'), 20);
eq('pct 0 → null', parsePercent(0), null);
eq('pct 100 → null', parsePercent(100), null);
eq('pct junk → null', parsePercent('sale'), null);

// ---- resolveDiscount (red price ALWAYS has a comparison) ----
// real stored original
eq('resolve real old', resolveDiscount({ displayPrice: 8000, displayOldPrice: 10000, hasDiscount: true }),
    { isDiscounted: true, comparisonOldPrice: 10000, percent: 20 });
// derived from percent when no stored original
eq('resolve derive from %', resolveDiscount({ displayPrice: 8000, hasDiscount: true, discountValue: 20 }),
    { isDiscounted: true, comparisonOldPrice: 10000, percent: 20 });
// not discounted: no flag
eq('resolve no flag', resolveDiscount({ displayPrice: 8000, hasDiscount: false, discountValue: 20 }),
    { isDiscounted: false, comparisonOldPrice: null, percent: null });
// expired: never discounted
eq('resolve expired', resolveDiscount({ displayPrice: 8000, displayOldPrice: 10000, hasDiscount: true, isExpired: true }),
    { isDiscounted: false, comparisonOldPrice: null, percent: null });
// flag but no original and no percent → not discounted (no red without comparison)
eq('resolve no reference', resolveDiscount({ displayPrice: 8000, hasDiscount: true }),
    { isDiscounted: false, comparisonOldPrice: null, percent: null });
// old price not actually higher → not discounted
eq('resolve old not higher', resolveDiscount({ displayPrice: 8000, displayOldPrice: 7000, hasDiscount: true }),
    { isDiscounted: false, comparisonOldPrice: null, percent: null });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
