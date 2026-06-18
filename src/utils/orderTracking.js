// @ts-check
/**
 * orderTracking.js — single source of truth for the order-fulfilment pipeline.
 *
 * A shipment's journey from Costco Korea to the customer in Mongolia is a fixed
 * sequence of stages. Both the customer-facing timeline (OrderTracking) and the
 * admin "advance stage" tool (AdminOrders) key off these definitions, so the
 * vocabulary can never drift apart again (previously the admin set English
 * statuses like "Delivered" while the customer timeline expected "Хүргэгдсэн",
 * which silently broke both the timeline and the loyalty spend calculation).
 *
 * This module is intentionally JSX-free so it can be imported anywhere (stores,
 * services, Cloud-Function-shaped logic) and unit-tested. Icons are mapped to
 * stage keys inside the React components.
 */

/**
 * The 8 advanceable fulfilment stages, in pipeline order. `key` is stable and is
 * what gets stored in Firestore; `label` is the user-facing Mongolian text;
 * `hint` is a default description shown when the admin didn't add a custom note.
 * @type {{key:string,label:string,hint:string}[]}
 */
export const ORDER_STAGES = [
    { key: 'confirmed', label: 'Захиалга баталгаажсан', hint: 'Төлбөр хүлээн авч, захиалгыг баталгаажууллаа.' },
    { key: 'purchased', label: 'Солонгост худалдаж авсан', hint: 'Барааг Костко дэлгүүрээс худалдаж авлаа.' },
    { key: 'warehouse', label: 'Агуулахад хүлээн авсан', hint: 'Бараа Солонгос дахь агуулахад ирлээ.' },
    { key: 'shipped', label: 'Монгол руу ачигдсан', hint: 'Бараа Монгол руу гарлаа.' },
    { key: 'customs', label: 'Гаалийн бүрдүүлэлт', hint: 'Гаалийн бүрдүүлэлт хийгдэж байна.' },
    { key: 'arrived_ub', label: 'Улаанбаатарт ирсэн', hint: 'Бараа Улаанбаатарт ирлээ.' },
    { key: 'out_for_delivery', label: 'Хүргэлтэнд гарсан', hint: 'Бараа хүргэлтэнд гарлаа.' },
    { key: 'delivered', label: 'Хүргэгдсэн', hint: 'Захиалга амжилттай хүргэгдлээ.' },
];

/**
 * Implicit first event, stamped automatically when the order is created (before
 * the admin verifies payment). Not part of the advanceable pipeline above.
 */
export const RECEIVED_STAGE = { key: 'received', label: 'Захиалга хүлээн авсан', hint: 'Захиалга бүртгэгдэж, баталгаажуулалт хүлээгдэж байна.' };

/** Terminal cancelled state. */
export const CANCELLED_STAGE = { key: 'cancelled', label: 'Цуцлагдсан', hint: 'Захиалга цуцлагдсан.' };

/** Exception states — set by the admin when the normal pipeline is interrupted. */
export const EXCEPTION_STAGES = [
    { key: 'on_hold', label: 'Саатсан / Хүлээгдэж буй', hint: 'Захиалга түр саатсан.' },
    { key: 'failed', label: 'Хүргэлт амжилтгүй', hint: 'Хүргэлт амжилтгүй болсон — дахин оролдоно.' },
    { key: 'returned', label: 'Буцаагдсан', hint: 'Захиалга буцаагдсан.' },
];

/** True for cancelled or any exception state (i.e. not a normal pipeline stage). */
export function isExceptionStage(key) {
    return key === CANCELLED_STAGE.key || EXCEPTION_STAGES.some((s) => s.key === key);
}

const STAGE_KEYS = ORDER_STAGES.map((s) => s.key);

/**
 * Index of a stage key within the pipeline (0-based), or -1 if not a pipeline stage.
 * @param {string} key
 */
export function getStageIndex(key) {
    return STAGE_KEYS.indexOf(key);
}

/**
 * Look up a stage definition by key (pipeline, received, or cancelled).
 * @param {string} key
 * @returns {{key:string,label:string,hint:string}|null}
 */
export function getStageDef(key) {
    if (key === RECEIVED_STAGE.key) return RECEIVED_STAGE;
    if (key === CANCELLED_STAGE.key) return CANCELLED_STAGE;
    const exc = EXCEPTION_STAGES.find((s) => s.key === key);
    if (exc) return exc;
    return ORDER_STAGES.find((s) => s.key === key) || null;
}

/**
 * Map a legacy `status` string (English, or older Mongolian) to a stage key, so
 * orders created before this tracking system still place correctly on the
 * timeline.
 */
const LEGACY_STATUS_TO_STAGE = {
    Processing: 'received',
    Pending: 'received',
    Confirmed: 'confirmed',
    Баталгаажсан: 'confirmed',
    Shipped: 'shipped',
    Ачигдсан: 'shipped',
    Хүргэлтэнд: 'out_for_delivery',
    'Хүргэлтэд гарсан': 'out_for_delivery',
    Delivered: 'delivered',
    Хүргэгдсэн: 'delivered',
    Cancelled: 'cancelled',
    Цуцлагдсан: 'cancelled',
};

/** @param {string} status */
function legacyStatusToStage(status) {
    if (!status) return 'received';
    return LEGACY_STATUS_TO_STAGE[status] || 'received';
}

/**
 * Reverse map: keep the legacy `status` field in sync whenever a stage is set, so
 * existing consumers keep working WITHOUT a data migration —
 *   • loyalty spend counts only `status === 'Хүргэгдсэн'`
 *   • admin revenue excludes `'Processing'` and `'Cancelled'`
 * @param {string} stageKey
 */
function stageToStatus(stageKey) {
    if (stageKey === 'delivered') return 'Хүргэгдсэн';
    if (stageKey === 'cancelled' || stageKey === 'returned') return 'Cancelled'; // excluded from revenue
    if (stageKey === 'received' || !stageKey) return 'Processing';
    // Any in-progress pipeline stage (or on_hold/failed) counts as live.
    return 'Shipped';
}

/**
 * The order's current stage key. Prefers the explicit `trackingStage`; falls back
 * to deriving from the legacy `status` for older orders.
 * @param {{trackingStage?:string, status?:string}} order
 */
export function getCurrentStage(order) {
    if (!order) return 'received';
    if (order.trackingStage) return order.trackingStage;
    return legacyStatusToStage(order.status);
}

/**
 * Build the timeline events for an order. If a stored `trackingHistory` exists it
 * is used as-is; otherwise events are synthesised from the (possibly legacy)
 * status so old orders still render a meaningful timeline. Returns chronological
 * order (oldest first); callers reverse for newest-first display.
 * @param {{trackingHistory?:Array, trackingStage?:string, status?:string, date?:string, createdAt?:string, cancelledAt?:string}} order
 */
export function getTrackingEvents(order) {
    if (!order) return [];
    if (Array.isArray(order.trackingHistory) && order.trackingHistory.length > 0) {
        return [...order.trackingHistory];
    }
    const created = order.createdAt || order.date || null;
    const events = [{ stage: RECEIVED_STAGE.key, label: RECEIVED_STAGE.label, timestamp: created }];
    const stageKey = getCurrentStage(order);
    if (stageKey === 'cancelled') {
        events.push({ stage: 'cancelled', label: CANCELLED_STAGE.label, timestamp: order.cancelledAt || created });
    } else if (stageKey !== 'received') {
        const def = getStageDef(stageKey);
        if (def) events.push({ stage: def.key, label: def.label, timestamp: created });
    }
    return events;
}

/**
 * Customer-facing quick-filter groups (the Orders tab status bar). Each maps to a
 * set of stage keys.
 */
export const STAGE_GROUPS = [
    { key: 'pending', label: 'Хүлээгдэж буй', stages: ['received', 'confirmed'] },
    { key: 'prep', label: 'Бэлтгэж буй', stages: ['purchased', 'warehouse'] },
    { key: 'transit', label: 'Замдаа', stages: ['shipped', 'customs', 'arrived_ub'] },
    { key: 'delivery', label: 'Хүргэлтэнд', stages: ['out_for_delivery'] },
    { key: 'done', label: 'Хүргэгдсэн', stages: ['delivered'] },
];

/**
 * Which group key an order currently belongs to (or 'cancelled').
 * @param {object} order
 */
export function getStageGroup(order) {
    const stage = getCurrentStage(order);
    if (isExceptionStage(stage)) return stage === 'cancelled' ? 'cancelled' : 'exception';
    const g = STAGE_GROUPS.find((group) => group.stages.includes(stage));
    return g ? g.key : 'pending';
}

/**
 * Progress 0..1 across the 8 pipeline stages (received → 0, delivered → 1).
 * Cancelled returns 0.
 * @param {object} order
 */
export function getStageProgress(order) {
    const stage = getCurrentStage(order);
    if (stage === 'received' || isExceptionStage(stage)) return 0;
    const idx = getStageIndex(stage);
    if (idx < 0) return 0;
    return (idx + 1) / ORDER_STAGES.length;
}

/**
 * Compute the Firestore patch for moving an order to `stageKey`. The pipeline
 * behaves like a slider: setting stage N marks stages 1..N done (filling any
 * skipped earlier stages) and drops anything after N, so the timeline is always
 * continuous. Existing timestamps/notes are preserved; the tapped stage is
 * (re)stamped now and gets the optional `note`. Cancelling keeps the journey so
 * far and appends a cancelled event.
 *
 * Returns { trackingStage, trackingHistory, status, cancelledAt|null } — or null
 * if `stageKey` is not a known stage.
 * @param {object} order
 * @param {string} stageKey
 * @param {string} [note]
 */
export function buildTrackingUpdate(order, stageKey, note = '') {
    const now = new Date().toISOString();
    const prev = getTrackingEvents(order);
    const tsByStage = {};
    const noteByStage = {};
    prev.forEach((e) => {
        if (e.timestamp) tsByStage[e.stage] = e.timestamp;
        if (e.note) noteByStage[e.stage] = e.note;
    });
    const receivedTs = tsByStage[RECEIVED_STAGE.key] || order?.createdAt || order?.date || now;
    const cleanNote = (note || '').trim();

    if (isExceptionStage(stageKey)) {
        const def = getStageDef(stageKey);
        // Keep the journey so far, drop any prior exception event, append this one.
        const base = prev.filter((e) => !isExceptionStage(e.stage));
        const history = [...base, { stage: stageKey, label: def.label, note: cleanNote, timestamp: now }];
        return { trackingStage: stageKey, trackingHistory: history, status: stageToStatus(stageKey), cancelledAt: stageKey === CANCELLED_STAGE.key ? now : null };
    }

    const targetIdx = getStageIndex(stageKey);
    if (targetIdx < 0) return null;

    const history = [{
        stage: RECEIVED_STAGE.key,
        label: RECEIVED_STAGE.label,
        note: noteByStage[RECEIVED_STAGE.key] || '',
        timestamp: receivedTs,
    }];
    for (let i = 0; i <= targetIdx; i++) {
        const def = ORDER_STAGES[i];
        const isTarget = i === targetIdx;
        history.push({
            stage: def.key,
            label: def.label,
            note: isTarget ? (cleanNote || noteByStage[def.key] || '') : (noteByStage[def.key] || ''),
            timestamp: isTarget ? now : (tsByStage[def.key] || now),
        });
    }
    return { trackingStage: stageKey, trackingHistory: history, status: stageToStatus(stageKey), cancelledAt: null };
}
