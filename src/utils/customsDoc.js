// @ts-check
/**
 * customsDoc.js — generate printable customs paperwork from a batch of orders.
 *
 * The business ships consolidated parcels Korea → Mongolia as a courier/express
 * (шуудан) operation, so the central document is a **Manifest (илгээмжийн
 * жагсаалт)** — one row per parcel/recipient. Korea clears express cargo by
 * "list clearance" (목록통관) off exactly such a list (sender + each consignee's
 * name/phone/address + description + value + weight); Mongolia clears the same
 * list and assesses duty **per recipient** (an individual's parcel is duty-free
 * up to ~10× the monthly minimum wage AND ≤2 of the same item).
 *
 * This module builds, in one printable HTML page (print → PDF):
 *   1. Manifest          — courier list, one row per order, with a per-parcel
 *                          duty-free / taxable flag.
 *   2. Commercial Invoice — consolidated by product (commercial-cargo backup).
 *   3. Packing List       — one carton per recipient.
 * Each is toggled via config.include. Auto-filled from the product record
 * (HS code, English name, weight). Dependency-free on purpose.
 */

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
function fmt(n, digits = 2) {
    const v = Number(n);
    return (isFinite(v) ? v : 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtInt(n) {
    const v = Number(n);
    return (isFinite(v) ? v : 0).toLocaleString('en-US');
}


/**
 * Customs value of one order line, in the declared currency AND in MNT.
 * If `useCost` and the product has a Costco cost (costPriceKRW, always ₩), the
 * real import cost is declared; otherwise the stored item price is used — which is
 * the warehouse BASE price in KRW (finalPrice = basePriceKRW), not the order's
 * display currency. Everything is normalised through a KRW base.
 */
function itemCustomsValue(item, product, orderCurrency, declared, wonRate, usdRate, useCost) {
    const qty = Number(item?.quantity) || 0;
    let krw;
    if (useCost && product && Number(product.costPriceKRW) > 0) {
        krw = Number(product.costPriceKRW) * qty;
    } else {
        // item.price is the KRW warehouse base price (already a won value); do NOT
        // treat it as the order's display currency. (Previously this divided by
        // wonRate when currency==='MNT', under-declaring the customs value ~2.6×.)
        krw = (Number(item?.price) || 0) * qty;
    }
    return {
        declaredVal: declared === 'USD' ? (usdRate > 0 ? krw / usdRate : 0) : krw,
        mnt: krw * (wonRate > 0 ? wonRate : 0),
    };
}

/**
 * Build the full printable HTML.
 * @param {{orders:Array, productsById:Map, wonRate:number, config:object}} args
 * @returns {string}
 */
function buildCustomsHTML({ orders, productsById, wonRate, config }) {
    const cfg = config || {};
    const include = Object.assign({ manifest: true, invoice: true, packing: true }, cfg.include || {});
    const threshold = Number(cfg.dutyFreeThresholdMNT) > 0 ? Number(cfg.dutyFreeThresholdMNT) : 660000;
    const declared = cfg.currency === 'USD' ? 'USD' : 'KRW';
    const sym = declared === 'USD' ? '$' : '₩';
    const usdRate = Number(cfg.usdRate) || 0;
    const dutyRate = Number(cfg.dutyRate) >= 0 ? Number(cfg.dutyRate) : 5;   // Mongolia general customs duty %
    const vatRate = Number(cfg.vatRate) >= 0 ? Number(cfg.vatRate) : 10;     // Mongolia VAT %
    const useCost = !!cfg.useCostValue;                                       // declare Costco cost vs selling price
    const origin = cfg.originCountry || 'Republic of Korea';
    const incoterm = cfg.incoterm || 'FOB Incheon, Korea';
    const invoiceNo = cfg.invoiceNo || `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const docDate = cfg.date || new Date().toISOString().slice(0, 10);
    const exporterName = cfg.exporterName || '';
    const exporterAddr = cfg.exporterAddress || '';
    const consigneeName = cfg.consigneeName || '';
    const consigneeAddr = cfg.consigneeAddress || '';

    const list = Array.isArray(orders) ? orders : [];
    const byId = productsById instanceof Map ? productsById : new Map();
    const lookup = (item) => byId.get(item?.id) || byId.get(String(item?.id)) || null;
    const descOf = (it) => (lookup(it)?.name_en) || (lookup(it)?.englishName) || it.name || 'Goods';

    const headerBlock = (docTitle) => `
        <div class="head">
            <div class="title">${docTitle}</div>
            <div class="meta">
                <div><b>No:</b> ${esc(invoiceNo)}</div>
                <div><b>Огноо / Date:</b> ${esc(docDate)}</div>
                <div><b>Incoterm:</b> ${esc(incoterm)}</div>
            </div>
        </div>
        <div class="parties">
            <div class="party">
                <div class="ph">Илгээгч / Shipper (Exporter)</div>
                <div class="pn">${esc(exporterName) || '<span class="muted">—</span>'}</div>
                <div class="pa">${esc(exporterAddr)}</div>
            </div>
            <div class="party">
                <div class="ph">Хүлээн авагч / Consignee (Importer)</div>
                <div class="pn">${esc(consigneeName) || '<span class="muted">—</span>'}</div>
                <div class="pa">${esc(consigneeAddr)}</div>
            </div>
        </div>`;

    // ---------- 1) MANIFEST (one row per parcel/recipient) ----------
    // Count registers across the batch: the same recipient on multiple parcels
    // can be aggregated by customs (a structuring/duty-evasion risk), so flag it.
    const regCount = {};
    list.forEach((o) => { const r = (o.recipientRegister || '').trim(); if (r) regCount[r] = (regCount[r] || 0) + 1; });
    let mDupRows = 0;
    let mQty = 0, mAmount = 0, mNet = 0, mTaxable = 0, mTaxSum = 0;
    const manifestRows = list.map((order, i) => {
        const items = order.items || [];
        const dupReg = order.recipientRegister && regCount[(order.recipientRegister || '').trim()] > 1;
        if (dupReg) mDupRows++;
        let declaredVal = 0, mnt = 0;
        for (const it of items) {
            const v = itemCustomsValue(it, lookup(it), order.currency, declared, wonRate, usdRate, useCost);
            declaredVal += v.declaredVal; mnt += v.mnt;
        }
        const qty = items.reduce((a, it) => a + (Number(it.quantity) || 0), 0);
        const net = items.reduce((a, it) => a + ((Number(lookup(it)?.weight) || 0) * (Number(it.quantity) || 0)), 0);
        const maxSame = items.reduce((m, it) => Math.max(m, Number(it.quantity) || 0), 0);
        const taxable = mnt > threshold || maxSame > 2;
        // Estimated Mongolian import charges on a taxable parcel: duty on the
        // customs value, then VAT on (value + duty). Excise goods differ.
        const dutyMNT = taxable ? mnt * dutyRate / 100 : 0;
        const vatMNT = taxable ? (mnt + dutyMNT) * vatRate / 100 : 0;
        const taxMNT = dutyMNT + vatMNT;
        if (taxable) { mTaxable++; mTaxSum += taxMNT; }
        mQty += qty; mAmount += declaredVal; mNet += net;
        const contents = items.map((it) => {
            const p = lookup(it);
            const hs = p?.hsCode ? ` <span class="muted">(${esc(p.hsCode)})</span>` : '';
            return `${esc(descOf(it))} ×${fmtInt(it.quantity)}${hs}`;
        }).join('<br>');
        return `
        <tr>
            <td class="c">${i + 1}</td>
            <td class="c">${esc(order.id)}</td>
            <td>${esc(order.recipientName || order.customer || '—')}</td>
            <td class="c">${esc(order.recipientRegister) || '<span class="muted">—</span>'}${dupReg ? '<br><span class="tax" style="font-size:9px">давхардсан</span>' : ''}</td>
            <td class="c">${esc(order.recipientPhone || '—')}</td>
            <td class="addr">${esc(order.recipientCustomsAddress || order.recipientAddress || '—')}</td>
            <td>${contents || '—'}</td>
            <td class="r">${fmtInt(qty)}</td>
            <td class="r">${sym}${fmt(declaredVal)}</td>
            <td class="r">${net ? fmt(net) : '—'}</td>
            <td class="c">${taxable ? `<b class="tax">≈${fmtInt(Math.round(taxMNT))}₮</b>` : '<span class="free">Татваргүй</span>'}</td>
        </tr>`;
    }).join('');
    const manifestSection = `
        ${headerBlock('ИЛГЭЭМЖИЙН ЖАГСААЛТ / COURIER MANIFEST')}
        <table class="manifest">
            <thead><tr>
                <th class="c">#</th><th class="c">Захиалга</th><th>Хүлээн авагч</th><th class="c">Регистр</th>
                <th class="c">Утас</th><th>Хаяг</th><th>Агуулга / HS</th>
                <th class="r">Тоо</th><th class="r">Үнэ</th><th class="r">Жин кг</th><th class="c">Татвар</th>
            </tr></thead>
            <tbody>${manifestRows || '<tr><td colspan="11" class="c muted">Илгээмж алга</td></tr>'}</tbody>
            <tfoot><tr>
                <td colspan="7" class="r">НИЙТ — ${fmtInt(list.length)} илгээмж</td>
                <td class="r">${fmtInt(mQty)}</td>
                <td class="r">${sym}${fmt(mAmount)}</td>
                <td class="r">${fmt(mNet)}</td>
                <td class="c">${mTaxable} ш ≈${fmtInt(Math.round(mTaxSum))}₮</td>
            </tr></tfoot>
        </table>
        <p class="note">Татваргүй босго: хувь хүнд <b>${fmtInt(threshold)}₮</b> хүртэл <b>БА</b> ижил барааны 2-оос ихгүй бол гаалийн татваргүй. Татвартай илгээмжийн ойролцоо татвар = гаалийн татвар <b>${dutyRate}%</b> + НӨАТ <b>${vatRate}%</b> (₮-өөр; онцгой албан татвартай бараа өөр — брокертой эцэслэн тулгана уу).</p>
        ${mDupRows > 0 ? `<p class="note" style="color:#b91c1c"><b>Анхаар:</b> ${mDupRows} илгээмж ижил регистртэй давхардаж байна — гааль нэгтгэн тооцож татвар ноогдуулж болзошгүй. Өөр өөр хүний нэр дээр хуваарилахыг зөвлөнө.</p>` : ''}`;

    // ---------- 2) COMMERCIAL INVOICE (consolidated by product) ----------
    const lineMap = new Map();
    let iQty = 0, iAmount = 0, iNet = 0;
    for (const order of list) {
        for (const item of (order.items || [])) {
            const p = lookup(item);
            const desc = descOf(item);
            const hs = (p && p.hsCode) || '';
            const unitW = (p && Number(p.weight)) || 0;
            const qty = Number(item.quantity) || 0;
            const lineValue = itemCustomsValue(item, p, order.currency, declared, wonRate, usdRate, useCost).declaredVal;
            const key = `${desc}__${hs}`;
            const row = lineMap.get(key) || { description: desc, hs, qty: 0, amount: 0 };
            row.qty += qty; row.amount += lineValue;
            lineMap.set(key, row);
            iQty += qty; iAmount += lineValue; iNet += unitW * qty;
        }
    }
    const invoiceRows = [...lineMap.values()].map((l, i) => `
        <tr>
            <td class="c">${i + 1}</td>
            <td>${esc(l.description)}</td>
            <td class="c">${l.hs ? esc(l.hs) : '<span class="muted">—</span>'}</td>
            <td class="c">${esc(origin)}</td>
            <td class="r">${fmtInt(l.qty)}</td>
            <td class="r">${sym}${fmt(l.qty ? l.amount / l.qty : 0)}</td>
            <td class="r">${sym}${fmt(l.amount)}</td>
        </tr>`).join('');
    const noteCur = declared === 'USD' ? `Валют / Currency: USD (1 USD = ₩${fmtInt(usdRate)})` : 'Валют / Currency: KRW (₩)';
    const invoiceSection = `
        ${headerBlock('COMMERCIAL INVOICE')}
        <table>
            <thead><tr>
                <th class="c">#</th><th>Барааны тайлбар / Description</th><th class="c">HS код</th>
                <th class="c">Гарал үүсэл / Origin</th><th class="r">Тоо / Qty</th>
                <th class="r">Нэгж / Unit</th><th class="r">Дүн / Amount</th>
            </tr></thead>
            <tbody>${invoiceRows || '<tr><td colspan="7" class="c muted">Бараа алга</td></tr>'}</tbody>
            <tfoot><tr>
                <td colspan="4" class="r">НИЙТ / TOTAL</td>
                <td class="r">${fmtInt(iQty)}</td><td></td><td class="r">${sym}${fmt(iAmount)}</td>
            </tr></tfoot>
        </table>
        <p class="note">${noteCur} &nbsp;•&nbsp; Нийт цэвэр жин / Total net weight: ${fmt(iNet)} кг</p>
        <div class="sign">
            <div class="box"><div class="line">Экспортлогчийн гарын үсэг, тамга / Signature &amp; Stamp</div></div>
            <div class="box"><div class="line">Огноо / Date</div></div>
        </div>`;

    // ---------- 3) PACKING LIST (one carton per recipient) ----------
    let pNet = 0, pQty = 0;
    const packRows = list.map((order, idx) => {
        const items = order.items || [];
        const contents = items.map((it) => `${esc(descOf(it))} ×${fmtInt(it.quantity)}`).join('<br>');
        const net = items.reduce((a, it) => a + ((Number(lookup(it)?.weight) || 0) * (Number(it.quantity) || 0)), 0);
        const qty = items.reduce((a, it) => a + (Number(it.quantity) || 0), 0);
        pNet += net; pQty += qty;
        return `
        <tr>
            <td class="c">${idx + 1}</td>
            <td class="c">${esc(order.id)}</td>
            <td>${esc(order.recipientName || order.customer || '—')}</td>
            <td>${contents || '<span class="muted">—</span>'}</td>
            <td class="r">${fmtInt(qty)}</td>
            <td class="r">${net ? fmt(net) : '<span class="muted">—</span>'}</td>
            <td class="r">${net ? fmt(net) : ''}</td>
        </tr>`;
    }).join('');
    const packingSection = `
        ${headerBlock('PACKING LIST')}
        <table>
            <thead><tr>
                <th class="c">Карто / Ctn</th><th class="c">Захиалга / Order</th>
                <th>Хүлээн авагч / Consignee</th><th>Агуулга / Contents</th>
                <th class="r">Тоо / Qty</th><th class="r">Нетто / N.W (кг)</th><th class="r">Брутто / G.W (кг)</th>
            </tr></thead>
            <tbody>${packRows || '<tr><td colspan="7" class="c muted">Бараа алга</td></tr>'}</tbody>
            <tfoot><tr>
                <td colspan="4" class="r">НИЙТ / TOTAL — ${fmtInt(list.length)} карто</td>
                <td class="r">${fmtInt(pQty)}</td><td class="r">${fmt(pNet)}</td><td class="r">${fmt(pNet)}</td>
            </tr></tfoot>
        </table>
        <p class="note">Брутто жинд савлагааны жинг нэмж тохируулна уу / Adjust gross weight to include packaging.</p>
        <div class="sign">
            <div class="box"><div class="line">Бэлтгэсэн / Prepared by</div></div>
            <div class="box"><div class="line">Огноо / Date</div></div>
        </div>`;

    // ---------- assemble ----------
    const chosen = [];
    if (include.manifest) chosen.push(manifestSection);
    if (include.invoice) chosen.push(invoiceSection);
    if (include.packing) chosen.push(packingSection);
    const body = chosen.map((html, idx) => `<section class="doc${idx === 0 ? '' : ' page-break'}">${html}</section>`).join('\n');

    return `<!doctype html>
<html lang="mn"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(invoiceNo)} — Customs documents</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111; margin:0; background:#f3f4f6; }
  .toolbar { position:sticky; top:0; display:flex; gap:14px; align-items:center; flex-wrap:wrap;
             background:#1f3a8a; color:#fff; padding:10px 16px; font-size:13px; z-index:5; }
  .toolbar button { background:#fff; color:#1f3a8a; border:0; border-radius:8px; padding:8px 16px; font-weight:700; cursor:pointer; font-size:13px; }
  .doc { background:#fff; max-width:210mm; margin:16px auto; padding:16mm 14mm; box-shadow:0 1px 6px rgba(0,0,0,.12); }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:10px; }
  .title { font-size:21px; font-weight:800; letter-spacing:.3px; }
  .meta { text-align:right; font-size:11px; line-height:1.6; }
  .parties { display:flex; gap:12px; margin-bottom:12px; }
  .party { flex:1; border:1px solid #999; border-radius:6px; padding:8px 10px; }
  .ph { font-size:10px; text-transform:uppercase; letter-spacing:.4px; color:#555; margin-bottom:3px; }
  .pn { font-weight:700; font-size:13px; }
  .pa { font-size:11px; color:#333; white-space:pre-line; }
  table { width:100%; border-collapse:collapse; margin-top:4px; }
  th, td { border:1px solid #555; padding:5px 7px; font-size:11px; vertical-align:top; }
  th { background:#eef2ff; font-weight:700; text-align:left; }
  td.c, th.c { text-align:center; }
  td.r, th.r { text-align:right; white-space:nowrap; }
  tfoot td { font-weight:800; background:#f8fafc; }
  .muted { color:#aaa; }
  .tax { color:#b91c1c; }
  .free { color:#15803d; }
  .manifest th, .manifest td { font-size:10px; padding:3px 5px; }
  .manifest td.addr { font-size:9.5px; color:#444; max-width:120px; }
  .note { font-size:11px; color:#444; margin:8px 0 0; }
  .sign { display:flex; justify-content:space-between; margin-top:34px; font-size:11px; }
  .sign .box { width:45%; }
  .sign .line { border-top:1px solid #111; margin-top:34px; padding-top:4px; color:#555; }
  @media print {
    body { background:#fff; }
    .no-print { display:none !important; }
    .doc { box-shadow:none; margin:0; max-width:none; padding:0; }
    .page-break { page-break-before: always; }
    @page { size:A4; margin:12mm; }
  }
</style></head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">🖨 Хэвлэх / PDF болгох</button>
    <span>${fmtInt(list.length)} илгээмж • Нийт: ${sym}${fmt(mAmount || iAmount)} • Жин: ${fmt(mNet || iNet)} кг${mTaxable ? ` • <b style="color:#fca5a5">${mTaxable} татвартай</b>` : ''}</span>
  </div>
  ${body}
</body></html>`;
}

/**
 * Open the generated documents in a new window for printing / saving as PDF.
 * @param {{orders:Array, productsById:Map, wonRate:number, config:object}} args
 * @returns {boolean} false if the popup was blocked
 */
export function openCustomsDocs(args) {
    const html = buildCustomsHTML(args);
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    return true;
}

// CSV cell — quote when it contains a comma, quote or newline; escape inner quotes.
function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build a machine-readable manifest CSV — one row per parcel/order — for
 * UPLOADING into the courier and/or customs-broker system (no API needed). UTF-8
 * with a BOM so Cyrillic opens correctly in Excel. Same per-parcel values and
 * duty-free flag as the printable manifest.
 * @param {{orders:Array, productsById:Map, wonRate:number, config:object}} args
 * @returns {string}
 */
function buildManifestCSV({ orders, productsById, wonRate, config }) {
    const cfg = config || {};
    const declared = cfg.currency === 'USD' ? 'USD' : 'KRW';
    const usdRate = Number(cfg.usdRate) || 0;
    const threshold = Number(cfg.dutyFreeThresholdMNT) > 0 ? Number(cfg.dutyFreeThresholdMNT) : 660000;
    const dutyRate = Number(cfg.dutyRate) >= 0 ? Number(cfg.dutyRate) : 5;
    const vatRate = Number(cfg.vatRate) >= 0 ? Number(cfg.vatRate) : 10;
    const useCost = !!cfg.useCostValue;
    const list = Array.isArray(orders) ? orders : [];
    const byId = productsById instanceof Map ? productsById : new Map();
    const lookup = (it) => byId.get(it?.id) || byId.get(String(it?.id)) || null;
    const descOf = (it) => (lookup(it)?.name_en) || (lookup(it)?.englishName) || it.name || 'Goods';

    const regCount = {};
    list.forEach((o) => { const r = (o.recipientRegister || '').trim(); if (r) regCount[r] = (regCount[r] || 0) + 1; });
    const headers = ['№', 'Захиалга', 'Хүлээн авагч', 'Регистр', 'Утас', 'Хаяг', 'Бараа', 'HS код', 'Тоо', 'Үнэ', 'Валют', 'Жин_кг', 'Татвар', 'Татвар_дүн_₮', 'Tracking', 'Регистр_давхардсан'];
    const rows = list.map((order, i) => {
        const items = order.items || [];
        let declaredVal = 0, mnt = 0;
        for (const it of items) {
            const v = itemCustomsValue(it, lookup(it), order.currency, declared, wonRate, usdRate, useCost);
            declaredVal += v.declaredVal; mnt += v.mnt;
        }
        const qty = items.reduce((a, it) => a + (Number(it.quantity) || 0), 0);
        const net = items.reduce((a, it) => a + ((Number(lookup(it)?.weight) || 0) * (Number(it.quantity) || 0)), 0);
        const maxSame = items.reduce((m, it) => Math.max(m, Number(it.quantity) || 0), 0);
        const taxable = mnt > threshold || maxSame > 2;
        const dutyMNT = taxable ? mnt * dutyRate / 100 : 0;
        const taxMNT = taxable ? dutyMNT + (mnt + dutyMNT) * vatRate / 100 : 0;
        const contents = items.map((it) => `${descOf(it)} x${Number(it.quantity) || 0}`).join('; ');
        const hsList = [...new Set(items.map((it) => lookup(it)?.hsCode).filter(Boolean))].join('; ');
        return [
            i + 1, order.id, order.recipientName || order.customer || '', order.recipientRegister || '',
            order.recipientPhone || '', order.recipientCustomsAddress || order.recipientAddress || '', contents, hsList,
            qty, Math.round(declaredVal), declared, net ? net.toFixed(2) : '',
            taxable ? 'Татвартай' : 'Татваргүй', taxable ? Math.round(taxMNT) : '', order.trackingNumber || '',
            (order.recipientRegister && regCount[(order.recipientRegister || '').trim()] > 1) ? 'Тийм' : '',
        ];
    });
    const lines = [headers, ...rows].map((r) => r.map(csvCell).join(','));
    return '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 Cyrillic correctly
}

/** Trigger a browser download of the manifest CSV. */
export function downloadManifestCSV(args) {
    const csv = buildManifestCSV(args);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manifest-${(args.config?.invoiceNo) || new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build printable shipping labels — one per order — with the recipient details
 * and a scannable barcode of the order id (for warehouse / courier scanning).
 * Barcodes are rendered by JsBarcode loaded from cdnjs inside the print window.
 * @param {Array} orders
 */
function buildLabelsHTML(orders) {
    const list = Array.isArray(orders) ? orders : [];
    const labels = list.map((o) => {
        const addr = o.recipientCustomsAddress || o.recipientAddress || '';
        return `
        <div class="label">
            <div class="lhead"><span class="brand">Costco.mn</span><span class="oid">#${esc(o.id)}</span></div>
            <div class="lname">${esc(o.recipientName || o.customer || '—')}</div>
            <div class="lrow">Утас: ${esc(o.recipientPhone || '—')}${o.recipientPhone2 ? ' / ' + esc(o.recipientPhone2) : ''}</div>
            <div class="lrow">РД: ${esc(o.recipientRegister || '—')}</div>
            <div class="laddr">${esc(addr || '—')}</div>
            <svg class="barcode" jsbarcode-value="${esc(o.id)}" jsbarcode-height="40" jsbarcode-fontsize="14" jsbarcode-margin="0" jsbarcode-displayvalue="true"></svg>
        </div>`;
    }).join('');
    return `<!doctype html>
<html lang="mn"><head><meta charset="utf-8"><title>Илгээмжийн шошго</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; background: #f3f4f6; }
  .toolbar { position: sticky; top: 0; background: #1f3a8a; color: #fff; padding: 10px 16px; font-size: 13px; display: flex; gap: 12px; align-items: center; }
  .toolbar button { background: #fff; color: #1f3a8a; border: 0; border-radius: 8px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
  .sheet { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; max-width: 210mm; margin: 0 auto; }
  .label { width: 99mm; border: 1px solid #111; border-radius: 6px; padding: 8px 10px; background: #fff; page-break-inside: avoid; }
  .lhead { display: flex; justify-content: space-between; border-bottom: 1px solid #999; padding-bottom: 3px; margin-bottom: 4px; }
  .brand { font-weight: 800; color: #1f3a8a; } .oid { font-weight: 800; }
  .lname { font-size: 16px; font-weight: 800; }
  .lrow { font-size: 12px; margin-top: 1px; }
  .laddr { font-size: 12px; margin: 3px 0; min-height: 28px; }
  .barcode { width: 100%; height: 48px; }
  @media print { body { background: #fff; } .no-print { display: none !important; } @page { size: A4; margin: 8mm; } }
</style></head>
<body>
  <div class="toolbar no-print"><button onclick="window.print()">🖨 Шошго хэвлэх</button><span>${list.length} шошго</span></div>
  <div class="sheet">${labels || '<p style="padding:16px">Захиалга алга</p>'}</div>
  <script>window.addEventListener('load', function () { try { JsBarcode('.barcode').init(); } catch (e) { console.error(e); } });</script>
</body></html>`;
}

/** Open the shipping labels in a new window for printing. */
export function openLabels(orders) {
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.open();
    w.document.write(buildLabelsHTML(orders));
    w.document.close();
    w.focus();
    return true;
}
