// @ts-check
/**
 * shipments.js — consolidated-express illgeemj (parcel) splitting.
 *
 * Business model (Consolidated Express): goods travel Korea → Mongolia in one
 * container, but each parcel is declared separately under the recipient's own
 * name. A parcel stays duty-free only while BOTH hold:
 *   • total customs value ≤ 660,000₮ («Хувь хүний барааны гаалийн мэдүүлэг»)
 *   • ≤ 2 of the same item
 * Orders that exceed the value cap are therefore split automatically into
 * several parcels (shipments), each under the cap — mirroring the operating
 * manual's Phase 1 («Их захиалгыг систем автоматаар хэд хэдэн илгээмж болгон
 * хуваана»). Pure logic, no Firebase — unit-tested in shipments.test.mjs.
 */

/** Duty-free ceiling for one individual's parcel, in MNT (≤ is exempt). */
export const SHIPMENT_VALUE_LIMIT_MNT = 660000;
/** Max units of the same item per parcel. */
export const SAME_ITEM_LIMIT = 2;

/**
 * Split cart items into shipments, each with customs value ≤ the cap and ≤2 of
 * the same item. Items may be split across shipments by quantity (2 → 1+1).
 *
 * Items of different transport types (ground/air) never share a shipment —
 * they travel in different cargo. Single units worth more than the cap get
 * their own shipment flagged `oversize: true` (taxable, but orderable).
 *
 * @param {Array<object>} items  cart items ({ id, quantity, shippingMethod?, transportType?, ... })
 * @param {(item: object) => number} getUnitMNT  customs value of ONE unit, in MNT
 * @param {number} [limitMNT]  override the value cap (defaults to 660,000₮)
 * @returns {{ items: object[], valueMNT: number, oversize: boolean }[]}
 */
export function splitIntoShipments(items, getUnitMNT, limitMNT = SHIPMENT_VALUE_LIMIT_MNT) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return [];

    // 1) Explode into single units, grouped by transport.
    /** @type {Record<string, {item: object, unitMNT: number}[]>} */
    const byTransport = {};
    for (const item of list) {
        const transport = item.shippingMethod || item.transportType || 'ground';
        const qty = Math.max(1, Number(item.quantity) || 1);
        const unitMNT = Math.max(0, Number(getUnitMNT(item)) || 0);
        const units = byTransport[transport] || (byTransport[transport] = []);
        for (let u = 0; u < qty; u++) units.push({ item, unitMNT });
    }

    /** @type {{ items: object[], valueMNT: number, oversize: boolean }[]} */
    const shipments = [];

    for (const transport of Object.keys(byTransport)) {
        const units = byTransport[transport];
        // First-fit-decreasing bin packing: big units first pack tightest.
        units.sort((a, b) => b.unitMNT - a.unitMNT);

        /** @type {{ units: {item: object, unitMNT: number}[], valueMNT: number, perItem: Record<string, number>, oversize: boolean }[]} */
        const bins = [];
        for (const unit of units) {
            const key = unit.item.cartItemId || unit.item.id || unit.item.name || '?';
            const oversize = unit.unitMNT > limitMNT;
            let placed = null;
            if (!oversize) {
                placed = bins.find((b) =>
                    !b.oversize &&
                    b.valueMNT + unit.unitMNT <= limitMNT &&
                    (b.perItem[key] || 0) < SAME_ITEM_LIMIT
                ) || null;
            }
            if (!placed) {
                placed = { units: [], valueMNT: 0, perItem: {}, oversize };
                bins.push(placed);
            }
            placed.units.push(unit);
            placed.valueMNT += unit.unitMNT;
            placed.perItem[key] = (placed.perItem[key] || 0) + 1;
        }

        // 2) Re-merge units of the same cart line back into quantity rows.
        for (const bin of bins) {
            /** @type {Map<string, object>} */
            const merged = new Map();
            for (const { item } of bin.units) {
                const key = item.cartItemId || item.id || item.name || '?';
                const row = merged.get(key);
                if (row) row.quantity += 1;
                else merged.set(key, { ...item, quantity: 1 });
            }
            shipments.push({
                items: [...merged.values()],
                valueMNT: Math.round(bin.valueMNT),
                oversize: bin.oversize,
            });
        }
    }

    return shipments;
}

/**
 * Distribute a charged grand total across shipments proportionally to their
 * customs value, rounding so the parts sum EXACTLY to the grand total (the
 * remainder lands on the last shipment).
 *
 * @param {number} grandTotal  amount actually charged (any currency)
 * @param {{valueMNT: number}[]} shipments
 * @returns {number[]} per-shipment totals, same order, summing to grandTotal
 */
export function apportionTotal(grandTotal, shipments) {
    const list = Array.isArray(shipments) ? shipments : [];
    if (list.length === 0) return [];
    const total = Number(grandTotal) || 0;
    const weightSum = list.reduce((a, s) => a + (Number(s.valueMNT) || 0), 0);
    if (list.length === 1) return [Math.round(total)];
    const out = [];
    let assigned = 0;
    for (let i = 0; i < list.length; i++) {
        if (i === list.length - 1) {
            out.push(Math.round(total) - assigned);
        } else {
            const share = weightSum > 0
                ? Math.round(total * (Number(list[i].valueMNT) || 0) / weightSum)
                : Math.round(total / list.length);
            out.push(share);
            assigned += share;
        }
    }
    return out;
}
