import React, { useState, useEffect, useMemo } from 'react';
import { useOrderStore } from '../store/orderStore';
import { useProductStore } from '../store/productStore';
import { useShallow } from 'zustand/react/shallow';
import { Package, Search, Filter, ExternalLink, Crown, ChevronLeft, ChevronRight, XCircle, Check, Layers, X, FileText } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import OrderTracking from '../components/OrderTracking';
import {
    ORDER_STAGES, RECEIVED_STAGE, CANCELLED_STAGE, EXCEPTION_STAGES,
    getCurrentStage, getStageIndex, getStageDef
} from '../utils/orderTracking';
import { openCustomsDocs, downloadManifestCSV, openLabels } from '../utils/customsDoc';
import { uploadFileToStorage } from '../firebase';

// Persisted customs-export header (exporter / consignee / currency / Incoterm).
const CUSTOMS_CFG_KEY = 'customsExportConfig';
const loadCustomsCfg = () => {
    try { return JSON.parse(localStorage.getItem(CUSTOMS_CFG_KEY)) || {}; } catch { return {}; }
};

// Stage key → badge colours (admin list).
const STAGE_BADGE = {
    received: 'bg-gray-100 text-gray-700',
    confirmed: 'bg-indigo-100 text-indigo-700',
    purchased: 'bg-violet-100 text-violet-700',
    warehouse: 'bg-sky-100 text-sky-700',
    shipped: 'bg-cyan-100 text-cyan-700',
    customs: 'bg-amber-100 text-amber-700',
    arrived_ub: 'bg-teal-100 text-teal-700',
    out_for_delivery: 'bg-orange-100 text-orange-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
};

export default function AdminOrders() {
    const { orders, setOrderStage, setOrdersStage, patchOrder, fetchOrders } = useOrderStore(useShallow(state => ({
        orders: state.orders,
        setOrderStage: state.setOrderStage,
        setOrdersStage: state.setOrdersStage,
        patchOrder: state.patchOrder,
        fetchOrders: state.fetchOrders
    })));
    const { products, fetchProducts, wonRate } = useProductStore(useShallow(state => ({
        products: state.products,
        fetchProducts: state.fetchProducts,
        wonRate: state.wonRate
    })));
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const isSummaryMode = searchParams.get('view') === 'summary';

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStage, setFilterStage] = useState('All');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [expandedOrder, setExpandedOrder] = useState(null);
    // Per-order note typed by the admin, attached to the next stage they tap.
    const [stageNote, setStageNote] = useState({});
    // Bulk selection (batch import workflow).
    const [selected, setSelected] = useState(() => new Set());
    const [bulkStage, setBulkStage] = useState('');
    const [bulkNote, setBulkNote] = useState('');
    const [bulkBusy, setBulkBusy] = useState(false);
    // Customs export modal + persisted header config.
    const [showCustoms, setShowCustoms] = useState(false);
    const [customsCfg, setCustomsCfg] = useState(() => {
        const s = loadCustomsCfg();
        return {
            exporterName: s.exporterName || '',
            exporterAddress: s.exporterAddress || '',
            consigneeName: s.consigneeName || '',
            consigneeAddress: s.consigneeAddress || '',
            currency: s.currency || 'KRW',
            usdRate: s.usdRate || '',
            incoterm: s.incoterm || 'FOB Incheon, Korea',
            include: s.include || { manifest: true, invoice: true, packing: true },
            dutyFreeThresholdMNT: s.dutyFreeThresholdMNT || 660000,
            dutyRate: s.dutyRate ?? 5,
            vatRate: s.vatRate ?? 10,
            originCountry: s.originCountry || 'Republic of Korea',
            useCostValue: s.useCostValue || false,
            invoiceNo: '',
        };
    });
    // Draft courier tracking numbers, keyed by order id (saved via patchOrder).
    const [trackingDraft, setTrackingDraft] = useState({});
    const [etaDraft, setEtaDraft] = useState({});      // estimated delivery text
    const [podDraft, setPodDraft] = useState({});      // proof-of-delivery receiver name
    const [podBusy, setPodBusy] = useState(false);     // POD photo upload in progress
    const [chargeDraft, setChargeDraft] = useState({}); // additional-charge {label, amount} per order

    // Fetch products and orders on mount
    useEffect(() => {
        fetchProducts();
        fetchOrders();
    }, [fetchProducts, fetchOrders]);

    // Pre-compute user spend by phone to avoid O(n²) recalculation per row.
    const userSpendByPhone = useMemo(() => {
        const map = {};
        orders.forEach(o => {
            const phone = o.recipientPhone ? String(o.recipientPhone).replace(/\D/g, '') : '';
            if (phone && o.status !== 'Cancelled') {
                const totalKRW = (o.currency === 'MNT' && wonRate > 0) ? (o.total || 0) / wonRate : (o.total || 0);
                map[phone] = (map[phone] || 0) + totalKRW;
            }
        });
        return map;
    }, [orders, wonRate]);

    // Frequency control (consolidated express): the duty exemption assumes
    // non-commercial volume, so the same recipient (by register, falling back
    // to phone) placing 3+ orders within 30 days is flagged for review —
    // customs may treat systematic repeat parcels as commercial imports.
    const FREQ_WINDOW_DAYS = 30;
    const FREQ_LIMIT = 3;
    const freqKeyOf = (o) => ((o.recipientRegister || '').trim().toUpperCase())
        || (o.recipientPhone ? `P${String(o.recipientPhone).replace(/\D/g, '')}` : '');
    const frequentRecipients = useMemo(() => {
        const cutoff = Date.now() - FREQ_WINDOW_DAYS * 24 * 3600 * 1000;
        const counts = {};
        orders.forEach(o => {
            if (o.status === 'Cancelled') return;
            const ts = new Date(o.date || o.createdAt || 0).getTime();
            if (!(ts >= cutoff)) return;
            const key = ((o.recipientRegister || '').trim().toUpperCase())
                || (o.recipientPhone ? `P${String(o.recipientPhone).replace(/\D/g, '')}` : '');
            if (!key) return;
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }, [orders]);
    const freqCountOf = (o) => frequentRecipients[freqKeyOf(o)] || 0;

    const filteredOrders = useMemo(() => {
        const validProductNames = new Set(products.map(p => p.name));
        // Date-range bounds (inclusive) on the order date — drives the batch workflow.
        const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
        const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

        return orders.filter(order => {
            const hasValidItems = (order.items || []).some(item => validProductNames.has(item.name));
            if (!hasValidItems) return false;

            const q = searchTerm.toLowerCase().trim();
            const matchesSearch = !q || order.id.toLowerCase().includes(q) ||
                (order.customer || '').toLowerCase().includes(q) ||
                (order.recipientName || '').toLowerCase().includes(q) ||
                (order.recipientPhone || '').includes(searchTerm.trim()) ||
                (order.recipientRegister || '').toLowerCase().includes(q);
            const matchesStage = filterStage === 'All' || getCurrentStage(order) === filterStage;

            const od = new Date(order.date).getTime();
            const matchesDate = (fromTs === null || (od >= fromTs)) && (toTs === null || (od <= toTs));

            return matchesSearch && matchesStage && matchesDate;
        });
    }, [orders, products, searchTerm, filterStage, dateFrom, dateTo]);

    const stats = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((acc, order) => acc + (order.status !== 'Cancelled' && order.status !== 'Processing' ? order.total : 0), 0),
        pendingOrders: orders.filter(o => o.status === 'Processing').length
    };

    // ---- Single-order stage controls (expanded row) ----
    const handleSetStage = (orderId, stageKey) => {
        setOrderStage(orderId, stageKey, stageNote[orderId] || '');
        setStageNote(prev => ({ ...prev, [orderId]: '' }));
    };
    const handleAdvance = (order) => {
        const cur = getCurrentStage(order);
        if (cur === 'cancelled' || cur === 'delivered') return;
        const next = ORDER_STAGES[getStageIndex(cur) + 1];
        if (next) setOrderStage(order.id, next.key, '');
    };
    const handleCancel = (orderId) => {
        if (confirm('Энэ захиалгыг цуцлах уу?')) {
            setOrderStage(orderId, CANCELLED_STAGE.key, stageNote[orderId] || '');
            setStageNote(prev => ({ ...prev, [orderId]: '' }));
        }
    };

    // ---- Bulk selection + apply ----
    const allFilteredSelected = filteredOrders.length > 0 && filteredOrders.every(o => selected.has(o.id));
    const toggleSelect = (id) => setSelected(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });
    const toggleSelectAll = () => setSelected(prev => {
        const n = new Set(prev);
        if (allFilteredSelected) filteredOrders.forEach(o => n.delete(o.id));
        else filteredOrders.forEach(o => n.add(o.id));
        return n;
    });
    const clearSelection = () => setSelected(new Set());

    const handleBulkApply = async () => {
        if (!bulkStage || selected.size === 0) return;
        const ids = [...selected];
        const label = (getStageDef(bulkStage) || {}).label || bulkStage;
        if (!confirm(`${ids.length} захиалгыг "${label}" төлөвт шилжүүлэх үү?`)) return;
        setBulkBusy(true);
        try {
            await setOrdersStage(ids, bulkStage, bulkNote);
            clearSelection();
            setBulkNote('');
            setBulkStage('');
        } catch {
            alert('Зарим захиалгыг шинэчилж чадсангүй. Дахин оролдоно уу.');
        } finally {
            setBulkBusy(false);
        }
    };

    // ---- Customs documents (Manifest + Commercial Invoice + Packing List) ----
    const cfg = (k, v) => setCustomsCfg(prev => ({ ...prev, [k]: v }));
    const toggleInclude = (k) => setCustomsCfg(prev => ({ ...prev, include: { ...prev.include, [k]: !prev.include[k] } }));
    const openCustomsModal = () => {
        if (selected.size === 0) return;
        setCustomsCfg(prev => ({
            ...prev,
            invoiceNo: prev.invoiceNo || `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
        }));
        setShowCustoms(true);
    };
    const handleGenerateCustoms = () => {
        const selectedOrders = orders
            .filter(o => selected.has(o.id))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        if (selectedOrders.length === 0) return;
        const productsById = new Map(products.map(p => [p.id, p]));
        // Remember the header (minus the per-batch invoice no) for next time.
        const persist = { ...customsCfg };
        delete persist.invoiceNo;
        try { localStorage.setItem(CUSTOMS_CFG_KEY, JSON.stringify(persist)); } catch { /* ignore */ }
        const ok = openCustomsDocs({ orders: selectedOrders, productsById, wonRate, config: customsCfg });
        if (!ok) { alert('Попап хаагдсан байна. Попапыг зөвшөөрөөд дахин оролдоно уу.'); return; }
        setShowCustoms(false);
    };
    const handleDownloadCSV = () => {
        const selectedOrders = orders
            .filter(o => selected.has(o.id))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        if (selectedOrders.length === 0) return;
        const productsById = new Map(products.map(p => [p.id, p]));
        const persist = { ...customsCfg };
        delete persist.invoiceNo;
        try { localStorage.setItem(CUSTOMS_CFG_KEY, JSON.stringify(persist)); } catch { /* ignore */ }
        downloadManifestCSV({ orders: selectedOrders, productsById, wonRate, config: customsCfg });
        setShowCustoms(false);
    };

    // Save a courier tracking number onto an order (links it to the courier system).
    const handleSaveTracking = (orderId) => {
        const val = (trackingDraft[orderId] ?? '').trim();
        patchOrder(orderId, { trackingNumber: val });
    };

    // ETA (estimated delivery) + proof-of-delivery (receiver name + photo).
    const handleSaveEta = (orderId) => patchOrder(orderId, { estimatedDelivery: (etaDraft[orderId] ?? '').trim() });
    const handleSavePod = (orderId) => patchOrder(orderId, { deliveredReceiver: (podDraft[orderId] ?? '').trim() });
    const handleResolveReturn = (order) => patchOrder(order.id, { returnRequest: { ...(order.returnRequest || {}), status: 'resolved', resolvedAt: new Date().toISOString() } });
    const handlePodPhoto = async (orderId, file) => {
        if (!file) return;
        setPodBusy(true);
        try {
            const url = await uploadFileToStorage(`pod/${orderId}-${Date.now()}`, file);
            await patchOrder(orderId, { deliveredPhoto: url });
        } catch (e) {
            console.error('POD photo upload failed:', e);
            alert('Зураг хадгалахад алдаа гарлаа.');
        } finally {
            setPodBusy(false);
        }
    };

    // Additional charges (customs duty, weight difference, …) on an order.
    const handleAddCharge = (order) => {
        const d = chargeDraft[order.id] || {};
        const amount = Number(d.amount);
        if (!amount || amount <= 0) return;
        const charges = [...(order.additionalCharges || []), {
            id: Date.now().toString(),
            label: (d.label || '').trim() || 'Нэмэлт төлбөр',
            amount,
            paid: false,
            addedAt: new Date().toISOString(),
        }];
        patchOrder(order.id, { additionalCharges: charges });
        setChargeDraft(prev => ({ ...prev, [order.id]: { label: '', amount: '' } }));
    };
    const handleToggleChargePaid = (order, chargeId) => {
        const charges = (order.additionalCharges || []).map(c => c.id === chargeId ? { ...c, paid: !c.paid } : c);
        patchOrder(order.id, { additionalCharges: charges });
    };
    const handleRemoveCharge = (order, chargeId) => {
        patchOrder(order.id, { additionalCharges: (order.additionalCharges || []).filter(c => c.id !== chargeId) });
    };

    // Bulk-import courier tracking numbers from a CSV (orderId,trackingNumber per line).
    const handleTrackingImport = async (file) => {
        if (!file) return;
        try {
            const text = await file.text();
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const known = new Set(orders.map(o => o.id));
            let n = 0;
            for (const line of lines) {
                const parts = line.split(',');
                const id = (parts[0] || '').replace(/^\uFEFF/, '').trim();
                const track = (parts[1] || '').trim();
                if (!id || !track || !known.has(id)) continue; // skip header/unknown
                patchOrder(id, { trackingNumber: track });
                n++;
            }
            alert(`${n} захиалгад tracking дугаар орууллаа.`);
        } catch (e) {
            console.error('tracking import failed', e);
            alert('Файл уншихад алдаа гарлаа.');
        }
    };

    // Print shipping labels (recipient + order-id barcode) for the selected orders.
    const handlePrintLabels = () => {
        const selectedOrders = orders.filter(o => selected.has(o.id)).sort((a, b) => new Date(a.date) - new Date(b.date));
        if (selectedOrders.length === 0) return;
        if (!openLabels(selectedOrders)) alert('Попап хаагдсан байна. Попапыг зөвшөөрнө үү.');
    };

    return (
        <div className={`min-h-screen bg-gray-50 ${isSummaryMode ? 'py-4' : 'py-8'} px-4`}>
            <div className={`mx-auto transition-all duration-300 ${isSummaryMode ? 'w-full px-2' : 'container max-w-6xl'}`}>
                {!isSummaryMode && (
                    <>
                        <div className="flex items-center gap-4 mb-6">
                            <button
                                onClick={() => navigate('/admin')}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                                title="Буцах"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <h1 className="text-2xl font-bold text-gray-900">Захиалгын удирдлага</h1>
                        </div>

                        {/* Filters: search, stage, date range */}
                        <div className="flex flex-col gap-3 mb-4">
                            <div className="flex flex-col md:flex-row gap-3 justify-between">
                                <div className="relative w-full md:w-96">
                                    <input
                                        type="text"
                                        placeholder="Захиалгын код, Хэрэглэгчийн нэр..."
                                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-costco-blue focus:border-transparent outline-none"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                </div>
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <Filter size={18} className="text-gray-400 shrink-0" />
                                    <select
                                        className="bg-white border border-gray-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-costco-blue w-full"
                                        value={filterStage}
                                        onChange={(e) => setFilterStage(e.target.value)}
                                    >
                                        <option value="All">Бүх үе шат</option>
                                        <option value={RECEIVED_STAGE.key}>{RECEIVED_STAGE.label}</option>
                                        {ORDER_STAGES.map(s => (
                                            <option key={s.key} value={s.key}>{s.label}</option>
                                        ))}
                                        <option value={CANCELLED_STAGE.key}>{CANCELLED_STAGE.label}</option>
                                    </select>
                                </div>
                            </div>
                            {/* Date range — select a batch of orders by when they were placed */}
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-gray-500 font-medium">Захиалсан огноо:</span>
                                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-costco-blue" />
                                <span className="text-gray-400">→</span>
                                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-costco-blue" />
                                {(dateFrom || dateTo) && (
                                    <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                                        className="text-gray-400 hover:text-red-500 flex items-center gap-1 text-xs">
                                        <X size={14} /> цэвэрлэх
                                    </button>
                                )}
                                <label className="text-xs font-bold text-costco-blue bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-blue-100">
                                    Tracking импорт (CSV)
                                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { handleTrackingImport(e.target.files?.[0]); e.target.value = ''; }} />
                                </label>
                                <span className="ml-auto text-gray-500">{filteredOrders.length} захиалга</span>
                            </div>
                        </div>

                        {/* Bulk action bar — appears when ≥1 order is selected */}
                        {selected.size > 0 && (
                            <div className="sticky top-2 z-30 mb-4 bg-white border-2 border-costco-blue rounded-xl shadow-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                                <div className="flex items-center gap-2 text-sm font-bold text-costco-blue shrink-0">
                                    <Layers size={18} />
                                    {selected.size} сонгогдсон
                                </div>
                                <select
                                    value={bulkStage}
                                    onChange={(e) => setBulkStage(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-costco-blue"
                                >
                                    <option value="">Үе шат сонгох...</option>
                                    {ORDER_STAGES.map(s => (
                                        <option key={s.key} value={s.key}>{s.label}</option>
                                    ))}
                                    <option value={CANCELLED_STAGE.key}>{CANCELLED_STAGE.label}</option>
                                </select>
                                <input
                                    type="text"
                                    value={bulkNote}
                                    onChange={(e) => setBulkNote(e.target.value)}
                                    placeholder="Нэмэлт тэмдэглэл (заавал биш)"
                                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-costco-blue"
                                />
                                <button
                                    onClick={handleBulkApply}
                                    disabled={!bulkStage || bulkBusy}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold text-white shrink-0 ${!bulkStage || bulkBusy ? 'bg-gray-300 cursor-not-allowed' : 'bg-costco-blue hover:bg-blue-700'}`}
                                >
                                    {bulkBusy ? 'Шинэчилж байна...' : `${selected.size} захиалгад хэрэглэх`}
                                </button>
                                <button
                                    onClick={openCustomsModal}
                                    className="px-3 py-2 rounded-lg text-sm font-bold text-costco-blue bg-blue-50 border border-blue-200 hover:bg-blue-100 shrink-0 flex items-center gap-1"
                                    title="Сонгосон захиалгаар Commercial Invoice + Packing List гаргах"
                                >
                                    <FileText size={16} /> Гаалийн бичиг
                                </button>
                                <button
                                    onClick={handlePrintLabels}
                                    className="px-3 py-2 rounded-lg text-sm font-bold text-gray-700 bg-gray-100 border border-gray-200 hover:bg-gray-200 shrink-0 flex items-center gap-1"
                                    title="Сонгосон захиалгын илгээмжийн шошго хэвлэх"
                                >
                                    <FileText size={16} /> Шошго
                                </button>
                                <button onClick={clearSelection} className="text-gray-400 hover:text-gray-700 p-2 shrink-0" title="Сонголт цэвэрлэх">
                                    <X size={18} />
                                </button>
                            </div>
                        )}

                        {/* Orders Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-200 border-b border-gray-100">
                                        <tr>
                                            <th className="py-3 px-4 w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={allFilteredSelected}
                                                    onChange={toggleSelectAll}
                                                    className="w-4 h-4 accent-costco-blue cursor-pointer"
                                                    title="Бүгдийг сонгох"
                                                />
                                            </th>
                                            <th className="py-3 px-4 font-bold text-gray-600 text-sm">Захиалга: {stats.totalOrders}</th>
                                            <th className="py-3 px-4 font-bold text-gray-600 text-sm">Хэрэглэгч</th>
                                            <th className="py-3 px-4 font-bold text-gray-600 text-sm">{stats.totalRevenue.toLocaleString()}₮</th>
                                            <th className="py-3 px-4 font-bold text-gray-600 text-sm">Явц</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredOrders.map(order => {
                                            const stageKey = getCurrentStage(order);
                                            const stageDef = getStageDef(stageKey) || RECEIVED_STAGE;
                                            const canAdvance = stageKey !== 'delivered' && stageKey !== 'cancelled';
                                            const isSelected = selected.has(order.id);
                                            return (
                                                <React.Fragment key={order.id}>
                                                    <tr className={`transition cursor-pointer ${isSelected ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`} onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                                                        <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => toggleSelect(order.id)}
                                                                className="w-4 h-4 accent-costco-blue cursor-pointer"
                                                            />
                                                        </td>
                                                        <td className="py-4 px-4 font-medium text-gray-900">
                                                            <div className="flex flex-col">
                                                                <span className="text-gray-900">{order.id}</span>
                                                                <span className="text-xs text-gray-400">
                                                                    {new Date(order.date).toLocaleString('sv-SE', {
                                                                        year: 'numeric', month: '2-digit', day: '2-digit',
                                                                        hour: '2-digit', minute: '2-digit', hour12: false
                                                                    })}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-4 text-gray-900">
                                                            <div className="flex items-center gap-2">
                                                                {(order.customer && (order.customer.includes('facebook.com') || order.customer.startsWith('http'))) ? (
                                                                    <a href={order.customer} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                        <ExternalLink size={14} />
                                                                        {order.customer.replace('https://www.facebook.com/', '').replace('profile.php?id=', '')}
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-gray-900">{order.customer || 'Guest'}</span>
                                                                )}
                                                                {(() => {
                                                                    const phone = order.recipientPhone;
                                                                    if (!phone) return null;
                                                                    const cleanPhone = String(phone).replace(/\D/g, '');
                                                                    const userTotalSpend = userSpendByPhone[cleanPhone] || 0;
                                                                    let tierColor = 'text-orange-400';
                                                                    let tierName = 'Silver';
                                                                    if (userTotalSpend >= 20000000) {
                                                                        tierColor = 'text-gray-600';
                                                                        tierName = 'Platinum';
                                                                    } else if (userTotalSpend >= 10000000) {
                                                                        tierColor = 'text-yellow-500';
                                                                        tierName = 'Gold';
                                                                    }
                                                                    return (
                                                                        <div className={`${tierColor}`} title={`${tierName}: ${userTotalSpend.toLocaleString()}₩`}>
                                                                            <Crown size={16} fill="currentColor" />
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-4 tabular-nums text-gray-600">
                                                            <div className="flex flex-col">
                                                                <span>{(order.total || 0).toLocaleString()}{order.currency === 'KRW' ? '₩' : '₮'}</span>
                                                                {order.paymentMethod === 'wire' && (
                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 mt-1 rounded inline-block w-fit ${order.wire?.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                        Wire: {order.wire?.paid ? 'Төлөгдсөн' : 'Хүлээгдэж буй'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${STAGE_BADGE[stageKey] || 'bg-gray-100 text-gray-700'}`}>
                                                                    {stageDef.label}
                                                                </span>
                                                                {canAdvance && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleAdvance(order); }}
                                                                        className="w-7 h-7 flex items-center justify-center bg-costco-blue text-white rounded-full hover:bg-blue-700 transition shrink-0"
                                                                        title="Дараагийн үе шат руу шилжүүлэх"
                                                                    >
                                                                        <ChevronRight size={16} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>

                                                    {/* Expanded Row Details */}
                                                    {expandedOrder === order.id && (
                                                        <tr className="bg-gray-50/50">
                                                            <td colSpan="5" className="p-6">
                                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                                    {/* Left: items + delivery + stage controls */}
                                                                    <div className="bg-white rounded-lg border border-gray-100 p-4">
                                                                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                                                            <Package size={16} />
                                                                            Барааны жагсаалт
                                                                        </h4>
                                                                        <div className="divide-y divide-gray-100 mb-4">
                                                                            {order.items.map((item, idx) => {
                                                                                const productInfo = products.find(p => p.name === item.name);
                                                                                const productLink = productInfo?.url || productInfo?.costcoUrl || productInfo?.productLink || '';
                                                                                return (
                                                                                    <div key={idx} className="py-2 flex justify-between text-sm items-center">
                                                                                        <div className="text-gray-600 flex items-center gap-2">
                                                                                            <span className="font-medium text-gray-900">{item.name}</span>
                                                                                            <span className="text-gray-400">x{item.quantity}</span>
                                                                                            {productLink && (
                                                                                                <a href={productLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded" title="Барааны линк руу үсрэх" onClick={(e) => e.stopPropagation()}>
                                                                                                    <ExternalLink size={14} />
                                                                                                </a>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="tabular-nums text-gray-700">{(item.price * item.quantity).toLocaleString()}₩</div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>

                                                                            {(order.tierDiscount > 0 || order.couponDiscount > 0) && (
                                                                                <div className="mt-2 pt-2 border-t border-gray-200">
                                                                                    {order.tierDiscount > 0 && (
                                                                                        <div className="flex justify-between text-sm text-green-600 font-medium">
                                                                                            <span>Гишүүнчлэлийн хөнгөлөлт ({order.tierDiscountRate}%):</span>
                                                                                            <span>-{order.tierDiscount.toLocaleString()}₮</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {order.couponDiscount > 0 && (
                                                                                        <div className="flex justify-between text-sm text-green-600 font-medium">
                                                                                            <span>Купон ({order.couponCode}):</span>
                                                                                            <span>-{order.couponDiscount.toLocaleString()}₮</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}

                                                                        <div className="mb-4 mt-4 p-3 bg-gray-50 rounded border border-gray-100 text-sm">
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <p className="font-bold text-gray-900">Хүргэлтийн мэдээлэл:</p>
                                                                                {order.isAlternativeReceiver && (
                                                                                    <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide">
                                                                                        Өөр хүн хүлээн авна
                                                                                    </span>
                                                                                )}
                                                                                {order.shipmentGroup && (
                                                                                    <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide" title={`Нэг захиалга ${order.shipmentCount} илгээмж болж хуваагдсан (групп ${order.shipmentGroup})`}>
                                                                                        Илгээмж {order.shipmentIndex}/{order.shipmentCount}
                                                                                    </span>
                                                                                )}
                                                                                {freqCountOf(order) >= FREQ_LIMIT && (
                                                                                    <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide" title={`Энэ хүлээн авагч сүүлийн ${FREQ_WINDOW_DAYS} хоногт ${freqCountOf(order)} захиалга өгсөн — гааль арилжааны гэж үзэх эрсдэлтэй`}>
                                                                                        Давтан {freqCountOf(order)}ш/30х
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-2 text-gray-600">
                                                                                <div>Нэр: <span className="font-medium text-gray-900">{order.recipientName || '-'}</span></div>
                                                                                <div>Утас: <span className="font-medium text-gray-900">{order.recipientPhone || '-'} {order.recipientPhone2 ? `/ ${order.recipientPhone2}` : ''}</span></div>
                                                                                <div>Регистр: <span className="font-medium text-gray-900">{order.recipientRegister || '-'}</span></div>
                                                                                <div className="col-span-2">Хаяг: <span className="font-medium text-gray-900">{order.recipientAddress || '-'}</span></div>
                                                                                {order.deliveryNotes && (
                                                                                    <div className="col-span-2">Нэмэлт заавар: <span className="font-medium text-red-600">{order.deliveryNotes}</span></div>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Single-order stage control */}
                                                                        <div className="border-t border-gray-100 pt-4">
                                                                            <p className="font-bold text-gray-900 text-sm mb-2">Хүргэлтийн явц шинэчлэх</p>
                                                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                                                                {ORDER_STAGES.map((s, i) => {
                                                                                    const curIdx = getStageIndex(stageKey);
                                                                                    const done = i < curIdx;
                                                                                    const current = i === curIdx;
                                                                                    return (
                                                                                        <button
                                                                                            key={s.key}
                                                                                            onClick={(e) => { e.stopPropagation(); handleSetStage(order.id, s.key); }}
                                                                                            className={`text-left text-[11px] leading-tight px-2 py-2 rounded-lg border transition ${current
                                                                                                ? 'bg-costco-blue text-white border-costco-blue font-bold shadow'
                                                                                                : done
                                                                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                                                                    : 'bg-white text-gray-500 border-gray-200 hover:border-costco-blue hover:text-costco-blue'
                                                                                                }`}
                                                                                            title={s.hint}
                                                                                        >
                                                                                            <span className="flex items-center gap-1">
                                                                                                {done && <Check size={11} className="shrink-0" />}
                                                                                                <span className="font-semibold">{i + 1}.</span>
                                                                                            </span>
                                                                                            <span className="block mt-0.5">{s.label}</span>
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                            <input
                                                                                type="text"
                                                                                value={stageNote[order.id] || ''}
                                                                                onChange={(e) => setStageNote(prev => ({ ...prev, [order.id]: e.target.value }))}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                placeholder="Нэмэлт тэмдэглэл (жишээ: Гаальд саатсан) — товших үе шатанд хавсаргана"
                                                                                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mb-3 outline-none focus:ring-2 focus:ring-costco-blue"
                                                                            />
                                                                            {/* Courier tracking number — links the order to the шуудан/courier system. */}
                                                                            <div className="flex gap-2 mb-3" onClick={(e) => e.stopPropagation()}>
                                                                                <input
                                                                                    type="text"
                                                                                    value={trackingDraft[order.id] ?? order.trackingNumber ?? ''}
                                                                                    onChange={(e) => setTrackingDraft(prev => ({ ...prev, [order.id]: e.target.value }))}
                                                                                    placeholder="Курьер tracking дугаар"
                                                                                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue"
                                                                                />
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleSaveTracking(order.id); }}
                                                                                    className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 shrink-0"
                                                                                >Хадгалах</button>
                                                                            </div>
                                                                            {/* ETA — estimated delivery shown to the customer */}
                                                                            <div className="flex gap-2 mb-3" onClick={(e) => e.stopPropagation()}>
                                                                                <input
                                                                                    type="text"
                                                                                    value={etaDraft[order.id] ?? order.estimatedDelivery ?? ''}
                                                                                    onChange={(e) => setEtaDraft(prev => ({ ...prev, [order.id]: e.target.value }))}
                                                                                    placeholder="Хүргэх огноо (ETA), ж: 06-10 ~ 06-14"
                                                                                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue"
                                                                                />
                                                                                <button onClick={(e) => { e.stopPropagation(); handleSaveEta(order.id); }}
                                                                                    className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 shrink-0">Хадгалах</button>
                                                                            </div>
                                                                            {/* Additional charges (customs duty / weight difference) */}
                                                                            <div className="mb-3 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg" onClick={(e) => e.stopPropagation()}>
                                                                                <p className="text-xs font-bold text-gray-700 mb-1.5">Нэмэлт төлбөр (гааль, жин г.м)</p>
                                                                                {(order.additionalCharges || []).length > 0 && (
                                                                                    <div className="space-y-1 mb-2">
                                                                                        {(order.additionalCharges || []).map(c => (
                                                                                            <div key={c.id} className="flex items-center gap-2 text-xs">
                                                                                                <span className="flex-1 truncate text-gray-700">{c.label}</span>
                                                                                                <span className="tabular-nums font-bold text-gray-900">{Math.round(c.amount).toLocaleString()}₮</span>
                                                                                                <button onClick={(e) => { e.stopPropagation(); handleToggleChargePaid(order, c.id); }} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{c.paid ? 'Төлсөн' : 'Төлөөгүй'}</button>
                                                                                                <button onClick={(e) => { e.stopPropagation(); handleRemoveCharge(order, c.id); }} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                                <div className="flex gap-2">
                                                                                    <input type="text" value={chargeDraft[order.id]?.label ?? ''} onChange={(e) => setChargeDraft(prev => ({ ...prev, [order.id]: { ...prev[order.id], label: e.target.value } }))} placeholder="Тайлбар (ж: гаалийн татвар)" className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" />
                                                                                    <input type="number" value={chargeDraft[order.id]?.amount ?? ''} onChange={(e) => setChargeDraft(prev => ({ ...prev, [order.id]: { ...prev[order.id], amount: e.target.value } }))} placeholder="₮" className="w-24 text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" />
                                                                                    <button onClick={(e) => { e.stopPropagation(); handleAddCharge(order); }} className="px-3 py-2 rounded-lg text-xs font-bold bg-costco-blue text-white hover:bg-blue-700 shrink-0">Нэмэх</button>
                                                                                </div>
                                                                            </div>
                                                                            {/* Proof of delivery — captured when the parcel reaches the customer */}
                                                                            {stageKey === 'delivered' && (
                                                                                <div className="mb-3 p-2.5 bg-green-50 border border-green-200 rounded-lg" onClick={(e) => e.stopPropagation()}>
                                                                                    <p className="text-xs font-bold text-green-700 mb-1.5">Хүргэлтийн баталгаа</p>
                                                                                    <div className="flex gap-2 mb-2">
                                                                                        <input
                                                                                            type="text"
                                                                                            value={podDraft[order.id] ?? order.deliveredReceiver ?? ''}
                                                                                            onChange={(e) => setPodDraft(prev => ({ ...prev, [order.id]: e.target.value }))}
                                                                                            placeholder="Хүлээн авсан хүний нэр"
                                                                                            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                                                                                        />
                                                                                        <button onClick={(e) => { e.stopPropagation(); handleSavePod(order.id); }}
                                                                                            className="px-3 py-2 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 shrink-0">Хадгалах</button>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <label className="text-xs font-bold text-green-700 bg-white border border-green-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-green-50">
                                                                                            {podBusy ? 'Хадгалж байна...' : 'Зураг хавсаргах'}
                                                                                            <input type="file" accept="image/*" className="hidden" disabled={podBusy}
                                                                                                onChange={(e) => handlePodPhoto(order.id, e.target.files?.[0])} />
                                                                                        </label>
                                                                                        {order.deliveredPhoto && (
                                                                                            <a href={order.deliveredPhoto} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700 underline" onClick={(e) => e.stopPropagation()}>Зураг харах</a>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                            {/* Return request from the customer */}
                                                                            {order.returnRequest && (
                                                                                <div className="mb-3 p-2.5 bg-orange-50 border border-orange-200 rounded-lg" onClick={(e) => e.stopPropagation()}>
                                                                                    <div className="flex items-center justify-between">
                                                                                        <p className="text-xs font-bold text-orange-700">Буцаалтын хүсэлт {order.returnRequest.status === 'resolved' ? '(шийдвэрлэсэн)' : ''}</p>
                                                                                        {order.returnRequest.status !== 'resolved' && (
                                                                                            <button onClick={(e) => { e.stopPropagation(); handleResolveReturn(order); }} className="text-[11px] font-bold text-green-700 bg-green-100 rounded px-2 py-0.5 hover:bg-green-200">Шийдсэн</button>
                                                                                        )}
                                                                                    </div>
                                                                                    {order.returnRequest.reason && <p className="text-xs text-orange-600 mt-1">{order.returnRequest.reason}</p>}
                                                                                </div>
                                                                            )}
                                                                            {/* Exception states (hold / failed / returned) */}
                                                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                                                {EXCEPTION_STAGES.map(s => (
                                                                                    <button
                                                                                        key={s.key}
                                                                                        onClick={(e) => { e.stopPropagation(); handleSetStage(order.id, s.key); }}
                                                                                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${stageKey === s.key ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300 hover:text-amber-700'}`}
                                                                                    >{s.label}</button>
                                                                                ))}
                                                                            </div>
                                                                            <div className="flex items-center justify-between">
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleCancel(order.id); }}
                                                                                    className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition"
                                                                                >
                                                                                    <XCircle size={14} /> Захиалга цуцлах
                                                                                </button>
                                                                                <div className="font-bold text-lg text-gray-900">
                                                                                    Нийт: {(order.total || 0).toLocaleString()}{order.currency === 'KRW' ? '₩' : '₮'}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Right: live timeline preview (what the customer sees) */}
                                                                    <div>
                                                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Хэрэглэгчийн харах байдал</p>
                                                                        <OrderTracking order={order} />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {filteredOrders.length === 0 && (
                                    <div className="text-center py-12 text-gray-500">
                                        Захиалга олдсонгүй.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Customs documents modal (Commercial Invoice + Packing List) */}
                        {showCustoms && (
                            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCustoms(false)}>
                                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
                                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><FileText size={18} /> Гаалийн бичиг — {selected.size} захиалга</h3>
                                        <button onClick={() => setShowCustoms(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
                                    </div>
                                    <div className="p-4 space-y-3 text-sm">
                                        {/* Which documents to generate */}
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                            <p className="text-xs font-bold text-gray-600 mb-2">Гаргах баримт</p>
                                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                                                {[['manifest', 'Шуудангийн Manifest'], ['invoice', 'Commercial Invoice'], ['packing', 'Packing List']].map(([k, label]) => (
                                                    <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                                                        <input type="checkbox" checked={!!customsCfg.include[k]} onChange={() => toggleInclude(k)} className="w-4 h-4 accent-costco-blue" />
                                                        <span>{label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            {customsCfg.include.manifest && (
                                                <div className="mt-3 space-y-2">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600 mb-1">Татваргүй босго (₮)</label>
                                                        <input type="number" value={customsCfg.dutyFreeThresholdMNT} onChange={(e) => cfg('dutyFreeThresholdMNT', e.target.value)}
                                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="660000" />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-600 mb-1">Гаалийн татвар (%)</label>
                                                            <input type="number" value={customsCfg.dutyRate} onChange={(e) => cfg('dutyRate', e.target.value)}
                                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="5" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-600 mb-1">НӨАТ (%)</label>
                                                            <input type="number" value={customsCfg.vatRate} onChange={(e) => cfg('vatRate', e.target.value)}
                                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="10" />
                                                        </div>
                                                    </div>
                                                    <p className="text-[11px] text-gray-400">Хувь хүнд босго хүртэл татваргүй (10× доод цалин). Татвартай илгээмжид гаалийн татвар + НӨАТ ойролцоогоор тооцно.</p>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Экспортлогч (нэр)</label>
                                            <input value={customsCfg.exporterName} onChange={(e) => cfg('exporterName', e.target.value)}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="Компанийн нэр" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Экспортлогч (хаяг)</label>
                                            <textarea value={customsCfg.exporterAddress} onChange={(e) => cfg('exporterAddress', e.target.value)} rows={2}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="Солонгос дахь хаяг" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Хүлээн авагч (нэр)</label>
                                            <input value={customsCfg.consigneeName} onChange={(e) => cfg('consigneeName', e.target.value)}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="Монгол дахь хүлээн авагч" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Хүлээн авагч (хаяг)</label>
                                            <textarea value={customsCfg.consigneeAddress} onChange={(e) => cfg('consigneeAddress', e.target.value)} rows={2}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="Улаанбаатар дахь хаяг" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">Валют</label>
                                                <select value={customsCfg.currency} onChange={(e) => cfg('currency', e.target.value)}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue">
                                                    <option value="KRW">₩ KRW (вон)</option>
                                                    <option value="USD">$ USD</option>
                                                </select>
                                            </div>
                                            {customsCfg.currency === 'USD' && (
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600 mb-1">1 USD = ₩</label>
                                                    <input type="number" value={customsCfg.usdRate} onChange={(e) => cfg('usdRate', e.target.value)}
                                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="1350" />
                                                </div>
                                            )}
                                        </div>
                                        <label className="flex items-start gap-2 cursor-pointer bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                            <input type="checkbox" checked={!!customsCfg.useCostValue} onChange={(e) => cfg('useCostValue', e.target.checked)} className="w-4 h-4 accent-costco-blue mt-0.5" />
                                            <span className="text-xs text-gray-700">Costco өртгөөр мэдүүлэх <span className="text-gray-400">(борлуулах үнийн оронд бараанд оруулсан Costco өртгийг ашиглана; өртөг байхгүй бол борлуулах үнэ)</span></span>
                                        </label>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Гарал үүсэл (Origin)</label>
                                            <input value={customsCfg.originCountry} onChange={(e) => cfg('originCountry', e.target.value)}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="Republic of Korea" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">Incoterm</label>
                                                <input value={customsCfg.incoterm} onChange={(e) => cfg('incoterm', e.target.value)}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" placeholder="FOB Incheon, Korea" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">Нэхэмжлэхийн дугаар</label>
                                                <input value={customsCfg.invoiceNo} onChange={(e) => cfg('invoiceNo', e.target.value)}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-costco-blue" />
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-400">HS код, англи нэр, жинг бараа бүрийн бүртгэлээс автоматаар татна. Дутуу байвал бүтээгдэхүүний засвар хэсэгт нөхөж оруулна уу.</p>
                                    </div>
                                    <div className="p-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
                                        <button onClick={() => setShowCustoms(false)} className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100">Болих</button>
                                        <button onClick={handleDownloadCSV} className="px-4 py-2 rounded-lg bg-green-50 text-green-700 border border-green-200 font-bold hover:bg-green-100 flex items-center gap-1">
                                            <FileText size={16} /> CSV татах
                                        </button>
                                        <button onClick={handleGenerateCustoms} className="px-4 py-2 rounded-lg bg-costco-blue text-white font-bold hover:bg-blue-700 flex items-center gap-1">
                                            <FileText size={16} /> Хэвлэх
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
