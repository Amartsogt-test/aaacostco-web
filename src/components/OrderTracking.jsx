import {
    ClipboardList, BadgeCheck, ShoppingBag, Warehouse, Plane,
    FileCheck, MapPin, Truck, PackageCheck, XCircle, Clock, PauseCircle, RotateCcw
} from 'lucide-react';
import {
    ORDER_STAGES, RECEIVED_STAGE,
    getStageDef, getCurrentStage, getStageIndex, getTrackingEvents, getStageProgress, isExceptionStage
} from '../utils/orderTracking';
import { formatDate } from '../utils/format';

// Stage key → icon. Kept here (not in the constants module) so that module stays
// JSX/dependency-free.
const STAGE_ICONS = {
    received: ClipboardList,
    confirmed: BadgeCheck,
    purchased: ShoppingBag,
    warehouse: Warehouse,
    shipped: Plane,
    customs: FileCheck,
    arrived_ub: MapPin,
    out_for_delivery: Truck,
    delivered: PackageCheck,
    cancelled: XCircle,
    on_hold: PauseCircle,
    failed: XCircle,
    returned: RotateCcw,
};

/**
 * Detailed, timestamped shipment timeline (AliExpress-style): a prominent current
 * status header with a progress bar, the history of reached events newest-first,
 * and a faint roadmap of the upcoming stages. Works for both logged-in customers
 * and the guest tracking page; an order with no stored `trackingHistory` is
 * rendered from its (possibly legacy) status via getTrackingEvents().
 */
export default function OrderTracking({ order }) {
    if (!order) return null;

    const currentStage = getCurrentStage(order);
    const isException = isExceptionStage(currentStage);     // cancelled / failed / returned / on_hold
    const isAmber = currentStage === 'on_hold';             // amber (non-terminal) vs red
    const isCancelled = currentStage === 'cancelled';
    const currentDef = getStageDef(currentStage) || RECEIVED_STAGE;

    const events = getTrackingEvents(order);          // chronological (oldest → newest)
    const reached = new Set(events.map((e) => e.stage));
    const feed = [...events].reverse();               // newest first (matches reference)

    const currentIndex = getStageIndex(currentStage); // -1 for received / cancelled
    const upcoming = isException
        ? []
        : ORDER_STAGES.filter((s, i) => !reached.has(s.key) && i > currentIndex);

    const CurrentIcon = STAGE_ICONS[currentStage] || Clock;
    const progress = Math.round(getStageProgress(order) * 100);
    const totalSteps = ORDER_STAGES.length;
    const stepNum = currentStage === 'received' || currentIndex < 0 ? 0 : currentIndex + 1;
    const lastTs = feed.length > 0 ? feed[0].timestamp : (order.date || order.createdAt);
    const unpaidCharges = (order.additionalCharges || []).filter((c) => !c.paid);
    const unpaidTotal = unpaidCharges.reduce((a, c) => a + (Number(c.amount) || 0), 0);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Current status header */}
            <div className={`p-4 ${isException ? (isAmber ? 'bg-amber-50' : 'bg-red-50') : 'bg-gradient-to-br from-blue-50 to-white'}`}>
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isException ? (isAmber ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-500') : 'bg-costco-blue text-white'}`}>
                        <CurrentIcon size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className={`font-extrabold text-lg leading-tight ${isException ? (isAmber ? 'text-amber-700' : 'text-red-700') : 'text-gray-900'}`}>
                            {currentDef.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {lastTs ? `Шинэчлэгдсэн: ${formatDate(lastTs, { withTime: true })}` : currentDef.hint}
                        </p>
                        {order.trackingNumber && (
                            <p className="text-xs text-gray-600 mt-0.5">Илгээмжийн дугаар: <span className="font-bold">{order.trackingNumber}</span></p>
                        )}
                        {order.estimatedDelivery && !isException && (
                            <p className="text-xs text-gray-600 mt-0.5">Хүргэх хугацаа: <span className="font-bold">{order.estimatedDelivery}</span></p>
                        )}
                    </div>
                </div>

                {!isException && (
                    <div className="mt-3">
                        <div className="flex justify-between text-[11px] font-medium text-gray-500 mb-1">
                            <span>Үе шат {stepNum}/{totalSteps}</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-green-400 to-costco-blue rounded-full transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Outstanding additional charges (customs duty / weight difference) */}
            {unpaidCharges.length > 0 && (
                <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-bold text-amber-800 mb-1">Төлөх нэмэлт төлбөр: {Math.round(unpaidTotal).toLocaleString()}₮</p>
                    {unpaidCharges.map((c, i) => (
                        <p key={i} className="text-xs text-amber-700 flex justify-between gap-2">
                            <span className="truncate">{c.label}</span><span className="font-bold shrink-0">{Math.round(c.amount).toLocaleString()}₮</span>
                        </p>
                    ))}
                </div>
            )}

            {/* Event feed — newest first */}
            <div className="p-4">
                <div className="relative">
                    {feed.map((ev, idx) => {
                        const def = getStageDef(ev.stage);
                        const Icon = STAGE_ICONS[ev.stage] || Clock;
                        const isCancelEv = ev.stage === 'cancelled';
                        const isLatest = idx === 0 && !isCancelled;
                        const isLast = idx === feed.length - 1;
                        return (
                            <div key={`${ev.stage}-${idx}`} className="relative flex gap-3 pb-5 last:pb-0">
                                {!isLast && <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200" />}
                                <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCancelEv
                                    ? 'bg-red-100 text-red-500'
                                    : isLatest
                                        ? 'bg-costco-blue text-white ring-4 ring-blue-100'
                                        : 'bg-green-100 text-green-600'
                                    }`}>
                                    <Icon size={13} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={`text-sm font-bold ${isLatest ? 'text-gray-900' : isCancelEv ? 'text-red-600' : 'text-gray-700'}`}>
                                        {ev.label || def?.label || ev.stage}
                                    </p>
                                    {(ev.note || def?.hint) && (
                                        <p className="text-xs text-gray-500 mt-0.5">{ev.note || def?.hint}</p>
                                    )}
                                    {ev.timestamp && (
                                        <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(ev.timestamp, { withTime: true })}</p>
                                    )}
                                    {ev.stage === 'delivered' && order.deliveredReceiver && (
                                        <p className="text-[11px] text-green-700 mt-0.5">
                                            Хүлээн авсан: <b>{order.deliveredReceiver}</b>
                                            {order.deliveredPhoto && (
                                                <> · <a href={order.deliveredPhoto} target="_blank" rel="noopener noreferrer" className="underline">зураг</a></>
                                            )}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Upcoming stages (faint roadmap) */}
                {upcoming.length > 0 && (
                    <div className="mt-1 pt-3 border-t border-dashed border-gray-200">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Дараагийн үе шатууд</p>
                        <div className="space-y-2.5">
                            {upcoming.map((s) => {
                                const Icon = STAGE_ICONS[s.key] || Clock;
                                return (
                                    <div key={s.key} className="flex gap-3 items-center opacity-60">
                                        <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-300 flex items-center justify-center shrink-0">
                                            <Icon size={13} />
                                        </div>
                                        <p className="text-xs text-gray-400">{s.label}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
