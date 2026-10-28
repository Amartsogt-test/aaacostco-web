/**
 * Unit tests for consolidated-express shipment splitting.
 * Pure logic, no Firebase — run with:  npm run test:shipments
 */
import { splitIntoShipments, apportionTotal, SHIPMENT_VALUE_LIMIT_MNT } from './shipments.js';

let pass = 0, fail = 0;
function eq(name, got, exp) {
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    console.log((ok ? '✓' : '✗ FAIL') + ' ' + name + (ok ? '' : `  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`));
    ok ? pass++ : fail++;
}

const unit = (i) => i.mnt; // test items carry their unit MNT value directly

// ---- single shipment when under the cap (660,000₮) ----
let s = splitIntoShipments(
    [{ id: 'a', quantity: 2, mnt: 200000 }, { id: 'b', quantity: 1, mnt: 200000 }], // 600k < cap
    unit
);
eq('under cap → 1 shipment', s.length, 1);
eq('under cap value', s[0].valueMNT, 600000);
eq('under cap not oversize', s[0].oversize, false);

// ---- splits when over the cap ----
s = splitIntoShipments(
    [{ id: 'a', quantity: 2, mnt: 400000 }], // 2 × 400k = 800k > 660k cap; each unit fits
    unit
);
eq('over cap → 2 shipments', s.length, 2);
eq('split quantities 1+1', s.map(x => x.items[0].quantity), [1, 1]);
eq('each under cap', s.every(x => x.valueMNT <= SHIPMENT_VALUE_LIMIT_MNT), true);

// ---- exact boundary: value == cap is still 1 shipment (≤) ----
s = splitIntoShipments([{ id: 'a', quantity: 2, mnt: 330000 }], unit); // 2 × 330k = 660k == cap
eq('exact cap → 1 shipment', s.length, 1);

// ---- ≤2 same item per shipment even with room left ----
s = splitIntoShipments([{ id: 'a', quantity: 2, mnt: 100 }, { id: 'b', quantity: 2, mnt: 100 }], unit);
eq('small items share a shipment', s.length, 1);
eq('same-item qty preserved', s[0].items.map(i => i.quantity), [2, 2]);

// ---- ground and air never mix ----
s = splitIntoShipments(
    [{ id: 'a', quantity: 1, mnt: 1000, shippingMethod: 'ground' }, { id: 'b', quantity: 1, mnt: 1000, shippingMethod: 'air' }],
    unit
);
eq('transports separated', s.length, 2);

// ---- single unit above the cap → own oversize shipment ----
s = splitIntoShipments(
    [{ id: 'big', quantity: 1, mnt: 4000000 }, { id: 'small', quantity: 1, mnt: 100000 }],
    unit
);
eq('oversize isolated', s.length, 2);
eq('oversize flagged', s.find(x => x.valueMNT === 4000000).oversize, true);
eq('small not flagged', s.find(x => x.valueMNT === 100000).oversize, false);

// ---- bin packing keeps shipment count low ----
s = splitIntoShipments(
    [
        { id: 'a', quantity: 2, mnt: 400000 }, // 2 units of 400k
        { id: 'b', quantity: 2, mnt: 250000 }, // 2 units of 250k
    ],
    unit
); // optimal: 2 bins of (400k+250k)=650k, under the 660k cap
eq('FFD packs 4 units into 2 bins', s.length, 2);
eq('FFD bins under cap', s.every(x => x.valueMNT <= SHIPMENT_VALUE_LIMIT_MNT), true);

// ---- empty / bad input ----
eq('empty input', splitIntoShipments([], unit), []);
eq('null input', splitIntoShipments(null, unit), []);

// ---- apportionTotal ----
eq('apportion sums exactly', apportionTotal(1000003, [{ valueMNT: 1 }, { valueMNT: 1 }, { valueMNT: 1 }]).reduce((a, b) => a + b, 0), 1000003);
eq('apportion proportional', apportionTotal(300, [{ valueMNT: 200 }, { valueMNT: 100 }]), [200, 100]);
eq('apportion single', apportionTotal(999, [{ valueMNT: 5 }]), [999]);
eq('apportion empty', apportionTotal(100, []), []);
eq('apportion zero weights split evenly', apportionTotal(100, [{ valueMNT: 0 }, { valueMNT: 0 }]), [50, 50]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
